import { afterEach, describe, expect, it, vi } from 'vitest';

// The runner worker's script runs at the top level of a Web Worker. Here it
// is imported into Node with the worker's postMessage stubbed, to see what it
// posts once its script and imports have loaded.
describe('runner.worker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("says { type: 'ready' } once its script and imports have loaded, before any run", async () => {
    const postMessage = vi.fn();
    vi.stubGlobal('postMessage', postMessage);

    await import('./runner.worker');

    expect(
      postMessage.mock.calls.map(([message]) => message),
      'runner.worker.ts imported, no run request sent: messages it posted'
    ).toEqual([{ type: 'ready' }]);
  });
});
