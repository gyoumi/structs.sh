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
    expect(create).not.toHaveBeenCalled();

    const compiled = compiler.compile('main.c', 'int main(void) { return 0; }');
    worker.answer({ id: 0, result: { ok: false, errors: 'oops' } });

    await expect(compiled).resolves.toEqual({ ok: false, errors: 'oops' });
    expect(create).toHaveBeenCalledOnce();
  });

  it('answers waiting compiles with an error when the worker fails to load', async () => {
    const worker = createFakeWorker();
    const compiler = createWorkerCompiler(() => worker as unknown as Worker);

    const compiled = compiler.compile('main.c', '');
    worker.onerror?.({ message: 'network error' });

    await expect(compiled).resolves.toEqual({
      ok: false,
      errors: 'The compiler failed to load: network error',
    });
  });

  it('stops the worker and settles waiting compiles when disposed', async () => {
    const worker = createFakeWorker();
    const compiler = createWorkerCompiler(() => worker as unknown as Worker);

    const compiled = compiler.compile('main.c', '');
    compiler.dispose();

    expect(worker.terminate).toHaveBeenCalledOnce();
    await expect(compiled).resolves.toMatchObject({ ok: false });
  });
});
