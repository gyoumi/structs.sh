import { Debugger, DebuggerEvents, SourceFile } from './types';
import { Compiler, CompilerStatus } from './wasm/compiler';
import { createWorkerCompiler } from './wasm/workerCompiler';
import { RunResult, runInWorker } from './wasm/workerRunner';

/** How long a program may run before it is stopped. */
const RUN_TIME_LIMIT_MS = 10_000;

/** Runs a compiled program, writing its output as it goes. */
export type Runner = (
  wasm: Uint8Array<ArrayBuffer>,
  options: { onOutput: (text: string) => void; signal: AbortSignal }
) => Promise<RunResult>;

const runWithTimeLimit: Runner = (wasm, options) =>
  runInWorker(wasm, { ...options, timeLimitMs: RUN_TIME_LIMIT_MS });

/** What to tell the student when a run didn't end normally, if anything. */
const describeRunEnd = (result: RunResult) => {
  if ('timedOut' in result) {
    return `\nThe program was stopped because it ran for too long (over ${RUN_TIME_LIMIT_MS / 1000} seconds).\n`;
  }
  if ('error' in result) return `\nThe program crashed: ${result.error}\n`;
  return null;
};

/**
 * The debugger that runs entirely in the browser. It compiles and runs
 * programs, but doesn't step them yet (see docs/debugger-rewrite.md).
 */
export class WasmDebugger implements Debugger {
  readonly kind = 'wasm';

  private events: DebuggerEvents | null = null;

  /** Counts starts, so only the latest compile's result is reported. */
  private latestStart = 0;

  /** Stops the program that is running, if any. */
  private currentRun: AbortController | null = null;

  /** The latest news about the compiler's download, for events set later. */
  private compilerStatus: CompilerStatus | null = null;

  constructor(
    private readonly compiler: Compiler = createWorkerCompiler(),
    private readonly runner: Runner = runWithTimeLimit
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

  start({ name, code }: SourceFile) {
    this.stopRun();
    this.latestStart += 1;
    const thisStart = this.latestStart;
    this.compiler.compile(name, code).then((result) => {
      if (thisStart !== this.latestStart) return;
      if (!result.ok) {
        this.events?.compileError([result.errors]);
        return;
      }
      this.events?.sessionStarted();
      this.run(result.wasm);
    });
  }

  private async run(wasm: Uint8Array<ArrayBuffer>) {
    const run = new AbortController();
    this.currentRun = run;
    const result = await this.runner(wasm, {
      signal: run.signal,
      onOutput: (text) => {
        if (!run.signal.aborted) this.events?.output(text);
      },
    });
    if (run.signal.aborted) return;
    this.currentRun = null;
    const message = describeRunEnd(result);
    if (message) this.events?.output(message);
  }

  private stopRun() {
    this.currentRun?.abort();
    this.currentRun = null;
  }

  step() {
    // Stepping arrives in checkpoint 2.
    return Promise.resolve(false);
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
    this.stopRun();
  }

  close() {
    this.events = null;
    this.latestStart += 1;
    this.stopRun();
    this.compiler.dispose();
  }
}
