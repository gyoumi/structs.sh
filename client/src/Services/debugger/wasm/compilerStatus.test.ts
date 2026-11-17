import { describe, expect, it, vi } from 'vitest';
import { answerLoadRequest } from './compileRequest';

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
});
