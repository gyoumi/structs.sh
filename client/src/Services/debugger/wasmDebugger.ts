import { BackendState } from '@/visualiser-debugger/Types/backendType';
import { Debugger, DebuggerEvents, SourceFile } from './types';
import { Compiler, CompilerStatus } from './wasm/compiler';
import { createWorkerCompiler } from './wasm/workerCompiler';
import { Recording, RunEnd, Step, TIME_LIMIT_MS } from './wasm/recording';
import { RecordResult, recordInWorker } from './wasm/workerRunner';

/**
 * Extra time the worker gets past the recorder's own time limit, so the
 * recorder normally stops the program first and keeps its steps.
 */
const WORKER_GRACE_MS = 2_000;

/** Records a compiled, instrumented program. */
export type Recorder = (
  wasm: Uint8Array<ArrayBuffer>,
  options: { signal: AbortSignal }
) => Promise<RecordResult>;

const recordWithTimeLimit: Recorder = (wasm, options) =>
  recordInWorker(wasm, { ...options, timeLimitMs: TIME_LIMIT_MS + WORKER_GRACE_MS });

const TOO_LONG = `The program was stopped because it ran for too long (over ${TIME_LIMIT_MS / 1000} seconds).`;

/** What to tell the student once stepping reaches the end of a recording. */
const describeEnd = (end: RunEnd) => {
  if ('exitCode' in end) return `\nThe program finished with exit code ${end.exitCode}.\n`;
  if ('crashed' in end) return `\nThe program crashed: ${end.crashed}\n`;
  if ('stepLimit' in end) {
    return `\nThe program was stopped after ${end.stepLimit.toLocaleString('en')} steps, the most the debugger records.\n`;
  }
  return `\n${TOO_LONG}\n`;
};

/** What to tell the student when a program couldn't be recorded at all. */
const describeFailure = (result: Exclude<RecordResult, { recording: Recording }>) => {
  if ('timedOut' in result) return `\n${TOO_LONG}\n`;
  if ('stopped' in result) return '\nThe program was stopped.\n';
  return `\nThe program could not be run: ${result.error}\n`;
};

/** The page's view of one step. Variables and the heap come in checkpoint 3. */
const stateAt = (file: SourceFile, step: Step): BackendState => ({
  frame_info: {
    file: file.name,
    line: file.code.split('\n')[step.line - 1] ?? '',
    line_num: step.line,
    function: step.function,
  },
  stack_data: {},
  heap_data: {},
});

/** A compiled program being recorded, then stepped through. */
type Session = {
  file: SourceFile;
  recording: Promise<RecordResult>;
  stopRecording: AbortController;
  /** The step the next step() shows. */
  next: number;
  ended: boolean;
};

/**
 * The debugger that runs entirely in the browser. Compiling records the whole
 * run of the program, and each step replays the next statement from it.
 * Stepping back is handled by the page, which keeps the states it was sent.
 */
export class WasmDebugger implements Debugger {
  readonly kind = 'wasm';

  private events: DebuggerEvents | null = null;

  /** Counts starts, so only the latest compile's result is reported. */
  private latestStart = 0;

  private session: Session | null = null;

  /** The latest news about the compiler's download, for events set later. */
  private compilerStatus: CompilerStatus | null = null;

  constructor(
    private readonly compiler: Compiler = createWorkerCompiler(),
    private readonly recorder: Recorder = recordWithTimeLimit
  ) {
    // Start the download when the page opens, not when Compile is clicked.
    compiler.preload((status) => {
      this.compilerStatus = status;
      this.events?.compilerStatus(status);
    });
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
    const stopRecording = new AbortController();
    const session: Session = {
      file,
      recording: this.recorder(wasm, { signal: stopRecording.signal }),
      stopRecording,
      next: 0,
      ended: false,
    };
    this.session = session;
    // Without a recording there is nothing to step through, so say why now.
    session.recording.then((result) => {
      if (session === this.session && !('recording' in result)) {
        this.finish(session, describeFailure(result));
      }
    });
  }

  async step() {
    const { session } = this;
    if (!session || session.ended) return false;
    const result = await session.recording;
    if (session !== this.session || session.ended || !('recording' in result)) return false;

    const { steps, outputBeforeFirstStep, end } = result.recording;
    const index = session.next;
    session.next += 1;

    // What the statement just stepped over printed.
    const output = index === 0 ? outputBeforeFirstStep : steps[index - 1].output;
    if (output) this.events?.output(output);

    if (index < steps.length) {
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

  sendStdin() {
    // Input arrives in checkpoint 3.
  }

  sendEOF() {
    // Input arrives in checkpoint 3.
  }

  interrupt() {
    // Also cancels a compile in progress, so its program doesn't start.
    this.latestStart += 1;
    // A recording that's still running ends the session (see record()).
    this.session?.stopRecording.abort();
  }

  close() {
    this.events = null;
    this.latestStart += 1;
    this.endSession();
    this.compiler.dispose();
  }
}
