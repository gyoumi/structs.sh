import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DebuggerEvents } from './types';
import { WasmDebugger } from './wasmDebugger';
import { CompileResult, Compiler, CompilerStatus } from './wasm/compiler';
import type { Recording, RunEnd } from './wasm/recording';
import type { RecordResult } from './wasm/workerRunner';
import type { Recorder } from './wasmDebugger';

const createEvents = (): DebuggerEvents => ({
  sessionStarted: vi.fn(),
  compileError: vi.fn(),
  output: vi.fn(),
  state: vi.fn(),
  typeDeclaration: vi.fn(),
  sessionEnded: vi.fn(),
  compilerStatus: vi.fn(),
});

const compilerReturning = (result: CompileResult): Compiler => ({
  compile: vi.fn(async () => result),
  preload: vi.fn(),
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
    preload: vi.fn(),
    dispose: vi.fn(),
  };
  return { compiler, finish: (index: number, result: CompileResult) => finishers[index](result) };
};

const COMPILED: CompileResult = { ok: true, wasm: new Uint8Array() };

const HELLO_SOURCE = 'int main(void) {\n    puts("hi");\n    return 0;\n}\n';

/** What recording HELLO_SOURCE gives. */
const HELLO: Recording = {
  steps: [
    { function: 'main', line: 2, depth: 0, output: 'hi\n', variables: {}, heap: {} },
    { function: 'main', line: 3, depth: 0, output: '', variables: {}, heap: {} },
  ],
  outputBeforeFirstStep: '',
  end: { exitCode: 0 },
  types: [],
};

const recorderReturning =
  (recording: Recording): Recorder =>
  async () => ({ recording });

/** A recorder whose recordings finish when the test says, or when cancelled. */
const controlledRecorder = () => {
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
const loading = () => {
  let loaded: () => void = () => {};
  let failed: (error: Error) => void = () => {};
  const promise = new Promise<void>((resolve, reject) => {
    loaded = resolve;
    failed = reject;
  });
  promise.catch(() => {});
  return { promise, loaded: () => loaded(), failed: (reason: string) => failed(new Error(reason)) };
};

/**
 * A recorder whose runner worker, started ahead of the first run, loads when
 * the test says. Assumed seam: Recorder.whenReady(), which settles once the
 * runner it holds has loaded (resolves) or failed to load.
 */
const recorderLoading = () => {
  const runner = loading();
  const recorder: Recorder = Object.assign(recorderReturning(HELLO), {
    whenReady: () => runner.promise,
  });
  return { recorder, ...runner };
};

/**
 * Assumed seam: WasmDebugger's third constructor argument loads the fonts and
 * resolves once they have loaded (loadFonts() by default). Reached through a
 * cast so this file type-checks before the constructor takes it.
 */
const createDebugger = (
  compiler: Compiler,
  recorder: Recorder,
  loadFonts: () => Promise<unknown>
) =>
  new (WasmDebugger as unknown as new (
    compiler: Compiler,
    recorder: Recorder,
    loadFonts: () => Promise<unknown>
  ) => WasmDebugger)(compiler, recorder, loadFonts);

/** A compiler whose download the test reports on, through preload's callback. */
const compilerReporting = () => {
  let report: (status: CompilerStatus) => void = () => {};
  const compiler = compilerReturning(COMPILED);
  vi.mocked(compiler.preload).mockImplementation((onStatus) => {
    report = onStatus;
  });
  return { compiler, report: (status: CompilerStatus) => report(status) };
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

  it('replays the recording one statement per step, with the output each statement printed', async () => {
    const wasm = new WasmDebugger(compilerReturning(COMPILED), recorderReturning(HELLO));
    wasm.setEvents(events);
    wasm.start({ name: 'hello.c', code: HELLO_SOURCE });
    await flush();

    expect(await wasm.step()).toBe(true);
    expect(events.state).toHaveBeenLastCalledWith({
      frame_info: { file: 'hello.c', line: '    puts("hi");', line_num: 2, function: 'main' },
      stack_data: {},
      heap_data: {},
    });
    expect(events.output).not.toHaveBeenCalled();

    // puts has now run, so its output shows with the next line.
    expect(await wasm.step()).toBe(true);
    expect(vi.mocked(events.output).mock.calls).toEqual([['hi\n']]);
    expect(vi.mocked(events.state).mock.lastCall?.[0].frame_info).toMatchObject({ line_num: 3 });
    expect(events.sessionEnded).not.toHaveBeenCalled();
  });

  it('sends each step’s variables, and the struct types before the first step', async () => {
    const node = {
      typeName: 'struct node',
      fields: [
        { name: 'value', typeName: 'int' },
        { name: 'next', typeName: 'struct node *' },
      ],
    };
    const list = { addr: '0x10ff8', typeName: 'struct node *', value: '0x11010' };
    const heap = {
      '0x11010': {
        addr: '0x11010',
        typeName: 'struct node',
        value: {
          value: { kind: 'int', value: 1, addr: null },
          next: { kind: 'struct node *', value: '0x0', addr: null },
        },
      },
    };
    const recording: Recording = {
      ...HELLO,
      steps: [{ ...HELLO.steps[0], variables: { list }, heap }],
      types: [node],
    };
    const wasm = new WasmDebugger(compilerReturning(COMPILED), recorderReturning(recording));
    wasm.setEvents(events);
    wasm.start({ name: 'list.c', code: HELLO_SOURCE });
    await flush();

    await wasm.step();

    expect(events.typeDeclaration).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(node));
    expect(vi.mocked(events.state).mock.lastCall?.[0].stack_data).toEqual({ list });
    expect(vi.mocked(events.state).mock.lastCall?.[0].heap_data).toEqual(heap);
    expect(vi.mocked(events.typeDeclaration).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(events.state).mock.invocationCallOrder[0]
    );
  });

  describe('input', () => {
    const PROMPT_STEP = { ...HELLO.steps[1], output: 'Number: ' };
    /** Waits after printing a prompt, until input arrives. */
    const WAITING: Recording = {
      ...HELLO,
      steps: [HELLO.steps[0], PROMPT_STEP],
      end: { waitingForInput: true },
    };
    const FINISHED: Recording = {
      ...HELLO,
      steps: [HELLO.steps[0], PROMPT_STEP, { ...HELLO.steps[1], line: 4 }],
    };

    /** A recorder that finishes once it's given input, and notes what it was given. */
    const inputRecorder = () => {
      const inputs: { text: string; eof: boolean }[] = [];
      const recorder: Recorder = async (_wasm, { input }) => {
        inputs.push(input);
        return { recording: input.text || input.eof ? FINISHED : WAITING };
      };
      return { recorder, inputs };
    };

    it('stays in the session while the program waits, and carries on once input is typed', async () => {
      const { recorder, inputs } = inputRecorder();
      const wasm = new WasmDebugger(compilerReturning(COMPILED), recorder);
      wasm.setEvents(events);
      wasm.start({ name: 'sum.c', code: HELLO_SOURCE });
      await flush();

      expect(await wasm.step()).toBe(true);
      expect(await wasm.step()).toBe(true);
      // Waiting: nothing more to show, but the session goes on, and the
      // prompt is shown once however often step is clicked.
      expect(await wasm.step()).toBe(false);
      expect(await wasm.step()).toBe(false);
      expect(events.sessionEnded).not.toHaveBeenCalled();
      expect(vi.mocked(events.output).mock.calls).toEqual([['hi\n'], ['Number: ']]);

      wasm.sendStdin('5');
      expect(inputs.at(-1)).toEqual({ text: '5\n', eof: false });

      expect(await wasm.step()).toBe(true);
      expect(vi.mocked(events.state).mock.lastCall?.[0].frame_info.line_num).toBe(4);
      expect(await wasm.step()).toBe(false);
      expect(events.sessionEnded).toHaveBeenCalledOnce();
      expect(vi.mocked(events.output).mock.calls.slice(0, 2)).toEqual([['hi\n'], ['Number: ']]);
    });

    it('shows output the waiting statement prints once its input arrives', async () => {
      // printf("%c\n", getchar()): the statement waits, then prints.
      const waiting: Recording = { ...WAITING, steps: [HELLO.steps[0], HELLO.steps[1]] };
      const finished: Recording = {
        ...FINISHED,
        steps: [HELLO.steps[0], { ...HELLO.steps[1], output: 'a\n' }, FINISHED.steps[2]],
      };
      const recorder: Recorder = async (_wasm, { input }) => ({
        recording: input.text ? finished : waiting,
      });
      const wasm = new WasmDebugger(compilerReturning(COMPILED), recorder);
      wasm.setEvents(events);
      wasm.start({ name: 'echo.c', code: HELLO_SOURCE });
      await flush();

      await wasm.step();
      await wasm.step();
      expect(await wasm.step()).toBe(false);
      wasm.sendStdin('a');
      expect(await wasm.step()).toBe(true);

      expect(vi.mocked(events.output).mock.calls).toEqual([['hi\n'], ['a\n']]);
    });

    it('ends the session on Ctrl+C while the program waits, and ignores input after', async () => {
      const { recorder, inputs } = inputRecorder();
      const wasm = new WasmDebugger(compilerReturning(COMPILED), recorder);
      wasm.setEvents(events);
      wasm.start({ name: 'sum.c', code: HELLO_SOURCE });
      await flush();
      await wasm.step();
      await wasm.step();
      await wasm.step();

      wasm.interrupt();
      await flush();
      wasm.sendStdin('5');

      expect(events.sessionEnded).toHaveBeenCalledOnce();
      expect(events.output).toHaveBeenLastCalledWith(expect.stringMatching(/stopped/));
      expect(inputs).toHaveLength(1);
      expect(await wasm.step()).toBe(false);
    });

    it('sends end-of-file, keeping the input typed before it', async () => {
      const { recorder, inputs } = inputRecorder();
      const wasm = new WasmDebugger(compilerReturning(COMPILED), recorder);
      wasm.setEvents(events);
      wasm.start({ name: 'sum.c', code: HELLO_SOURCE });
      await flush();

      wasm.sendStdin('1');
      wasm.sendStdin('2');
      wasm.sendEOF();

      expect(inputs).toEqual([
        { text: '', eof: false },
        { text: '1\n', eof: false },
        { text: '1\n2\n', eof: false },
        { text: '1\n2\n', eof: true },
      ]);
    });
  });

  it('ends the session after the last step, saying how the program ended', async () => {
    const wasm = new WasmDebugger(compilerReturning(COMPILED), recorderReturning(HELLO));
    wasm.setEvents(events);
    wasm.start({ name: 'hello.c', code: HELLO_SOURCE });
    await flush();

    await wasm.step();
    await wasm.step();
    expect(await wasm.step()).toBe(false);

    expect(events.state).toHaveBeenCalledTimes(2);
    expect(events.output).toHaveBeenLastCalledWith(expect.stringContaining('exit code 0'));
    expect(events.sessionEnded).toHaveBeenCalledOnce();

    expect(await wasm.step()).toBe(false);
    expect(events.sessionEnded).toHaveBeenCalledOnce();
  });

  it('shows output printed before the first statement with the first step', async () => {
    const wasm = new WasmDebugger(
      compilerReturning(COMPILED),
      recorderReturning({ ...HELLO, outputBeforeFirstStep: 'early\n' })
    );
    wasm.setEvents(events);
    wasm.start({ name: 'hello.c', code: HELLO_SOURCE });
    await flush();

    await wasm.step();

    expect(vi.mocked(events.output).mock.calls).toEqual([['early\n']]);
  });

  it.each([
    [{ crashed: 'unreachable' }, /crashed.*unreachable/],
    [{ stepLimit: 100_000 }, /stopped after .*100,000/],
    [{ timeLimit: 10_000 }, /stopped .*too long/],
    [{ sizeLimit: 50_000_000 }, /stopped .*too much/],
  ] satisfies [RunEnd, RegExp][])(
    'says how a program that ended with %o ended',
    async (end, message) => {
      const wasm = new WasmDebugger(
        compilerReturning(COMPILED),
        recorderReturning({ ...HELLO, end })
      );
      wasm.setEvents(events);
      wasm.start({ name: 'hello.c', code: HELLO_SOURCE });
      await flush();

      await wasm.step();
      await wasm.step();
      await wasm.step();

      expect(events.output).toHaveBeenLastCalledWith(expect.stringMatching(message));
      expect(events.sessionEnded).toHaveBeenCalledOnce();
    }
  );

  it.each([
    [{ timedOut: true }, /stopped .*too long/],
    [{ error: 'invalid module' }, /invalid module/],
  ] satisfies [RecordResult, RegExp][])(
    'ends the session straight away when there is no recording (%o)',
    async (result, message) => {
      const wasm = new WasmDebugger(compilerReturning(COMPILED), async () => result);
      wasm.setEvents(events);

      wasm.start({ name: 'loop.c', code: '' });
      await flush();

      expect(events.output).toHaveBeenCalledWith(expect.stringMatching(message));
      expect(events.sessionEnded).toHaveBeenCalledOnce();
      expect(await wasm.step()).toBe(false);
    }
  );

  it('waits for the recording to finish before the first step', async () => {
    const { recorder, finish } = controlledRecorder();
    const wasm = new WasmDebugger(compilerReturning(COMPILED), recorder);
    wasm.setEvents(events);
    wasm.start({ name: 'hello.c', code: HELLO_SOURCE });
    await flush();

    const step = wasm.step();
    await flush();
    expect(events.state).not.toHaveBeenCalled();

    finish(0, { recording: HELLO });
    expect(await step).toBe(true);
    expect(events.state).toHaveBeenCalledOnce();
  });

  it('steps through the newest program after compiling again', async () => {
    const recordings = [HELLO, { ...HELLO, steps: [{ ...HELLO.steps[1], line: 1 }] }];
    const wasm = new WasmDebugger(compilerReturning(COMPILED), async () => ({
      recording: recordings.shift()!,
    }));
    wasm.setEvents(events);

    wasm.start({ name: 'hello.c', code: HELLO_SOURCE });
    await flush();
    await wasm.step();
    wasm.start({ name: 'hello.c', code: HELLO_SOURCE });
    await flush();
    await wasm.step();

    expect(vi.mocked(events.state).mock.lastCall?.[0].frame_info.line_num).toBe(1);
  });

  it('does not record a program that fails to compile', async () => {
    const recorder = vi.fn(recorderReturning(HELLO));
    const wasm = new WasmDebugger(compilerReturning({ ok: false, errors: 'oops' }), recorder);
    wasm.setEvents(events);

    wasm.start({ name: 'main.c', code: '' });
    await flush();

    expect(recorder).not.toHaveBeenCalled();
  });

  it('stops the recording when compiling again, interrupting, or closing', async () => {
    const { recorder, signals } = controlledRecorder();
    const wasm = new WasmDebugger(compilerReturning(COMPILED), recorder);
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

  it('ends the session when the program is interrupted while it is being recorded', async () => {
    const { recorder } = controlledRecorder();
    const wasm = new WasmDebugger(compilerReturning(COMPILED), recorder);
    wasm.setEvents(events);
    wasm.start({ name: 'loop.c', code: '' });
    await flush();

    wasm.interrupt();
    await flush();

    expect(events.output).toHaveBeenCalledWith(expect.stringMatching(/stopped/));
    expect(events.sessionEnded).toHaveBeenCalledOnce();
  });

  it('does not record a program whose compile was interrupted', async () => {
    const { compiler, finish } = controlledCompiler();
    const recorder = vi.fn(recorderReturning(HELLO));
    const wasm = new WasmDebugger(compiler, recorder);
    wasm.setEvents(events);

    wasm.start({ name: 'main.c', code: '' });
    wasm.interrupt();
    finish(0, COMPILED);
    await flush();

    expect(recorder).not.toHaveBeenCalled();
    expect(events.sessionStarted).not.toHaveBeenCalled();
  });

  it('starts loading the compiler straight away and reports its status, even to events set later', async () => {
    // The runner and the fonts have loaded, so the status follows the compiler's.
    const { compiler, report } = compilerReporting();
    const wasm = createDebugger(
      compiler,
      Object.assign(recorderReturning(HELLO), { whenReady: async () => {} }),
      async () => {}
    );
    expect(compiler.preload, 'new WasmDebugger(): compiler.preload calls').toHaveBeenCalledOnce();
    report({ state: 'loading', done: 1, total: 4 });
    await flush();
    wasm.setEvents(events);
    await flush();

    const statuses = () => vi.mocked(events.compilerStatus).mock.calls.map(([status]) => status);
    expect(
      statuses()[0]?.state,
      'compiler reported loading 1/4 before setEvents(): first compilerStatus event the late events got'
    ).toBe('loading');

    report({ state: 'ready' });
    await flush();
    expect(
      statuses().at(-1),
      'compiler then reported ready, runner and fonts already loaded: latest compilerStatus event'
    ).toEqual({ state: 'ready' });
  });

  describe('compiler status, which waits for the runner and the fonts too', () => {
    const latestStatus = () => vi.mocked(events.compilerStatus).mock.calls.at(-1)?.[0];

    it('stays loading while the runner has not loaded, and is ready once it has', async () => {
      const { compiler, report } = compilerReporting();
      const runner = recorderLoading();
      const wasm = createDebugger(compiler, runner.recorder, async () => {});
      wasm.setEvents(events);

      report({ state: 'ready' });
      await flush();
      expect(
        latestStatus()?.state,
        'compiler ready, fonts loaded, runner worker not loaded yet: latest compilerStatus event'
      ).toBe('loading');

      runner.loaded();
      await flush();
      expect(
        latestStatus(),
        'compiler ready, fonts loaded, then the runner worker loaded: latest compilerStatus event'
      ).toEqual({ state: 'ready' });
    });

    it('stays loading while the fonts have not loaded, and is ready once they have', async () => {
      const { compiler, report } = compilerReporting();
      const fonts = loading();
      const wasm = createDebugger(
        compiler,
        Object.assign(recorderReturning(HELLO), { whenReady: async () => {} }),
        () => fonts.promise
      );
      wasm.setEvents(events);

      report({ state: 'ready' });
      await flush();
      expect(
        latestStatus()?.state,
        'compiler ready, runner loaded, fonts not loaded yet: latest compilerStatus event'
      ).toBe('loading');

      fonts.loaded();
      await flush();
      expect(
        latestStatus(),
        'compiler ready, runner loaded, then the fonts loaded: latest compilerStatus event'
      ).toEqual({ state: 'ready' });
    });

    it('stays loading while the compiler has not loaded, even once the runner and fonts have', async () => {
      const { compiler, report } = compilerReporting();
      const wasm = createDebugger(
        compiler,
        Object.assign(recorderReturning(HELLO), { whenReady: async () => {} }),
        async () => {}
      );
      wasm.setEvents(events);

      report({ state: 'loading', done: 1, total: 4 });
      await flush();
      expect(
        latestStatus()?.state,
        'compiler loading 1/4, runner and fonts loaded: latest compilerStatus event'
      ).toBe('loading');
    });

    it('tells events set later that it is still loading while the runner has not loaded', async () => {
      const { compiler, report } = compilerReporting();
      const runner = recorderLoading();
      const wasm = createDebugger(compiler, runner.recorder, async () => {});

      report({ state: 'ready' });
      await flush();
      wasm.setEvents(events);
      await flush();
      expect(
        latestStatus()?.state,
        'compiler ready and runner not loaded before setEvents(): latest compilerStatus event the late events got'
      ).toBe('loading');

      runner.loaded();
      await flush();
      expect(latestStatus(), 'then the runner loaded: latest compilerStatus event').toEqual({
        state: 'ready',
      });
    });

    it('does not stay loading when the runner fails to load', async () => {
      const { compiler, report } = compilerReporting();
      const runner = recorderLoading();
      const wasm = createDebugger(compiler, runner.recorder, async () => {});
      wasm.setEvents(events);

      report({ state: 'ready' });
      runner.failed('Failed to fetch runner.worker.js');
      await flush();

      expect(
        ['ready', 'failed'],
        'compiler ready, fonts loaded, runner worker failed to load: latest compilerStatus state should have ended'
      ).toContain(latestStatus()?.state);
    });

    it('does not stay loading when a font fails to load', async () => {
      const { compiler, report } = compilerReporting();
      const fonts = loading();
      const wasm = createDebugger(
        compiler,
        Object.assign(recorderReturning(HELLO), { whenReady: async () => {} }),
        () => fonts.promise
      );
      wasm.setEvents(events);

      report({ state: 'ready' });
      fonts.failed('Failed to fetch CharlieText-Bold.ttf');
      await flush();

      expect(
        ['ready', 'failed'],
        'compiler ready, runner loaded, fonts failed to load: latest compilerStatus state should have ended'
      ).toContain(latestStatus()?.state);
    });

    it('reports a compiler that failed to load, even once the runner and fonts have loaded', async () => {
      const { compiler, report } = compilerReporting();
      const wasm = createDebugger(
        compiler,
        Object.assign(recorderReturning(HELLO), { whenReady: async () => {} }),
        async () => {}
      );
      wasm.setEvents(events);

      report({ state: 'failed' });
      await flush();

      expect(
        latestStatus(),
        'compiler failed to load, runner and fonts loaded: latest compilerStatus event'
      ).toEqual({ state: 'failed' });
    });
  });
});
