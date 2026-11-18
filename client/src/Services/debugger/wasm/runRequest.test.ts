import { describe, expect, it } from 'vitest';
import { compileAndInstrument } from './instrumenter';
import { answerRunRequest, RunnerMessage } from './runRequest';

// Needs the instrumenter built first: `pnpm run instrumenter` from the repo root.
// Loading clang (about 100 MB of wasm) takes a few seconds the first time.
const CLANG_TIMEOUT = 60_000;

const compile = async (source: string) => {
  const result = await compileAndInstrument('main.c', source);
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
    'records the program and posts the recording once it ends',
    async () => {
      const wasm = await compile(
        '#include <stdio.h>\nint main(void) {\n    printf("one\\n");\n    return 4;\n}\n'
      );

      expect(await answer(wasm)).toEqual([
        {
          type: 'recorded',
          recording: {
            steps: [
              { function: 'main', line: 3, depth: 0, output: 'one\n', variables: {}, heap: {} },
              { function: 'main', line: 4, depth: 0, output: '', variables: {}, heap: {} },
            ],
            outputBeforeFirstStep: '',
            end: { exitCode: 4 },
            types: [],
          },
        },
      ]);
    },
    CLANG_TIMEOUT
  );

  it('posts an error when the module is not valid wasm', async () => {
    const messages = await answer(new Uint8Array([1, 2, 3]));

    expect(messages).toHaveLength(1);
    expect(messages[0].type).toBe('error');
  });
});
