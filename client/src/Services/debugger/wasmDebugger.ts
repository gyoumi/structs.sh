import { BackendState, BackendTypeDeclaration } from '@/visualiser-debugger/Types/backendType';
import { Debugger, DebuggerEvents, SourceFile } from './types';
import { loadFonts as loadAllFonts } from './loadFonts';
import { Compiler, CompilerStatus } from './wasm/compiler';
import { createWorkerCompiler } from './wasm/workerCompiler';
import { Recording, RunEnd, Step, TIME_LIMIT_MS } from './wasm/recording';
import { createRunnerPool, RecordResult, recordInWorker } from './wasm/workerRunner';

/**
 * Extra time the worker gets past the recorder's own time limit, so the
 * recorder normally stops the program first and keeps its steps.
 */
const WORKER_GRACE_MS = 2_000;

/** What the program reads from stdin: the text typed so far, and whether end-of-file was sent. */
export type Input = { text: string; eof: boolean };

/** Records a compiled, instrumented program. */
export type Recorder = ((
  wasm: Uint8Array<ArrayBuffer>,
  options: { signal: AbortSignal; input: Input }
) => Promise<RecordResult>) & {
  /** Settles once what the next run needs has loaded, or failed to. */
  whenReady?: () => Promise<void>;
  /** Stops anything the recorder started ahead of its next run. */
  dispose?: () => void;
};

/**
 * Records in runner workers, the next one started now, alongside the compiler
 * preload, so runs don't fetch anything and keep working offline.
 */
const createWorkerRecorder = (): Recorder => {
  const runners = createRunnerPool();
  const record: Recorder = (wasm, options) =>
    recordInWorker(
      wasm,
      { ...options, timeLimitMs: TIME_LIMIT_MS + WORKER_GRACE_MS },
      runners.take
    );
  record.whenReady = runners.whenReady;
  record.dispose = runners.dispose;
  return record;
};

/**
 * What the page is told while the compiler is ready but the runner or fonts
 * aren't yet: nearly done.
 */
const NEARLY_READY: CompilerStatus = { state: 'loading', done: 99, total: 100 };

const TOO_LONG = `The program was stopped because it ran for too long (over ${TIME_LIMIT_MS / 1000} seconds).`;

/** What to tell the student once stepping reaches the end of a recording. */
const describeEnd = (end: RunEnd) => {
  if ('exitCode' in end) return `\nThe program finished with exit code ${end.exitCode}.\n`;
  if ('crashed' in end) return `\nThe program crashed: ${end.crashed}\n`;
  if ('stepLimit' in end) {
    return `\nThe program was stopped after ${end.stepLimit.toLocaleString('en')} steps, the most the debugger records.\n`;
  }
  if ('sizeLimit' in end) {
    return '\nThe program was stopped because its memory changed too much for the debugger to record every step.\n';
  }
  return `\n${TOO_LONG}\n`;
};

/** What to tell the student when a program couldn't be recorded at all. */
const describeFailure = (result: Exclude<RecordResult, { recording: Recording }>) => {
  if ('timedOut' in result) return `\n${TOO_LONG}\n`;
  if ('stopped' in result) return '\nThe program was stopped.\n';
  return `\nThe program could not be run: ${result.error}\n`;
};

/**
 * The page's view of one step.
 *
 * stack_data and heap_data are in the format the GDB debugger used to send
 * (`{ addr, typeName, value }`), which is what the page reads, though
 * BackendState's types describe an older one.
 */
const stateAt = (file: SourceFile, step: Step): BackendState => ({
  frame_info: {
    file: file.name,
    line: file.code.split('\n')[step.line - 1] ?? '',
    line_num: step.line,
    function: step.function,
  },
  stack_data: step.variables as unknown as BackendState['stack_data'],
  heap_data: step.heap as unknown as BackendState['heap_data'],
});

/** A compiled program being recorded, then stepped through. */
type Session = {
  file: SourceFile;
  wasm: Uint8Array<ArrayBuffer>;
  /** Typing more records the program again from the start, with it all. */
  input: Input;
  recording: Promise<RecordResult>;
  stopRecording: AbortController;
  /** The step the next step() shows. */
  next: number;
  /**
   * The last step whose preceding output was shown, and how much of it: a
   * statement waiting for input can print more once it gets it.
   */
  outputShownAt: number;
  outputShownLength: number;
  /** The paused state last shown (a recording's end.at), so it's shown once. */
  pausedShown: Step | null;
  ended: boolean;
};

/**
 * The debugger that runs entirely in the browser. Compiling records the whole
 * run of the program, and each step replays the next statement from it.
 * Stepping back is handled by the page, which keeps the states it was sent.
 */
export class WasmDebugger implements Debugger {
  private events: DebuggerEvents | null = null;

  /** Counts starts, so only the latest compile's result is reported. */
  private latestStart = 0;

  private session: Session | null = null;

  /** The compiler's own latest news about its download. */
  private compilerReport: CompilerStatus | null = null;

  /** Whether the runner and the fonts have loaded, or failed to. */
  private othersSettled = false;

  /** The status last reported, for events set later. */
  private compilerStatus: CompilerStatus | null = null;

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

  /** Reports the compiler's status, as loading until the others have settled. */
  private reportStatus() {
    const status = this.compilerReport;
    if (!status) return;
    this.compilerStatus = status.state === 'ready' && !this.othersSettled ? NEARLY_READY : status;
    this.events?.compilerStatus(this.compilerStatus);
  }

  setEvents(events: DebuggerEvents) {
    this.events = events;
    if (this.compilerStatus) events.compilerStatus(this.compilerStatus);
  }

  start(file: SourceFile) {
    this.endSession();
    this.latestStart += 1;
    const thisStart = this.latestStart;
    this.compiler.compile(file.name, file.code).then((result) => {
      if (thisStart !== this.latestStart) return;
      if (!result.ok) {
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
      next: 0,
      outputShownAt: -1,
      outputShownLength: 0,
      pausedShown: null,
      ended: false,
    };
    this.session = session;
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
      const current = session === this.session && session.recording === recording;
      if (current && !session.ended && !('recording' in result)) {
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
    const { session } = this;
    if (!session || session.ended) return false;
    const result = await WasmDebugger.latestRecording(session);
    if (session !== this.session || session.ended || !('recording' in result)) return false;

    const { steps, outputBeforeFirstStep, end } = result.recording;
    const index = session.next;

    // What the statement just stepped over printed, each part once.
    const output = (index === 0 ? outputBeforeFirstStep : steps[index - 1]?.output) ?? '';
    if (index > session.outputShownAt) {
      session.outputShownAt = index;
      session.outputShownLength = 0;
    }
    if (index === session.outputShownAt && output.length > session.outputShownLength) {
      this.events?.output(output.slice(session.outputShownLength));
      session.outputShownLength = output.length;
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

    session.next += 1;
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
    session.ended = true;
    this.events?.output(message);
    this.events?.sessionEnded();
  }

  /** Forgets the current session, stopping its recording if it's running. */
  private endSession() {
    const { session } = this;
    this.session = null;
    session?.stopRecording.abort();
  }

  /** A line typed in the console, without its newline. */
  sendStdin(line: string) {
    const { session } = this;
    if (!session || session.ended || session.input.eof) return;
    session.input.text += `${line}\n`;
    this.rerecord(session);
  }

  sendEOF() {
    const { session } = this;
    if (!session || session.ended || session.input.eof) return;
    session.input.eof = true;
    this.rerecord(session);
  }

  interrupt() {
    // Also cancels a compile in progress, so its program doesn't start.
    this.latestStart += 1;
    // Ctrl+C ends the session, whether its recording is still running or
    // the program is waiting for input, as the page does.
    const { session } = this;
    if (!session || session.ended) return;
    this.finish(session, '\nThe program was stopped.\n');
    session.stopRecording.abort();
  }

  close() {
    this.events = null;
    this.latestStart += 1;
    this.endSession();
    this.compiler.dispose();
    this.recorder.dispose?.();
  }
}
