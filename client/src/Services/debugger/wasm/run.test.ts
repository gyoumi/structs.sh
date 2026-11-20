import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileC } from './clang';
import { runWasi } from './run';

// The same programs the e2e suite uses.
const program = (name: string) =>
  readFileSync(new URL(`../../../../../e2e/programs/${name}`, import.meta.url), 'utf8');

// Loading clang (about 100 MB of wasm) takes a few seconds the first time.
const CLANG_TIMEOUT = 60_000;

const compile = async (source: string) => {
  const result = await compileC('main.c', source);
  if (!result.ok) throw new Error(result.errors);
  return result.wasm;
};

/** Compiles and runs a program, collecting everything it writes. */
const run = async (source: string) => {
  let output = '';
  const { exitCode } = await runWasi(await compile(source), {
    onOutput: (text) => {
      output += text;
    },
  });
  return { exitCode, output };
};

describe('runWasi', () => {
  it(
    'runs hello.c, printing its greeting and exiting with 0',
    async () => {
      expect(await run(program('hello.c')), 'hello.c: exit code and output').toEqual({
        exitCode: 0,
        output: 'hello from structs\n',
      });
    },
    CLANG_TIMEOUT
  );

  it(
    'gives the value main returns',
    async () => {
      expect(
        (await run('int main(void) { return 5; }\n')).exitCode,
        'main returns 5: exit code'
      ).toBe(5);
    },
    CLANG_TIMEOUT
  );

  it(
    'delivers output from several printf, putchar and puts calls in order',
    async () => {
      const source = `#include <stdio.h>
int main(void) {
    printf("one %d\\n", 1);
    putchar('2');
    putchar('\\n');
    puts("three");
    printf("no newline at the end");
    return 0;
}
`;

      expect(
        (await run(source)).output,
        'printf, putchar twice, puts, then printf with no newline: output'
      ).toBe('one 1\n2\nthree\nno newline at the end');
    },
    CLANG_TIMEOUT
  );

  it(
    'delivers stderr output, in order with stdout as a terminal would show it',
    async () => {
      const source = `#include <stdio.h>
int main(void) {
    printf("out 1\\n");
    printf("out 2\\n");
    fprintf(stderr, "err\\n");
    printf("out 3\\n");
    return 0;
}
`;

      expect(
        (await run(source)).output,
        'two printfs, an fprintf to stderr, then a printf: output'
      ).toBe('out 1\nout 2\nerr\nout 3\n');
    },
    CLANG_TIMEOUT
  );

  it(
    'flushes output written before exit()',
    async () => {
      const source =
        '#include <stdio.h>\n#include <stdlib.h>\nint main(void) { printf("bye"); exit(2); }\n';

      expect(
        await run(source),
        'printf("bye") with no newline, then exit(2): exit code and output'
      ).toEqual({ exitCode: 2, output: 'bye' });
    },
    CLANG_TIMEOUT
  );

  it(
    'decodes UTF-8 output',
    async () => {
      const source =
        '#include <stdio.h>\nint main(void) { printf("héllo → 世界\\n"); return 0; }\n';

      expect((await run(source)).output, 'printf of "héllo → 世界\\n": output').toBe(
        'héllo → 世界\n'
      );
    },
    CLANG_TIMEOUT
  );

  it(
    'gives stdin as empty',
    async () => {
      const source =
        '#include <stdio.h>\nint main(void) { int x; return scanf("%d", &x) == EOF ? 0 : 1; }\n';

      expect(
        (await run(source)).exitCode,
        'scanf("%d") with no stdin, exiting 0 if it returned EOF: exit code'
      ).toBe(0);
    },
    CLANG_TIMEOUT
  );

  it(
    'runs a program that uses malloc and free',
    async () => {
      expect((await run(program('linked_list.c'))).exitCode, 'linked_list.c: exit code').toBe(0);
    },
    CLANG_TIMEOUT
  );

  it(
    'runs a program that reads the time and random numbers',
    async () => {
      const source = `#include <stdlib.h>
#include <time.h>
int main(void) {
    time_t now = time(NULL);
    unsigned r = arc4random();
    (void)r;
    return now > 1700000000 ? 0 : 1;
}
`;

      expect(
        (await run(source)).exitCode,
        'time(NULL) and arc4random(), exiting 0 if the time is after 2023: exit code'
      ).toBe(0);
    },
    CLANG_TIMEOUT
  );

  it(
    'runs a program that tries to open a file, which fails as there are no files',
    async () => {
      const source =
        '#include <stdio.h>\nint main(void) { return fopen("data.txt", "r") == NULL ? 0 : 1; }\n';

      expect(
        (await run(source)).exitCode,
        'fopen("data.txt"), exiting 0 if it returned NULL: exit code'
      ).toBe(0);
    },
    CLANG_TIMEOUT
  );

  it(
    'rejects when the program traps',
    async () => {
      await expect(
        run('int main(void) { __builtin_trap(); }\n'),
        '__builtin_trap(): how runWasi settles'
      ).rejects.toThrow(WebAssembly.RuntimeError);
    },
    CLANG_TIMEOUT
  );
});
