import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DebuggerEvents } from './types';
import { WasmDebugger } from './wasmDebugger';
import {
  compilerReporting,
  createEvents,
  flush,
  HELLO,
  HELLO_SOURCE,
  loadedRecorder,
  loading,
  recorderLoading,
  standbyRecorder,
} from './__tests__/wasmDebuggerTestKit';

// The compiler status the page shows: ready only once the compiler, the runner
// worker and the fonts have all loaded, and never stuck on loading when one
// of them fails.

/**
 * What the debugger loads besides the compiler, with one of them still
 * loading until the test says it has loaded or failed.
 */
const pendingDependencies = {
  'the runner worker': () => {
    const runner = recorderLoading();
    return {
      recorder: runner.recorder,
      loadFonts: async () => {},
      loaded: runner.loaded,
      failed: () => runner.failed('Failed to fetch runner.worker.js'),
    };
  },
  'the fonts': () => {
    const fonts = loading();
    return {
      recorder: loadedRecorder(),
      loadFonts: () => fonts.promise,
      loaded: fonts.loaded,
      failed: () => fonts.failed('Failed to fetch CharlieText-Bold.ttf'),
    };
  },
};
const dependencies = Object.keys(pendingDependencies) as (keyof typeof pendingDependencies)[];

describe('WasmDebugger compiler status', () => {
  let events: DebuggerEvents;

  beforeEach(() => {
    events = createEvents();
  });

  const statuses = () => vi.mocked(events.compilerStatus).mock.calls.map(([status]) => status);
  const latestStatus = () => statuses().at(-1);

  it('starts loading the compiler straight away and reports its status, even to events set later', async () => {
    // The runner and the fonts have loaded, so the status follows the compiler's.
    const { compiler, report } = compilerReporting();
    const wasm = new WasmDebugger(compiler, loadedRecorder(), async () => {});
    expect(compiler.preload, 'new WasmDebugger(): compiler.preload calls').toHaveBeenCalledOnce();
    report({ state: 'loading', done: 1, total: 4 });
    await flush();
    wasm.setEvents(events);
    await flush();

    expect(
      statuses()[0]?.state,
      'compiler reported loading 1/4 before setEvents(): first compilerStatus event the late events got'
    ).toBe('loading');

    report({ state: 'ready' });
    await flush();
    expect(
      latestStatus(),
      'compiler then reported ready, runner and fonts already loaded: latest compilerStatus event'
    ).toEqual({ state: 'ready' });
  });

  it.each(dependencies)(
    'stays loading while %s have not loaded, and is ready once they have',
    async (name) => {
      const { compiler, report } = compilerReporting();
      const pending = pendingDependencies[name]();
      const wasm = new WasmDebugger(compiler, pending.recorder, pending.loadFonts);
      wasm.setEvents(events);

      report({ state: 'ready' });
      await flush();
      expect(
        latestStatus()?.state,
        `compiler ready, everything else loaded but ${name}: latest compilerStatus event`
      ).toBe('loading');

      pending.loaded();
      await flush();
      expect(
        latestStatus(),
        `compiler ready, then ${name} loaded too: latest compilerStatus event`
      ).toEqual({ state: 'ready' });
    }
  );

  it('stays loading while the compiler has not loaded, even once the runner and fonts have', async () => {
    const { compiler, report } = compilerReporting();
    const wasm = new WasmDebugger(compiler, loadedRecorder(), async () => {});
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
    const wasm = new WasmDebugger(compiler, runner.recorder, async () => {});

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

  it.each(dependencies)('does not stay loading when %s fail to load', async (name) => {
    const { compiler, report } = compilerReporting();
    const pending = pendingDependencies[name]();
    const wasm = new WasmDebugger(compiler, pending.recorder, pending.loadFonts);
    wasm.setEvents(events);

    report({ state: 'ready' });
    pending.failed();
    await flush();

    expect(
      ['ready', 'failed'],
      `compiler ready, everything else loaded but ${name}, which failed to load: latest compilerStatus state should have ended`
    ).toContain(latestStatus()?.state);
  });

  describe('when a run takes the runner before it has loaded', () => {
    /** Compiler ready and fonts loaded, then a compile whose run takes the unloaded runner. */
    const startEarlyRun = async () => {
      const { compiler, report } = compilerReporting();
      const { recorder, workers } = standbyRecorder();
      const wasm = new WasmDebugger(compiler, recorder, async () => {});
      wasm.setEvents(events);
      report({ state: 'ready' });
      await flush();
      wasm.start({ name: 'hello.c', code: HELLO_SOURCE });
      await vi.waitFor(() =>
        expect(
          workers[0]?.received.length,
          'compile of hello.c, runner not loaded: programs sent to the runner started ahead'
        ).toBe(1)
      );
      return { wasm, workers };
    };

    it.each([
      { name: "sends { type: 'ready' }, then the recording", sendsReady: true },
      { name: "sends the recording but never { type: 'ready' }", sendsReady: false },
    ])('is ready once the runner $name', async ({ name, sendsReady }) => {
      const { wasm, workers } = await startEarlyRun();

      if (sendsReady) workers[0].sendReady();
      workers[0].send({ type: 'recorded', recording: HELLO });
      expect(
        await wasm.step(),
        `hello.c, the runner ${name}: first step() after the run recorded`
      ).toBe(true);
      await flush();

      expect(
        latestStatus(),
        `compiler ready, fonts loaded, a run took the unloaded runner, which ${name}: latest compilerStatus event`
      ).toEqual({ state: 'ready' });
    });
  });

  it('reports a compiler that failed to load, even once the runner and fonts have loaded', async () => {
    const { compiler, report } = compilerReporting();
    const wasm = new WasmDebugger(compiler, loadedRecorder(), async () => {});
    wasm.setEvents(events);

    report({ state: 'failed' });
    await flush();

    expect(
      latestStatus(),
      'compiler failed to load, runner and fonts loaded: latest compilerStatus event'
    ).toEqual({ state: 'failed' });
  });
});
