import { describe, expect, it, vi } from 'vitest';
import { answerCompilerMessage, answerLoadRequest } from './compileRequest';

describe('answerLoadRequest', () => {
  it('reports loading progress, then that the compiler is ready', async () => {
    const post = vi.fn();

    await answerLoadRequest(post, async (onProgress) => {
      onProgress(50, 100);
      onProgress(100, 100);
    });

    expect(post.mock.calls).toEqual([
      [{ status: { state: 'loading', done: 50, total: 100 } }],
      [{ status: { state: 'loading', done: 100, total: 100 } }],
      [{ status: { state: 'ready' } }],
    ]);
  });

  it('reports a compiler that failed to load', async () => {
    const post = vi.fn();

    await answerLoadRequest(post, async () => {
      throw new Error('Failed to fetch');
    });

    expect(post).toHaveBeenLastCalledWith({ status: { state: 'failed' } });
  });

  it('ignores progress that arrives after the load has failed', async () => {
    const post = vi.fn();
    let lateProgress: (done: number, total: number) => void = () => {};

    await answerLoadRequest(post, async (onProgress) => {
      lateProgress = onProgress;
      throw new Error('Failed to fetch llvm-resources.tar');
    });
    lateProgress(10, 100);

    expect(post).toHaveBeenLastCalledWith({ status: { state: 'failed' } });
  });
});

describe('answerCompilerMessage', () => {
  it('loads the compiler, with progress, before compiling', async () => {
    const posted: unknown[] = [];
    const load = vi.fn(async (onProgress: (done: number, total: number) => void) => {
      onProgress(1, 1);
    });
    const compile = vi.fn(async () => ({ ok: false as const, errors: 'oops' }));

    await answerCompilerMessage(
      { id: 4, fileName: 'main.c', source: '' },
      (message) => posted.push(message),
      { load, compile }
    );

    expect(posted).toEqual([
      { status: { state: 'loading', done: 1, total: 1 } },
      { status: { state: 'ready' } },
      { id: 4, result: { ok: false, errors: 'oops' } },
    ]);
  });

  it('answers a compile with the load error, without compiling, when the compiler fails to load', async () => {
    const posted: unknown[] = [];
    const compile = vi.fn();

    await answerCompilerMessage(
      { id: 2, fileName: 'main.c', source: '' },
      (message) => posted.push(message),
      {
        load: async () => {
          throw new Error('Failed to fetch llvm.core.wasm');
        },
        compile,
      }
    );

    expect(compile).not.toHaveBeenCalled();
    expect(posted).toEqual([
      { status: { state: 'failed' } },
      {
        id: 2,
        result: {
          ok: false,
          errors: expect.stringContaining('Failed to fetch llvm.core.wasm'),
        },
      },
    ]);
  });

  it('only loads for a load request', async () => {
    const posted: unknown[] = [];
    const compile = vi.fn();

    await answerCompilerMessage({ load: true }, (message) => posted.push(message), {
      load: async () => {},
      compile,
    });

    expect(posted).toEqual([{ status: { state: 'ready' } }]);
    expect(compile).not.toHaveBeenCalled();
  });
});
