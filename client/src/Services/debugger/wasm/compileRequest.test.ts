import { describe, expect, it } from 'vitest';
import { answerCompileRequest } from './compileRequest';

describe('answerCompileRequest', () => {
  it('answers with the compile result for the same request', async () => {
    const response = await answerCompileRequest(
      { id: 7, fileName: 'main.c', source: 'int main(void) { return 0; }' },
      async () => ({ ok: false, errors: 'main.c:1: error: oops' })
    );

    expect(response).toEqual({ id: 7, result: { ok: false, errors: 'main.c:1: error: oops' } });
  });

  it('answers with an error when the compiler itself fails, such as clang not loading', async () => {
    const response = await answerCompileRequest(
      { id: 3, fileName: 'main.c', source: '' },
      async () => {
        throw new Error('Failed to fetch llvm.core.wasm');
      }
    );

    expect(response.id).toBe(3);
    expect(response.result.ok).toBe(false);
    if (response.result.ok) return;
    expect(response.result.errors).toContain('Failed to fetch llvm.core.wasm');
  });
});
