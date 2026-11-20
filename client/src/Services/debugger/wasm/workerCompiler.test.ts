import { describe, expect, it, vi } from 'vitest';
import { createWorkerCompiler } from './workerCompiler';

/** Stands in for a Web Worker. `answer` plays a message from the worker. */
const createFakeWorker = () => {
  const worker = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onerror: null as ((event: { message: string }) => void) | null,
    posted: [] as unknown[],
    postMessage: vi.fn((message: unknown) => worker.posted.push(message)),
    terminate: vi.fn(),
    answer: (data: unknown) => worker.onmessage?.({ data }),
  };
  return worker;
};

describe('createWorkerCompiler', () => {
  it('starts the worker on the first compile and answers each request', async () => {
    const worker = createFakeWorker();
    const create = vi.fn(() => worker as unknown as Worker);
    const compiler = createWorkerCompiler(create);
    expect(
      create,
      'createWorkerCompiler(), before any compile: workers created'
    ).not.toHaveBeenCalled();

    const compiled = compiler.compile('main.c', 'int main(void) { return 0; }');
    worker.answer({ id: 0, result: { ok: false, errors: 'oops' } });

    await expect(
      compiled,
      "compile('main.c'), worker answered request 0 with errors 'oops': result"
    ).resolves.toEqual({
      ok: false,
      errors: 'oops',
    });
    expect(create, "compile('main.c'): workers created").toHaveBeenCalledOnce();
  });

  it('answers waiting compiles with an error when the worker fails to load', async () => {
    const worker = createFakeWorker();
    const compiler = createWorkerCompiler(() => worker as unknown as Worker);

    const compiled = compiler.compile('main.c', '');
    worker.onerror?.({ message: 'network error' });

    await expect(
      compiled,
      "compile('main.c'), then the worker raised 'network error': result"
    ).resolves.toEqual({
      ok: false,
      errors: 'The compiler failed to load: network error',
    });
    expect(
      worker.terminate,
      "the worker raised 'network error': terminate calls"
    ).toHaveBeenCalledOnce();
  });

  it('answers with an error when the worker cannot be started', async () => {
    const compiler = createWorkerCompiler(() => {
      throw new Error('Module workers are not supported');
    });

    await expect(
      compiler.compile('main.c', ''),
      "compile('main.c'), creating the worker threw 'Module workers are not supported': result"
    ).resolves.toEqual({
      ok: false,
      errors: expect.stringContaining('Module workers are not supported'),
    });
  });

  it('answers with an error when the request cannot be sent to the worker', async () => {
    const worker = createFakeWorker();
    worker.postMessage.mockImplementation(() => {
      throw new Error('could not clone');
    });
    const compiler = createWorkerCompiler(() => worker as unknown as Worker);

    await expect(
      compiler.compile('main.c', ''),
      "compile('main.c'), postMessage threw 'could not clone': result"
    ).resolves.toEqual({
      ok: false,
      errors: expect.stringContaining('could not clone'),
    });
  });

  it('starts loading the compiler early and reports its progress', () => {
    const worker = createFakeWorker();
    const compiler = createWorkerCompiler(() => worker as unknown as Worker);
    const onStatus = vi.fn();

    compiler.preload(onStatus);
    worker.answer({ status: { state: 'loading', done: 1, total: 2 } });
    worker.answer({ status: { state: 'ready' } });

    expect(worker.posted, 'preload(): messages posted to the worker').toEqual([{ load: true }]);
    expect(
      onStatus.mock.calls,
      'preload(), the worker sent loading 1/2 then ready: statuses reported'
    ).toEqual([[{ state: 'loading', done: 1, total: 2 }], [{ state: 'ready' }]]);
  });

  it('reports a failed load when the worker cannot be started for preloading', () => {
    const compiler = createWorkerCompiler(() => {
      throw new Error('Module workers are not supported');
    });
    const onStatus = vi.fn();

    compiler.preload(onStatus);

    expect(
      onStatus,
      "preload(), creating the worker threw 'Module workers are not supported': statuses reported"
    ).toHaveBeenCalledWith({ state: 'failed' });
  });

  it('stops the worker and settles waiting compiles when disposed', async () => {
    const worker = createFakeWorker();
    const compiler = createWorkerCompiler(() => worker as unknown as Worker);

    const compiled = compiler.compile('main.c', '');
    compiler.dispose();

    expect(
      worker.terminate,
      "dispose() during compile('main.c'): terminate calls"
    ).toHaveBeenCalledOnce();
    await expect(compiled, "dispose() during compile('main.c'): result").resolves.toMatchObject({
      ok: false,
    });
  });
});
