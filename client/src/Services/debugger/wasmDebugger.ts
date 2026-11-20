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

const NEARLY_READY: CompilerStatus = { state: 'loading', done: 99, total: 100 };

type Session = {
  file: SourceFile;
  wasm: Uint8Array<ArrayBuffer>;
  input: Input;
  recording: Promise<RecordResult>;
  stopRecording: AbortController;
  next: { stepNumber: number; growingOutputShown: number };
  pausedShown: Step | null;
};

type DebuggerStage =
  | { stage: 'idle' }
  | { stage: 'compiling' }
  | { stage: 'stepping'; session: Session }
  | { stage: 'ended'; session: Session };

export class WasmDebugger implements Debugger {
  private events: DebuggerEvents | null = null;

  private stage: DebuggerStage = { stage: 'idle' };

  private compilerReport: CompilerStatus | null = null;

  private runnerAndFontsSettled = false;

  constructor(
    private readonly compiler: Compiler = createWorkerCompiler(),
    private readonly recorder: Recorder = createWorkerRecorder(),
    loadFonts: () => Promise<unknown> = loadAllFonts
  ) {
    compiler.preload((status) => {
      this.compilerReport = status;
      this.reportStatus();
    });
    const runnerAndFonts = [() => recorder.whenReady?.(), loadFonts].map((load) =>
      Promise.resolve().then(load)
    );
    Promise.allSettled(runnerAndFonts).then(() => {
      this.runnerAndFontsSettled = true;
      this.reportStatus();
    });
  }

  private get compilerStatus(): CompilerStatus | null {
    const status = this.compilerReport;
    if (!status) return null;
    return status.state === 'ready' && !this.runnerAndFontsSettled ? NEARLY_READY : status;
  }

  private reportStatus() {
    const status = this.compilerStatus;
    if (status) this.events?.compilerStatus(status);
  }

  private get stepping(): Session | null {
    return this.stage.stage === 'stepping' ? this.stage.session : null;
  }

  private isStillCurrent(compiling: DebuggerStage) {
    return this.stage === compiling;
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
      if (!this.isStillCurrent(compiling)) return;
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
      next: { stepNumber: 0, growingOutputShown: 0 },
      pausedShown: null,
    };
    this.stage = { stage: 'stepping', session };
    this.rerecordKeepingStepNumber(session);
  }

  private rerecordKeepingStepNumber(session: Session) {
    session.stopRecording.abort();
    const stopRecording = new AbortController();
    const recording = this.recorder(session.wasm, {
      signal: stopRecording.signal,
      input: { ...session.input },
    });
    Object.assign(session, { recording, stopRecording });
    recording.then((result) => {
      const current = session === this.stepping && session.recording === recording;
      if (current && !('recording' in result)) {
        this.finish(session, describeFailure(result));
      }
    });
  }

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
    const index = session.next.stepNumber;

    const output = (index === 0 ? outputBeforeFirstStep : steps[index - 1]?.output) ?? '';
    if (output.length > session.next.growingOutputShown) {
      this.events?.output(output.slice(session.next.growingOutputShown));
      session.next.growingOutputShown = output.length;
    }

    if (index >= steps.length && 'waitingForInput' in end) {
      return this.showPausedOnce(session, end.at);
    }

    session.next = { stepNumber: index + 1, growingOutputShown: 0 };
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

  private showPausedOnce(session: Session, at: Step | undefined) {
    if (!at || at === session.pausedShown) return false;
    session.pausedShown = at;
    this.events?.state(stateAt(session.file, at));
    return true;
  }

  private finish(session: Session, message: string) {
    this.stage = { stage: 'ended', session };
    this.events?.output(message);
    this.events?.sessionEnded();
  }

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
    this.rerecordKeepingStepNumber(session);
  }

  sendEOF() {
    const session = this.stepping;
    if (!session || session.input.eof) return;
    session.input.eof = true;
    this.rerecordKeepingStepNumber(session);
  }

  interrupt() {
    if (this.stage.stage === 'compiling') this.stage = { stage: 'idle' };
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
