import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileAndInstrument } from './instrumenter';
import { recordRun, Recording, Variable } from './recording';
import gdb from './fixtures/gdb-variables.json';

// Needs the instrumenter built first: `pnpm run instrumenter` from the repo root.

const CLANG_TIMEOUT = 60_000;

const program = (name: string) =>
  readFileSync(new URL(`../../../../../e2e/programs/${name}`, import.meta.url), 'utf8');

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/** The variables' names and types, in the order the page lists them. */
const declarations = (variables: Record<string, Pick<Variable, 'typeName'> | undefined>) =>
  Object.entries(variables).map(([name, variable]) => `${variable?.typeName} ${name}`);

const record = async (
  name: string,
  source: string,
  options?: Parameters<typeof recordRun>[1]
): Promise<Recording> => {
  const compiled = await compileAndInstrument(name, source);
  if (!compiled.ok) throw new Error(compiled.errors);
  return recordRun(compiled.wasm, options);
};

/** Steps as "function:line", the way a student would see them. */
const stepsOf = (recording: Recording) =>
  recording.steps.map((step) => `${step.function}:${step.line}`);

describe('recordRun', () => {
  it(
    'records each statement of a straight-line program, with its output',
    async () => {
      const recording = await record('hello.c', program('hello.c'));

      expect(stepsOf(recording)).toEqual(['main:4', 'main:5']);
      // printf runs during the step on line 4.
      expect(recording.steps.map((step) => step.output)).toEqual(['hello from structs\n', '']);
      expect(recording.end).toEqual({ exitCode: 0 });
    },
    CLANG_TIMEOUT
  );

  it(
    'visits a loop body once per iteration',
    async () => {
      const recording = await record('counter.c', program('counter.c'));

      expect(stepsOf(recording)).toEqual([
        'main:2',
        'main:3',
        'main:4',
        'main:3',
        'main:4',
        'main:3',
        'main:4',
        'main:3',
        'main:6',
      ]);
    },
    CLANG_TIMEOUT
  );

  it(
    'steps into the student’s functions and back to the line that called them',
    async () => {
      const recording = await record('functions.c', program('functions.c'));

      expect(stepsOf(recording)).toEqual([
        'main:7',
        'main:8',
        'square:2',
        'square:3',
        'main:8',
        'main:9',
      ]);
    },
    CLANG_TIMEOUT
  );

  it(
    'steps over the C library, such as malloc',
    async () => {
      const recording = await record('linked_list.c', program('linked_list.c'));
      const prepend = ['prepend:9', 'prepend:10', 'prepend:11', 'prepend:12'];

      expect(stepsOf(recording)).toEqual([
        'main:16',
        'main:17',
        ...prepend,
        'main:17',
        'main:18',
        ...prepend,
        'main:18',
        'main:19',
        ...prepend,
        'main:19',
        'main:20',
        'main:21',
      ]);
    },
    CLANG_TIMEOUT
  );

  it(
    'records a file whose name starts with a dash',
    async () => {
      // compileC passes this file to clang as ./-counter.c.
      const recording = await record('-counter.c', program('counter.c'));

      expect(stepsOf(recording)).toEqual([
        'main:2',
        'main:3',
        'main:4',
        'main:3',
        'main:4',
        'main:3',
        'main:4',
        'main:3',
        'main:6',
      ]);
    },
    CLANG_TIMEOUT
  );

  it(
    'keeps no more output than the console would show',
    async () => {
      // 30,000 characters, over the 20,000 the console shows.
      const source =
        '#include <stdio.h>\nint main(void) {\n    for (int i = 0; i < 3000; i++) printf("0123456789");\n}\n';

      const recording = await record('lots.c', source);
      const output =
        recording.outputBeforeFirstStep + recording.steps.map((step) => step.output).join('');

      expect(output.length).toBeLessThan(21_000);
      expect(output.match(/output was stopped/g)).toHaveLength(1);
      expect(recording.end).toEqual({ exitCode: 0 });
    },
    CLANG_TIMEOUT
  );

  it(
    'tells recursive calls apart by their depth',
    async () => {
      const source = [
        'int fact(int n) {', // 1
        '    if (n <= 1) {', // 2
        '        return 1;', // 3
        '    }', // 4
        '    return n * fact(n - 1);', // 5
        '}', // 6
        '', // 7
        'int main(void) {', // 8
        '    return fact(3) == 6 ? 0 : 1;', // 9
        '}', // 10
      ].join('\n');

      const recording = await record('fact.c', source);

      // fact has two returns, which clang joins on the closing brace (line 6),
      // so each call ends there, as it does in GDB.
      expect(recording.steps.map((step) => `${step.function}:${step.line}@${step.depth}`)).toEqual([
        'main:9@0',
        'fact:2@1',
        'fact:5@1',
        'fact:2@2',
        'fact:5@2',
        'fact:2@3',
        'fact:3@3',
        'fact:6@3',
        'fact:5@2',
        'fact:6@2',
        'fact:5@1',
        'fact:6@1',
        'main:9@0',
      ]);
    },
    CLANG_TIMEOUT
  );

  it(
    'records how a program that calls exit ended',
    async () => {
      const source = '#include <stdlib.h>\nint main(void) {\n    int a = 1;\n    exit(3);\n}\n';

      const recording = await record('exit.c', source);

      expect(stepsOf(recording)).toEqual(['main:3', 'main:4']);
      expect(recording.end).toEqual({ exitCode: 3 });
    },
    CLANG_TIMEOUT
  );

  it(
    'records the step a program crashed on',
    async () => {
      const source = 'int main(void) {\n    int a = 1;\n    __builtin_trap();\n    return a;\n}\n';

      const recording = await record('crash.c', source);

      expect(stepsOf(recording)).toEqual(['main:2', 'main:3']);
      expect(recording.end).toEqual({ crashed: expect.stringContaining('unreachable') });
    },
    CLANG_TIMEOUT
  );

  it(
    'steps through every pass of a loop',
    async () => {
      const source = 'int main(void) {\n    int i = 0;\n    while (1) {\n        i++;\n    }\n}\n';

      const recording = await record('loop.c', source, { stepLimit: 50 });

      expect(stepsOf(recording).slice(0, 6)).toEqual([
        'main:2',
        'main:4',
        'main:3',
        'main:4',
        'main:3',
        'main:4',
      ]);
      expect(recording.steps).toHaveLength(50);
      expect(recording.end).toEqual({ stepLimit: 50 });
    },
    CLANG_TIMEOUT
  );

  it(
    'stops a program that runs past the time limit, keeping the steps it took',
    async () => {
      const source = 'int main(void) {\n    int i = 0;\n    while (1) {\n        i++;\n    }\n}\n';

      const recording = await record('slow.c', source, { stepLimit: Infinity, timeLimitMs: 50 });

      expect(stepsOf(recording).slice(0, 3)).toEqual(['main:2', 'main:4', 'main:3']);
      expect(recording.end).toEqual({ timeLimit: 50 });
    },
    CLANG_TIMEOUT
  );

  it(
    'stops a loop that repeats one line forever',
    async () => {
      // Every pass repeats line 2, which isn't a new step, but still counts
      // towards the limit.
      const source = 'int main(void) {\n    while (1) {}\n}\n';

      const recording = await record('spin.c', source, { stepLimit: 50 });

      expect(stepsOf(recording)).toEqual(['main:2']);
      expect(recording.end).toEqual({ stepLimit: 50 });
    },
    CLANG_TIMEOUT
  );

  describe('variables', () => {
    it(
      'lists the variables in scope at each step, named and typed as GDB names them',
      async () => {
        const recording = await record('variables.c', fixture('variables.c'));

        // GDB skips main's first line, so its first state is the second step.
        const steps = recording.steps.slice(1, 1 + gdb.states.length);
        expect(steps.map((step) => `${step.function}:${step.line}`)).toEqual(
          gdb.states.map(({ frame_info: frame }) => `${frame.function}:${frame.line_num}`)
        );
        steps.forEach((step, index) => {
          expect(declarations(step.variables), `${step.function}:${step.line}`).toEqual(
            declarations(gdb.states[index].stack_data)
          );
        });
      },
      CLANG_TIMEOUT
    );

    it(
      'reads each variable’s value from memory as GDB shows it',
      async () => {
        const recording = await record('variables.c', fixture('variables.c'));
        const atLine23 = recording.steps.find((step) => step.line === 23)!.variables;
        const fromGdb = gdb.states.find((state) => state.frame_info.line_num === 23)!.stack_data;

        // Pointers and addresses differ between machines, so check those apart.
        (['nums', 'c', 'd', 'f'] as const).forEach((name) => {
          expect(atLine23[name].value, name).toEqual(fromGdb[name]!.value);
        });
        expect(atLine23.n.value).toEqual({ value: 7, next: '0x0' });
        expect(atLine23.p.value).toBe(atLine23.n.addr);
        expect(atLine23.s.value).toMatch(/^0x[0-9a-f]+$/);
        expect(atLine23.s.value).not.toBe('0x0');
      },
      CLANG_TIMEOUT
    );

    it(
      'shows a variable’s new value on the step after it is assigned',
      async () => {
        const recording = await record('functions.c', program('functions.c'));
        const valuesOf = (name: string) =>
          recording.steps
            .filter((step) => name in step.variables)
            .map((step) => `${step.function}:${step.line} ${name}=${step.variables[name].value}`);

        // int a = 4; then int b = square(a);
        expect(valuesOf('a')).toEqual(['main:7 a=0', 'main:8 a=4', 'main:8 a=4', 'main:9 a=4']);
        expect(valuesOf('b')).toEqual(['main:7 b=0', 'main:8 b=0', 'main:8 b=0', 'main:9 b=16']);
        expect(valuesOf('result')).toEqual(['square:2 result=0', 'square:3 result=16']);
      },
      CLANG_TIMEOUT
    );

    it(
      'lists the struct types the variables use, with their fields',
      async () => {
        const recording = await record('variables.c', fixture('variables.c'));

        expect(recording.types).toEqual(
          expect.arrayContaining(
            gdb.typeDeclarations.filter(({ typeName }) => !typeName.endsWith(']'))
          )
        );
      },
      CLANG_TIMEOUT
    );
  });
});
