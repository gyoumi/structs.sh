import { describe, expect, it } from 'vitest';
import { compileC } from './compile';
import { answerRunRequest, RunnerMessage } from './runRequest';

// Loading clang (about 100 MB of wasm) takes a few seconds the first time.
const CLANG_TIMEOUT = 60_000;

const compile = async (source: string) => {
  const result = await compileC('main.c', source);
  if (!result.ok) throw new Error(result.errors);
  return result.wasm;
};

const answer = async (wasm: Uint8Array<ArrayBuffer>) => {
  const messages: RunnerMessage[] = [];
  await answerRunRequest({ wasm }, (message) => messages.push(message));
  return messages;
};

describe('answerRunRequest', () => {
  it(
    'posts output as the program writes it, then the exit code',
    async () => {
      const wasm = await compile(
        '#include <stdio.h>\nint main(void) { printf("one\\n"); printf("two\\n"); return 4; }\n'
      );

      expect(await answer(wasm)).toEqual([
        { type: 'output', text: 'one\n' },
        { type: 'output', text: 'two\n' },
        { type: 'finished', exitCode: 4 },
      ]);
    },
    CLANG_TIMEOUT
  );

  it(
    'posts an error when the program traps, after the output written before it',
    async () => {
      const wasm = await compile(
        '#include <stdio.h>\nint main(void) { printf("before\\n"); __builtin_trap(); }\n'
      );

      const messages = await answer(wasm);

      expect(messages).toHaveLength(2);
      expect(messages[0]).toEqual({ type: 'output', text: 'before\n' });
      expect(messages[1].type).toBe('error');
      if (messages[1].type !== 'error') return;
      expect(messages[1].message).toContain('unreachable');
    },
    CLANG_TIMEOUT
  );

  it('posts an error when the module is not valid wasm', async () => {
    const messages = await answer(new Uint8Array([1, 2, 3]));

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('error');
  });

  it(
    'caps and batches the output of a program that prints a lot',
    async () => {
      // 200,000 lines, 400 KB.
      const wasm = await compile(
        '#include <stdio.h>\nint main(void) { for (int i = 0; i < 200000; i++) puts("x"); return 0; }\n'
      );

      const messages = await answer(wasm);
      const output = messages.flatMap((message) =>
        message.type === 'output' ? [message.text] : []
      );

      expect(output.length).toBeLessThan(1_000);
      expect(output.join('').length).toBeLessThan(150_000);
      expect(output.at(-1)).toMatch(/output .*stopped/i);
      expect(messages.at(-1)).toEqual({ type: 'finished', exitCode: 0 });
    },
    CLANG_TIMEOUT
  );
});
