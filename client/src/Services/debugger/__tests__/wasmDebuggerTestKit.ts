import { vi } from 'vitest';
import { DebuggerEvents } from '../types';
import { Recorder, WasmDebugger } from '../wasmDebugger';
import { CompileResult, Compiler, CompilerStatus } from '../wasm/compilerTypes';
import type { Recording } from '../wasm/recording';
import { FakeRunnerWorker } from '../wasm/__tests__/runnerTestKit';
import { createStandbyRunner, recordInWorker, RecordResult } from '../wasm/workerRunner';

// Helpers for the wasmDebugger.*.test.ts files.

export const createEvents = (): DebuggerEvents => ({
  sessionStarted: vi.fn(),
  compileError: vi.fn(),
  output: vi.fn(),
  state: vi.fn(),
  typeDeclaration: vi.fn(),
  sessionEnded: vi.fn(),
  compilerStatus: vi.fn(),
});

/** Each state the page was sent, as "function:line". */
export const statesShown = (events: DebuggerEvents) =>
  vi
    .mocked(events.state)
    .mock.calls.map(([state]) => `${state.location.function}:${state.location.lineNumber}`);

/** Every call to events.output, in order, with all its arguments. */
export const outputCalls = (events: DebuggerEvents) => vi.mocked(events.output).mock.calls;

export const compilerReturning = (result: CompileResult): Compiler => ({
  compile: vi.fn(async () => result),
  preload: vi.fn(),
  dispose: vi.fn(),
});

/** A compiler whose compiles finish only when the test says so. */
export const controlledCompiler = () => {
  const finishers: ((result: CompileResult) => void)[] = [];
  const compiler: Compiler = {
    compile: vi.fn(
      () =>
        new Promise<CompileResult>((resolve) => {
          finishers.push(resolve);
        })
    ),
    preload: vi.fn(),
    dispose: vi.fn(),
  };
  return { compiler, finish: (index: number, result: CompileResult) => finishers[index](result) };
};

export const COMPILED: CompileResult = { ok: true, wasm: new Uint8Array() };

export const HELLO_SOURCE = 'int main(void) {\n    puts("hi");\n    return 0;\n}\n';

/** What recording HELLO_SOURCE gives. */
export const HELLO: Recording = {
  steps: [
    { function: 'main', line: 2, depth: 0, output: 'hi\n', variables: {}, heap: {} },
    { function: 'main', line: 3, depth: 0, output: '', variables: {}, heap: {} },
  ],
  outputBeforeFirstStep: '',
  end: { exitCode: 0 },
  types: [],
};

export const recorderReturning =
  (recording: Recording): Recorder =>
  async () => ({ recording });

/** A recorder whose runner has already loaded, returning `recording`. */
export const loadedRecorder = (recording: Recording = HELLO): Recorder =>
  Object.assign(recorderReturning(recording), { whenReady: async () => {} });

/** A recorder whose recordings finish when the test says, or when cancelled. */
export const controlledRecorder = () => {
  const signals: AbortSignal[] = [];
  const finishers: ((result: RecordResult) => void)[] = [];
  const recorder: Recorder = (_wasm, { signal }) =>
    new Promise<RecordResult>((resolve) => {
      signals.push(signal);
      finishers.push(resolve);
      signal.addEventListener('abort', () => resolve({ stopped: true }));
    });
  return {
    recorder,
    signals,
    finish: (index: number, result: RecordResult) => finishers[index](result),
  };
};

/** A promise the test settles, for something the debugger loads ahead of time. */
export const loading = () => {
  let loaded: () => void = () => {};
  let failed: (error: Error) => void = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    loaded = resolve;
    failed = reject;
  });
  promise.catch(() => {});
  return { promise, loaded: () => loaded(), failed: (reason: string) => failed(new Error(reason)) };
};

/** A recorder whose runner worker, started ahead of the first run, loads when the test says. */
export const recorderLoading = () => {
  const runner = loading();
  const recorder: Recorder = Object.assign(recorderReturning(HELLO), {
    whenReady: () => runner.promise,
  });
  return { recorder, ...runner };
};

/** A compiler whose download the test reports on, through preload's callback. */
export const compilerReporting = () => {
  let report: (status: CompilerStatus) => void = () => {};
  const compiler = compilerReturning(COMPILED);
  vi.mocked(compiler.preload).mockImplementation((onStatus) => {
    report = onStatus;
  });
  return { compiler, report: (status: CompilerStatus) => report(status) };
};

/**
 * A recorder like the page's: a real standby runner, with fake workers listed in
 * the order it started them.
 */
export const standbyRecorder = () => {
  const workers: FakeRunnerWorker[] = [];
  const standby = createStandbyRunner(() => {
    const worker = new FakeRunnerWorker();
    workers.push(worker);
    return worker;
  });
  const recorder: Recorder = Object.assign(
    (
      wasm: Uint8Array<ArrayBuffer>,
      options: { signal: AbortSignal; input: { text: string; eof: boolean } }
    ) => recordInWorker(wasm, { ...options, timeLimitMs: 60_000 }, standby.take),
    { whenReady: standby.whenReady, dispose: standby.dispose }
  );
  return { recorder, workers };
};

export const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/** A WasmDebugger sending to `events`, started on `name` and given time to compile and record. */
export const startedDebugger = async (
  events: DebuggerEvents,
  recorder: Recorder,
  name = 'hello.c',
  code = HELLO_SOURCE
) => {
  const wasm = new WasmDebugger(compilerReturning(COMPILED), recorder);
  wasm.setEvents(events);
  wasm.start({ name, code });
  await flush();
  return wasm;
};
