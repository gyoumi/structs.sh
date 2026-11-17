import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DebuggerEvents } from './types';
import { WasmDebugger } from './wasmDebugger';
import { CompileResult, Compiler } from './wasm/compiler';
import type { RunResult } from './wasm/workerRunner';
import type { Runner } from './wasmDebugger';

const createEvents = (): DebuggerEvents => ({
  sessionStarted: vi.fn(),
  compileError: vi.fn(),
  output: vi.fn(),
  state: vi.fn(),
  typeDeclaration: vi.fn(),
  sessionEnded: vi.fn(),
});

const compilerReturning = (result: CompileResult): Compiler => ({
  compile: vi.fn(async () => result),
  dispose: vi.fn(),
});

/** A compiler whose compiles finish only when the test says so. */
const controlledCompiler = () => {
  const finishers: ((result: CompileResult) => void)[] = [];
  const compiler: Compiler = {
    compile: vi.fn(
      () =>
        new Promise<CompileResult>((resolve) => {
          finishers.push(resolve);
        })
    ),
    dispose: vi.fn(),
  };
  return { compiler, finish: (index: number, result: CompileResult) => finishers[index](result) };
};

const COMPILED: CompileResult = { ok: true, wasm: new Uint8Array() };

/** A runner that writes `output`, then finishes with `result`. */
const runnerReturning =
  (result: RunResult, output: string[] = []): Runner =>
  async (_wasm, { onOutput }) => {
    output.forEach(onOutput);
    return result;
  };

/** A runner whose runs last until they are cancelled. */
const endlessRunner = () => {
  const signals: AbortSignal[] = [];
  const runner: Runner = (_wasm, { signal }) =>
    new Promise<RunResult>((resolve) => {
      signals.push(signal);
      signal.addEventListener('abort', () => resolve({ stopped: true }));
    });
  return { runner, signals };
};

const flush = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

describe('WasmDebugger', () => {
  let events: DebuggerEvents;

  beforeEach(() => {
    events = createEvents();
  });

  it('compiles the student’s file', async () => {
    const compiler = compilerReturning({ ok: true, wasm: new Uint8Array() });
    const wasm = new WasmDebugger(compiler);
    wasm.setEvents(events);

    wasm.start({ name: 'counter.c', code: 'int main(void) { return 0; }' });

    await vi.waitFor(() =>
      expect(compiler.compile).toHaveBeenCalledWith('counter.c', 'int main(void) { return 0; }')
    );
  });

  it('starts a session when the program compiles', async () => {
    const wasm = new WasmDebugger(compilerReturning({ ok: true, wasm: new Uint8Array() }));
    wasm.setEvents(events);

    wasm.start({ name: 'counter.c', code: '' });

    await vi.waitFor(() => expect(events.sessionStarted).toHaveBeenCalledOnce());
    expect(events.compileError).not.toHaveBeenCalled();
  });

  it('reports compile errors and does not start a session', async () => {
    const errors = "main.c:2:13: error: use of undeclared identifier 'x'";
    const wasm = new WasmDebugger(compilerReturning({ ok: false, errors }));
    wasm.setEvents(events);

    wasm.start({ name: 'main.c', code: '' });

    await vi.waitFor(() => expect(events.compileError).toHaveBeenCalledWith([errors]));
    expect(events.sessionStarted).not.toHaveBeenCalled();
  });

  it('ignores an earlier compile that finishes after a newer one has started', async () => {
    const { compiler, finish } = controlledCompiler();
    const wasm = new WasmDebugger(compiler);
    wasm.setEvents(events);

    wasm.start({ name: 'main.c', code: 'int main(void) { return 0; }' });
    wasm.start({ name: 'main.c', code: 'int main(void) { return x; }' });
    finish(1, { ok: false, errors: 'main.c:1: error' });
    finish(0, { ok: true, wasm: new Uint8Array() });
    await flush();

    expect(events.compileError).toHaveBeenCalledExactlyOnceWith(['main.c:1: error']);
    expect(events.sessionStarted).not.toHaveBeenCalled();
  });

  it('stops the compiler and reports nothing once closed', async () => {
    const { compiler, finish } = controlledCompiler();
    const wasm = new WasmDebugger(compiler);
    wasm.setEvents(events);

    wasm.start({ name: 'main.c', code: '' });
    wasm.close();
    finish(0, { ok: true, wasm: new Uint8Array() });
    await flush();

    expect(compiler.dispose).toHaveBeenCalledOnce();
    expect(events.sessionStarted).not.toHaveBeenCalled();
  });

  it('runs the program once it compiles and shows its output', async () => {
    const wasm = new WasmDebugger(
      compilerReturning(COMPILED),
      runnerReturning({ exitCode: 0 }, ['hello ', 'from structs\n'])
    );
    wasm.setEvents(events);

    wasm.start({ name: 'hello.c', code: '' });
    await flush();

    expect(events.sessionStarted).toHaveBeenCalledOnce();
    expect(vi.mocked(events.output).mock.calls).toEqual([['hello '], ['from structs\n']]);
  });

  it('says when a program is stopped for running too long', async () => {
    const wasm = new WasmDebugger(compilerReturning(COMPILED), runnerReturning({ timedOut: true }));
    wasm.setEvents(events);

    wasm.start({ name: 'loop.c', code: '' });
    await flush();

    expect(events.output).toHaveBeenCalledWith(expect.stringMatching(/stopped .*too long/i));
  });

  it('says when a program crashes', async () => {
    const wasm = new WasmDebugger(
      compilerReturning(COMPILED),
      runnerReturning({ error: 'unreachable' })
    );
    wasm.setEvents(events);

    wasm.start({ name: 'crash.c', code: '' });
    await flush();

    expect(events.output).toHaveBeenCalledWith(expect.stringContaining('unreachable'));
  });

  it('does not run a program that fails to compile', async () => {
    const runner = vi.fn(runnerReturning({ exitCode: 0 }));
    const wasm = new WasmDebugger(compilerReturning({ ok: false, errors: 'oops' }), runner);
    wasm.setEvents(events);

    wasm.start({ name: 'main.c', code: '' });
    await flush();

    expect(runner).not.toHaveBeenCalled();
  });

  it('stops the running program when compiling again, interrupting, or closing', async () => {
    const { runner, signals } = endlessRunner();
    const wasm = new WasmDebugger(compilerReturning(COMPILED), runner);
    wasm.setEvents(events);

    wasm.start({ name: 'loop.c', code: '' });
    await flush();
    wasm.start({ name: 'loop.c', code: '' });
    await flush();
    expect(signals.map((signal) => signal.aborted)).toEqual([true, false]);

    wasm.interrupt();
    expect(signals[1].aborted).toBe(true);

    wasm.start({ name: 'loop.c', code: '' });
    await flush();
    wasm.close();
    expect(signals[2].aborted).toBe(true);
  });

  it('cannot step yet', async () => {
    const wasm = new WasmDebugger(compilerReturning({ ok: true, wasm: new Uint8Array() }));

    await expect(wasm.step()).resolves.toBe(false);
  });
});
