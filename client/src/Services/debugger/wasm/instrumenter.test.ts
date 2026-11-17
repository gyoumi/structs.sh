import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileAndInstrument, instrumentProgram } from './instrumenter';
import { runWasi } from './run';

// Needs the instrumenter built first: `pnpm run instrumenter` from the repo root.

const program = (name: string) =>
  readFileSync(new URL(`../../../../../e2e/programs/${name}`, import.meta.url), 'utf8');

const CLANG_TIMEOUT = 60_000;

describe('compileAndInstrument', () => {
  it(
    'gives a program that still runs and prints its output',
    async () => {
      const result = await compileAndInstrument('hello.c', program('hello.c'));
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      let output = '';
      const { exitCode } = await runWasi(result.wasm, {
        onOutput: (text) => {
          output += text;
        },
      });

      expect(output).toBe('hello from structs\n');
      expect(exitCode).toBe(0);
    },
    CLANG_TIMEOUT
  );

  it(
    'passes compile errors through unchanged',
    async () => {
      const result = await compileAndInstrument('compile_error.c', program('compile_error.c'));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors).toContain('undeclared_variable');
    },
    CLANG_TIMEOUT
  );
});

describe('instrumentProgram', () => {
  it('reports bytes that are not a wasm program as an error', async () => {
    const notWasm = new TextEncoder().encode('int main(void) { return 0; }');

    await expect(instrumentProgram(notWasm)).rejects.toThrow(/instrument/i);
  });
});
