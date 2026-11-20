import { BackendTypeDeclaration } from '@/visualiser-debugger/Types/backendType';
import { Debugger, DebuggerEvents, SourceFile } from './types';
import { loadFonts as loadAllFonts } from './loadFonts';
import { describeEnd, describeFailure, stateAt } from './showRecording';
import { Compiler, CompilerStatus } from './wasm/compiler';
import { createWorkerCompiler } from './wasm/workerCompiler';
import { Step } from './wasm/recording';
import { RecordResult } from './wasm/workerRunner';
import { createWorkerRecorder, Input, Recorder } from './workerRecorder';

export type { Input, Recorder } from './workerRecorder';

/**
 * What the page is told while the compiler is ready but the runner or fonts
 * aren't yet: nearly done.
 */
const NEARLY_READY: CompilerStatus = { state: 'loading', done: 99, total: 100 };

/** A compiled program being recorded, then stepped through. */
type Session = {
  file: SourceFile;
  wasm: Uint8Array<ArrayBuffer>;
  /** Typing more records the program again from the start, with it all. */
  input: Input;
  recording: Promise<RecordResult>;
  stopRecording: AbortController;
  /**
   * The step the next step() shows, and how much of the output before it was
   * shown: a statement waiting for input can print more once it gets it.
   */
  next: { step: number; outputShown: number };
  /** The paused state last shown (a recording's end.at), so it's shown once. */
  pausedShown: Step | null;
};

/**
 * Where the debugger is: with nothing started; compiling (each start has its
 * own stage, so only the latest compile's result is reported); stepping
 * through a session; or with the session ended and why it ended shown.
 */
type DebuggerStage =
  | { stage: 'idle' }
  | { stage: 'compiling' }
  | { stage: 'stepping'; session: Session }
  | { stage: 'ended'; session: Session };

/**
 * The debugger that runs entirely in the browser. Compiling records the whole
 * run of the program, and each step replays the next statement from it.
 * Stepping back is handled by the page, which keeps the states it was sent.
 */
export class WasmDebugger implements Debugger {
  private events: DebuggerEvents | null = null;

  private stage: DebuggerStage = { stage: 'idle' };

  /** The compiler's own latest news about its download. */
  private compilerReport: CompilerStatus | null = null;

  /** Whether the runner and the fonts have loaded, or failed to. */
  private othersSettled = false;

  constructor(
    private readonly compiler: Compiler = createWorkerCompiler(),
    private readonly recorder: Recorder = createWorkerRecorder(),
    loadFonts: () => Promise<unknown> = loadAllFonts
  ) {
    // Start the download when the page opens, not when Compile is clicked.
    compiler.preload((status) => {
      this.compilerReport = status;
      this.reportStatus();
    });
    // Likewise the runner and the fonts, so nothing is fetched mid-session,
    // as when offline. The page says ready only once they have loaded too; one
    // that fails doesn't hold it up, as the run or text then says why itself.
    const others = [() => recorder.whenReady?.(), loadFonts].map((load) =>
      Promise.resolve().then(load)
    );
    Promise.allSettled(others).then(() => {
      this.othersSettled = true;
      this.reportStatus();
    });
  }

  /** The compiler's status, as loading until the others have settled. */
  private get compilerStatus(): CompilerStatus | null {
    const status = this.compilerReport;
    if (!status) return null;
    return status.state === 'ready' && !this.othersSettled ? NEARLY_READY : status;
  }

  private reportStatus() {
    const status = this.compilerStatus;
    if (status) this.events?.compilerStatus(status);
  }

  /** The session being stepped through, if there is one that hasn't ended. */
  private get stepping(): Session | null {
    return this.stage.stage === 'stepping' ? this.stage.session : null;
  }

  setEvents(events: DebuggerEvents) {
    this.events = events;
    const status = this.compilerStatus;
    if (status) events.compilerStatus(status);
  }

  start(file: SourceFile) {
    this.endSession();
    const compiling: DebuggerStage = { stage: 'compiling' };
    this.stage = compiling;
    this.compiler.compile(file.name, file.code).then((result) => {
      if (this.stage !== compiling) return;
      if (!result.ok) {
        this.stage = { stage: 'idle' };
        this.events?.compileError([result.errors]);
        return;
      }
      this.events?.sessionStarted();
      this.record(file, result.wasm);
    });
  }

  private record(file: SourceFile, wasm: Uint8Array<ArrayBuffer>) {
    const session: Session = {
      file,
      wasm,
      input: { text: '', eof: false },
      recording: Promise.resolve({ stopped: true }),
      stopRecording: new AbortController(),
      next: { step: 0, outputShown: 0 },
      pausedShown: null,
    };
    this.stage = { stage: 'stepping', session };
    this.rerecord(session);
  }

  /**
   * Records the session's program with all its input so far, replacing any
   * recording still running. The program runs the same way up to where the
   * last recording stopped, so stepping carries on from the same step.
   */
  private rerecord(session: Session) {
    session.stopRecording.abort();
    const stopRecording = new AbortController();
    const recording = this.recorder(session.wasm, {
      signal: stopRecording.signal,
      input: { ...session.input },
    });
    Object.assign(session, { recording, stopRecording });
    // Without a recording there is nothing to step through, so say why now.
    recording.then((result) => {
      const current = session === this.stepping && session.recording === recording;
      if (current && !('recording' in result)) {
        this.finish(session, describeFailure(result));
      }
    });
  }

  /** The session's latest recording, waiting again if input replaces it meanwhile. */
  private static async latestRecording(session: Session) {
    let recording: Promise<RecordResult>;
    let result: RecordResult;
    do {
      recording = session.recording;
      // eslint-disable-next-line no-await-in-loop
      result = await recording;
    } while (recording !== session.recording);
    return result;
  }

  async step() {
    const session = this.stepping;
    if (!session) return false;
    const result = await WasmDebugger.latestRecording(session);
    if (session !== this.stepping || !('recording' in result)) return false;

    const { steps, outputBeforeFirstStep, end } = result.recording;
    const index = session.next.step;

    // What the statement just stepped over printed, each part once.
    const output = (index === 0 ? outputBeforeFirstStep : steps[index - 1]?.output) ?? '';
    if (output.length > session.next.outputShown) {
      this.events?.output(output.slice(session.next.outputShown));
      session.next.outputShown = output.length;
    }

    // The program is waiting for input: typing it records the program again.
    if (index >= steps.length && 'waitingForInput' in end) {
      // Paused somewhere the last step doesn't show, so show it once, as a
      // view rather than a step: the next step after more input is typed is
      // still the one at session.next. A state was sent, so say so, as the
      // page only moves on when step() resolves true.
      if (end.at && end.at !== session.pausedShown) {
        session.pausedShown = end.at;
        this.events?.state(stateAt(session.file, end.at));
        return true;
      }
      return false;
    }

    session.next = { step: index + 1, outputShown: 0 };
    if (index < steps.length) {
      if (index === 0) {
        result.recording.types.forEach((type) =>
          this.events?.typeDeclaration({
            ...type,
            file: session.file.name,
            line_num: '',
            original_line: '',
          } as BackendTypeDeclaration)
        );
      }
      this.events?.state(stateAt(session.file, steps[index]));
      return true;
    }
    this.finish(session, describeEnd(end));
    return false;
  }

  /** Ends the session with a message saying why. */
  private finish(session: Session, message: string) {
    this.stage = { stage: 'ended', session };
    this.events?.output(message);
    this.events?.sessionEnded();
  }

  /** Forgets the current session, stopping its recording if it's running. */
  private endSession() {
    const { stage } = this;
    this.stage = { stage: 'idle' };
    if (stage.stage === 'stepping' || stage.stage === 'ended') stage.session.stopRecording.abort();
  }

  /** A line typed in the console, without its newline. */
  sendStdin(line: string) {
    const session = this.stepping;
    if (!session || session.input.eof) return;
    session.input.text += `${line}\n`;
    this.rerecord(session);
  }

  sendEOF() {
    const session = this.stepping;
    if (!session || session.input.eof) return;
    session.input.eof = true;
    this.rerecord(session);
  }

  interrupt() {
    // Also cancels a compile in progress, so its program doesn't start.
    if (this.stage.stage === 'compiling') this.stage = { stage: 'idle' };
    // Ctrl+C ends the session, whether its recording is still running or
    // the program is waiting for input, as the page does.
    const session = this.stepping;
    if (!session) return;
    this.finish(session, '\nThe program was stopped.\n');
    session.stopRecording.abort();
  }

  close() {
    this.events = null;
    this.endSession();
    this.compiler.dispose();
    this.recorder.dispose?.();
  }
}
