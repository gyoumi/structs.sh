import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileC } from './compile';

// The same programs the e2e suite uses.
const program = (name: string) =>
  readFileSync(new URL(`../../../../../e2e/programs/${name}`, import.meta.url), 'utf8');

// Loading clang (about 100 MB of wasm) takes a few seconds the first time.
const CLANG_TIMEOUT = 60_000;

describe('compileC', () => {
  it(
    'compiles a valid program to wasm with debug info',
    async () => {
      const result = await compileC('counter.c', program('counter.c'));

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const module = await WebAssembly.compile(result.wasm);
      expect(WebAssembly.Module.customSections(module, '.debug_info')).not.toHaveLength(0);
    },
    CLANG_TIMEOUT
  );

  it(
    'reports compile errors against the user’s file',
    async () => {
      const result = await compileC('compile_error.c', program('compile_error.c'));

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors).toContain('undeclared_variable');
      expect(result.errors).toContain('compile_error.c:2');
    },
    CLANG_TIMEOUT
  );

  it(
    'reports link errors',
    async () => {
      const source = 'int helper(void);\nint main(void) { return helper(); }\n';
      const result = await compileC('main.c', source);

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.errors).toContain('helper');
    },
    CLANG_TIMEOUT
  );

  it(
    'compiles a file whose name starts with a dash',
    async () => {
      const result = await compileC('-counter.c', program('counter.c'));

      expect(result.ok).toBe(true);
    },
    CLANG_TIMEOUT
  );

  it(
    'compiles a file whose name does not end in .c',
    async () => {
      const result = await compileC('notes', 'int main(void) { return 0; }\n');

      expect(result.ok).toBe(true);
    },
    CLANG_TIMEOUT
  );
});
