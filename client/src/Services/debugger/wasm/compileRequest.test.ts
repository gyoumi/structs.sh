import { describe, expect, it, vi } from 'vitest';
import { answerCompileRequest, answerCompilerMessage, answerLoadRequest } from './compileRequest';

// What the compiler worker answers: compile results, and the compiler's
// loading status.

describe('answerCompileRequest', () => {
  it('answers with the compile result for the same request', async () => {
    const response = await answerCompileRequest(
      { id: 7, fileName: 'main.c', source: 'int main(void) { return 0; }' },
      async () => ({ ok: false, errors: 'main.c:1: error: oops' })
    );

    expect(response, 'request 7, the compiler gave an error: response').toEqual({
      id: 7,
      result: { ok: false, errors: 'main.c:1: error: oops' },
    });
  });

  it('answers with an error when the compiler itself fails, such as clang not loading', async () => {
    const response = await answerCompileRequest(
      { id: 3, fileName: 'main.c', source: '' },
      async () => {
        throw new Error('Failed to fetch llvm.core.wasm');
      }
    );

    expect(
      response,
      "request 3, the compiler threw 'Failed to fetch llvm.core.wasm': response"
    ).toEqual({
      id: 3,
      result: { ok: false, errors: expect.stringContaining('Failed to fetch llvm.core.wasm') },
    });
  });
});

describe('answerLoadRequest', () => {
  it('reports loading progress, then that the compiler is ready', async () => {
    const post = vi.fn();

    await answerLoadRequest(post, async (onProgress) => {
      onProgress(50, 100);
      onProgress(100, 100);
    });

    expect(
      post.mock.calls,
      'load reported progress 50/100 and 100/100, then finished: messages posted'
    ).toEqual([
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

    expect(post, "load threw 'Failed to fetch': last message posted").toHaveBeenLastCalledWith({
      status: { state: 'failed' },
    });
  });

  it('ignores progress that arrives after the load has failed', async () => {
    const post = vi.fn();
    let lateProgress: (done: number, total: number) => void = () => {};

    await answerLoadRequest(post, async (onProgress) => {
      lateProgress = onProgress;
      throw new Error('Failed to fetch llvm-resources.tar');
    });
    lateProgress(10, 100);

    expect(
      post,
      'load failed, then reported progress 10/100: last message posted'
    ).toHaveBeenLastCalledWith({ status: { state: 'failed' } });
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

    expect(
      posted,
      'compile request 4 before the compiler loaded (load reports 1/1, compile gives an error): messages posted'
    ).toEqual([
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

    expect(
      compile,
      "compile request 2, load threw 'Failed to fetch llvm.core.wasm': compile calls"
    ).not.toHaveBeenCalled();
    expect(
      posted,
      "compile request 2, load threw 'Failed to fetch llvm.core.wasm': messages posted"
    ).toEqual([
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

  it('does not compile when the load fails with no message', async () => {
    const compile = vi.fn();

    await answerCompilerMessage({ id: 1, fileName: 'main.c', source: '' }, () => {}, {
      load: async () => {
        throw new Error();
      },
      compile,
    });

    expect(
      compile,
      'compile request 1, load threw an Error with no message: compile calls'
    ).not.toHaveBeenCalled();
  });

  it('only loads for a load request', async () => {
    const posted: unknown[] = [];
    const compile = vi.fn();

    await answerCompilerMessage({ load: true }, (message) => posted.push(message), {
      load: async () => {},
      compile,
    });

    expect(posted, '{ load: true }, load succeeded: messages posted').toEqual([
      { status: { state: 'ready' } },
    ]);
    expect(compile, '{ load: true }: compile calls').not.toHaveBeenCalled();
  });
});
