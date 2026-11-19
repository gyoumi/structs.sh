import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileAndInstrument } from './instrumenter';
import { recordRun, Recording, Step, Variable } from './recording';
import gdb from './fixtures/gdb-variables.json';
// Recorded from the GDB debugger at line 20 of e2e/programs/linked_list.c.
import gdbList from '../../../visualiser-debugger/Component/Visualizer/Parser/fixtures/gdb-linked-list-state.json';

// Needs the instrumenter built first: `pnpm run instrumenter` from the repo root.

const CLANG_TIMEOUT = 60_000;

/** An int whose bytes are all 0xAA, as an uninitialised local holds. */
const UNINITIALISED_INT = -1431655766;

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

/**
 * Steps that go back to the line of the call a function just returned from,
 * as "step N function:line": where a step is shallower than the one before it
 * and on the same line as the caller's step that made the call. GDB never
 * shows these; after a call returns, the next step is the caller's next
 * statement.
 */
const returnSteps = (recording: Recording) =>
  recording.steps.flatMap((step, index) => {
    const before = recording.steps[index - 1];
    if (!before || step.depth >= before.depth) return [];
    const caller = recording.steps
      .slice(0, index)
      .reverse()
      .find((earlier) => earlier.depth === step.depth);
    return caller && caller.function === step.function && caller.line === step.line
      ? [`step ${index + 1} ${step.function}:${step.line}`]
      : [];
  });

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
    'steps into the student’s functions, and once one returns, on to the caller’s next line',
    async () => {
      const recording = await record('functions.c', program('functions.c'));

      // No step back on line 8 once square returns, as in GDB: the next step
      // is line 9.
      expect(stepsOf(recording), 'functions.c: steps as function:line').toEqual([
        'main:7',
        'main:8',
        'square:2',
        'square:3',
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

      // After each prepend returns, the next step is main's next line.
      expect(stepsOf(recording), 'linked_list.c: steps as function:line').toEqual([
        'main:16',
        'main:17',
        ...prepend,
        'main:18',
        ...prepend,
        'main:19',
        ...prepend,
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
      // so each call ends there, as it does in GDB. Once a call returns, the
      // next step is the caller's next line (its closing brace), not line 5
      // again; main has no line after the call, so the run ends.
      expect(
        recording.steps.map((step) => `${step.function}:${step.line}@${step.depth}`),
        'fact.c (fact(3)): steps as function:line@depth'
      ).toEqual([
        'main:9@0',
        'fact:2@1',
        'fact:5@1',
        'fact:2@2',
        'fact:5@2',
        'fact:2@3',
        'fact:3@3',
        'fact:6@3',
        'fact:6@2',
        'fact:6@1',
      ]);
      // Each call reads its own n, from its own frame.
      expect(
        recording.steps
          .filter((step) => step.function === 'fact')
          .map((step) => `${step.line}@${step.depth} n=${step.variables.n.value}`),
        'fact.c (fact(3)): n at each step in fact, as line@depth'
      ).toEqual([
        '2@1 n=3',
        '5@1 n=3',
        '2@2 n=2',
        '5@2 n=2',
        '2@3 n=1',
        '3@3 n=1',
        '6@3 n=1',
        '6@2 n=2',
        '6@1 n=3',
      ]);
    },
    CLANG_TIMEOUT
  );

  it(
    'never steps back onto the line of a call once it returns',
    async () => {
      const recursive = [
        'int fact(int n) {',
        '    if (n <= 1) {',
        '        return 1;',
        '    }',
        '    return n * fact(n - 1);',
        '}',
        'int main(void) {',
        '    return fact(3) == 6 ? 0 : 1;',
        '}',
      ].join('\n');
      const programs: [string, string][] = [
        ['functions.c', program('functions.c')],
        ['linked_list.c', program('linked_list.c')],
        ['fact.c', recursive],
      ];

      const recordings = await Promise.all(programs.map(([name, source]) => record(name, source)));
      recordings.forEach((recording, index) => {
        const [name] = programs[index];
        expect(
          returnSteps(recording),
          `${name}: steps back on the line that made a call, right after it returned (GDB shows none); all steps: ${stepsOf(recording).join(', ')}`
        ).toEqual([]);
      });
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

  describe('a crash right after a call returns', () => {
    /** The last step as "function:line@depth", and the steps before it, for messages. */
    const lastStep = (recording: Recording) => {
      const last = recording.steps.at(-1);
      return last && `${last.function}:${last.line}@${last.depth}`;
    };

    it(
      'ends on the caller’s line, with its variables, when it crashes as the call returns',
      async () => {
        const source = [
          'int zero(void) {', // 1
          '    return 0;', // 2
          '}', // 3
          'int main(void) {', // 4
          '    int a = 1;', // 5
          '    return a / zero();', // 6: divides by zero once zero() returns
          '}', // 7
        ].join('\n');

        const recording = await record('divide.c', source);
        const steps = stepsOf(recording).join(', ');

        expect(recording.end, `divide.c: how the run ended (steps: ${steps})`).toEqual({
          crashed: expect.any(String),
        });
        expect(
          lastStep(recording),
          `divide.c crashes in main on line 6 after zero() returns: last step, as function:line@depth (steps: ${steps})`
        ).toBe('main:6@0');
        expect(
          recording.steps.at(-1)?.variables.a?.value,
          `divide.c: a in the last step's variables (steps: ${steps})`
        ).toBe(1);
        expect(
          recording.steps.some((step) => step.function === 'zero'),
          `divide.c: the call to zero() still has its own steps before the crash (steps: ${steps})`
        ).toBe(true);
      },
      CLANG_TIMEOUT
    );

    it(
      'ends on the caller’s line when it dereferences a NULL pointer a call returned',
      async () => {
        const source = [
          '#include <stddef.h>', // 1
          'struct node { int value; struct node *next; };', // 2
          'struct node *none(void) {', // 3
          '    return NULL;', // 4
          '}', // 5
          'int main(void) {', // 6
          '    struct node *n = none();', // 7
          '    return none()->value;', // 8: reads through the NULL none() returned
          '}', // 9
        ].join('\n');

        const recording = await record('none.c', source);
        const steps = stepsOf(recording).join(', ');

        expect(recording.end, `none.c: how the run ended (steps: ${steps})`).toEqual({
          crashed: 'NULL pointer dereference',
        });
        expect(
          lastStep(recording),
          `none.c dereferences NULL in main on line 8 after none() returns: last step, as function:line@depth (steps: ${steps})`
        ).toBe('main:8@0');
        expect(
          recording.steps.at(-1)?.variables.n?.value,
          `none.c: n in the last step's variables (steps: ${steps})`
        ).toBe('0x0');
      },
      CLANG_TIMEOUT
    );

    it(
      'adds no step when the crash is inside the called function, on a line it has a step for',
      async () => {
        const source = [
          'int divide(int x, int y) {', // 1
          '    return x / y;', // 2: divides by zero
          '}', // 3
          'int main(void) {', // 4
          '    int a = divide(1, 0);', // 5
          '    return a;', // 6
          '}', // 7
        ].join('\n');

        const recording = await record('inside.c', source);
        const steps = stepsOf(recording).join(', ');

        expect(recording.end, `inside.c: how the run ended (steps: ${steps})`).toEqual({
          crashed: expect.any(String),
        });
        expect(
          stepsOf(recording),
          'inside.c crashes inside divide() on line 2, which already has a step: steps as function:line'
        ).toEqual(['main:5', 'divide:2']);
      },
      CLANG_TIMEOUT
    );
  });

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

        // int a = 4; then int b = square(a); Before it's assigned, a variable
        // holds the 0xAA bytes its frame is filled with. b gets square's
        // result on the step after the call, line 9.
        expect(valuesOf('a'), 'functions.c: a at each step in main').toEqual([
          `main:7 a=${UNINITIALISED_INT}`,
          'main:8 a=4',
          'main:9 a=4',
        ]);
        expect(valuesOf('b'), 'functions.c: b at each step in main').toEqual([
          `main:7 b=${UNINITIALISED_INT}`,
          `main:8 b=${UNINITIALISED_INT}`,
          'main:9 b=16',
        ]);
        expect(valuesOf('result'), 'functions.c: result at each step in square').toEqual([
          `square:2 result=${UNINITIALISED_INT}`,
          'square:3 result=16',
        ]);
        // A parameter has its value from the call's first step.
        expect(valuesOf('x'), 'functions.c: x at each step in square').toEqual([
          'square:2 x=4',
          'square:3 x=4',
        ]);
      },
      CLANG_TIMEOUT
    );

    it(
      'shows an uninitialised local as garbage, not 0, in every call',
      async () => {
        const source = [
          '#include <stdlib.h>', // 1
          'int fresh(int keep) {', // 2
          '    int n;', // 3
          '    int *p;', // 4
          '    char c;', // 5
          '    n = keep;', // 6
          '    p = &n;', // 7
          '    c = (char) keep;', // 8
          '    return *p + c;', // 9
          '}', // 10
          'int main(void) {', // 11
          '    int *zeroed = calloc(1, sizeof(int));', // 12
          '    int total = fresh(1);', // 13
          '    total += fresh(2);', // 14
          '    return total + *zeroed;', // 15
          '}', // 16
        ].join('\n');

        const recording = await record('uninitialised.c', source);
        const calls = recording.steps.filter((step) => step.function === 'fresh');
        const firstSteps = calls.filter((step) => step.line === 6);
        const lastSteps = calls.filter((step) => step.line === 9);

        // Each call's frame is filled again, so the second call doesn't see the
        // first one's values. Parameters keep the value they were passed.
        expect(firstSteps).toHaveLength(2);
        firstSteps.forEach((step, call) => {
          const { keep, n, p, c } = step.variables;
          expect(keep.value).toBe(call + 1);
          expect(n.value).toBe(UNINITIALISED_INT);
          expect(p.value).toBe('0xaaaaaaaa');
          expect(c.value).toBe(-86);
        });
        lastSteps.forEach((step, call) => {
          const { n, p, c } = step.variables;
          expect(n.value).toBe(call + 1);
          expect(p.value).toBe(n.addr);
          expect(c.value).toBe(call + 1);
        });
        // calloc still hands out zeroed memory.
        const atReturn = recording.steps.find((step) => step.line === 15)!;
        expect(atReturn.variables.total.value).toBe(1 + 1 + 2 + 2);
        expect(recording.end).toEqual({ exitCode: 6 });
      },
      CLANG_TIMEOUT
    );

    it(
      'shows char arrays as strings and long arrays cut short, as GDB does',
      async () => {
        const source = [
          'int main(void) {', // 1
          '    char text[] = "hi";', // 2
          '    char buf[8] = "ab";', // 3
          '    int big[300];', // 4
          '    for (int i = 0; i < 300; i++) big[i] = i;', // 5
          '    char odd[] = "\\a\\b\\t\\"\\001";', // 6
          '    return text[0] + buf[0] + big[299] + odd[0];', // 7
          '}', // 8
        ].join('\n');

        const recording = await record('arrays.c', source);
        const { text, buf, big, odd } = recording.steps.find((step) => step.line === 7)!.variables;

        // GDB sends "hi" with its quotes, and the first 200 elements of an
        // array (its default `print elements`). For buf it sends the unused
        // bytes as escapes; showing the string up to its end is clearer.
        expect(text.value).toBe('"hi"');
        expect(buf.value).toBe('"ab"');
        expect(big.value).toEqual(Array.from({ length: 200 }, (_, i) => i));
        // Escaped as GDB escapes them.
        expect(odd.value).toBe('"\\a\\b\\t\\"\\001"');
      },
      CLANG_TIMEOUT
    );

    it(
      'shows a variable whatever its name',
      async () => {
        const source = 'int main(void) {\n    int constructor = 1;\n    return constructor;\n}\n';

        const recording = await record('names.c', source);

        expect(Object.entries(recording.steps[1].variables)).toEqual([
          ['constructor', expect.objectContaining({ typeName: 'int', value: 1 })],
        ]);
      },
      CLANG_TIMEOUT
    );

    it(
      'reads negative enums, bit-fields and arrays of a typedef’d struct',
      async () => {
        const source = [
          'typedef struct node Node;', // 1
          'typedef Node Alias; struct node { int value; Alias *next; };', // 2
          'enum status { FAILED = -1, OK = 1 };', // 3
          'struct flags { unsigned a : 1; unsigned b : 1; int c : 3; };', // 4
          'int main(void) {', // 5
          '    Node first = {1, 0};', // 6
          '    Alias nodes[2] = {{2, 0}, {3, 0}};', // 7
          '    enum status status = FAILED;', // 8
          '    struct flags flags = {1, 1, -2};', // 9
          '    return 0;', // 10
          '}', // 11
        ].join('\n');

        const recording = await record('types.c', source);
        const { nodes, status, flags } = recording.steps.find((s) => s.line === 10)!.variables;

        expect(nodes.value).toEqual([
          { value: 2, next: '0x0' },
          { value: 3, next: '0x0' },
        ]);
        expect(status.value).toBe(-1);
        expect(flags.value).toEqual({ a: 1, b: 1, c: -2 });
      },
      CLANG_TIMEOUT
    );

    it(
      'names pointers, arrays and functions in any combination as GDB does',
      async () => {
        const source = [
          'int twice(int x) { return 2 * x; }', // 1
          'int sum(int n, ...) { return n; }', // 2
          'int main(void) {', // 3
          '    int a[3] = {0};', // 4
          '    int (*p)[3] = &a;', // 5
          '    int (*rows[2])[3] = {&a, &a};', // 6
          '    int (*callbacks[2])(int) = {twice, twice};', // 7
          '    int (*variadic)(int, ...) = sum;', // 8
          '    char *words[2] = {0};', // 9
          '    int grid[2][3] = {{0}};', // 10
          '    int (**pp)[3] = &p;', // 11
          '    int (* const callback)(int) = twice;', // 12
          '    char * const fixed = 0;', // 13
          '    const char *text = 0;', // 14
          '    int (* const pa)[3] = &a;', // 15
          '    char * const volatile both = 0;', // 16
          '    const char * const *cp = 0;', // 17
          '    int * restrict r = 0;', // 18
          '    return 0;', // 19
          '}', // 20
        ].join('\n');

        const recording = await record('names.c', source);
        const typeNames = Object.fromEntries(
          Object.entries(recording.steps.at(-1)!.variables).map(([name, v]) => [name, v.typeName])
        );

        expect(typeNames).toEqual({
          a: 'int [3]',
          p: 'int (*)[3]',
          rows: 'int (*[2])[3]',
          callbacks: 'int (*[2])(int)',
          variadic: 'int (*)(int, ...)',
          words: 'char *[2]',
          grid: 'int [2][3]',
          pp: 'int (**)[3]',
          callback: 'int (* const)(int)',
          fixed: 'char * const',
          text: 'const char *',
          pa: 'int (* const)[3]',
          both: 'char * const volatile',
          cp: 'const char * const *',
          r: 'int * restrict',
        });
      },
      CLANG_TIMEOUT
    );

    it(
      'shows the fields of an anonymous union, and nothing for a number it can’t read',
      async () => {
        const source = [
          'struct shape { int kind; union { int side; float radius; }; };', // 1
          'int main(void) {', // 2
          '    struct shape square = {1, {4}};', // 3
          '    long double big = 1.0L;', // 4
          '    enum __attribute__((packed)) charset { A = 65, B } letters[2] = {A, B};', // 5
          '    double _Complex z = 1.0;', // 6
          '    double after = 2.5;', // 7
          '    return 0;', // 8
          '}', // 9
        ].join('\n');

        const recording = await record('shape.c', source);
        const { square, big, letters, z, after } = recording.steps.at(-1)!.variables;

        expect(square.value).toEqual({ kind: 1, side: 4, radius: expect.any(Number) });
        expect(big.value).toBeNull();
        // An enum isn't a char, whatever it's called.
        expect(letters.value).toEqual([65, 66]);
        expect(z.value).toBeNull();
        expect(after.value).toBe(2.5);
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

  describe('the heap', () => {
    /** The values of the list that starts at `head`, following `next`. */
    const listFrom = (heap: Recording['steps'][number]['heap'], head: string) => {
      const values = [];
      let at = head;
      while (at !== '0x0') {
        const node = heap[at].value as Record<string, { value: string | number }>;
        values.push(node.value.value);
        at = node.next.value as string;
      }
      return values;
    };

    it(
      'shows the structs reachable from the variables, as GDB shows the heap',
      async () => {
        const recording = await record('linked_list.c', program('linked_list.c'));
        const step = recording.steps.find((s) => s.line === 20)!;

        expect(listFrom(step.heap, step.variables.list.value as string)).toEqual(
          listFrom(gdbList.heap_data, gdbList.stack_data.list.value)
        );
        // The same shape as GDB's entries, apart from the addresses.
        const [gdbEntry] = Object.values(gdbList.heap_data);
        Object.values(step.heap).forEach((entry) => {
          expect(entry.typeName).toBe(gdbEntry.typeName);
          expect(Object.keys(entry.value as object)).toEqual(Object.keys(gdbEntry.value));
          expect((entry.value as Record<string, unknown>).value).toEqual({
            kind: 'int',
            value: expect.any(Number),
            addr: null,
          });
        });
        expect(Object.keys(step.heap)).toHaveLength(3);
      },
      CLANG_TIMEOUT
    );

    it(
      'keeps showing what a caller can reach while a function it called runs',
      async () => {
        const recording = await record('linked_list.c', program('linked_list.c'));
        // The third call to prepend: main's list already holds 2 and 3.
        const inThirdPrepend = recording.steps.filter((s) => s.function === 'prepend')[8];

        expect(inThirdPrepend.line).toBe(9);
        expect(Object.values(inThirdPrepend.heap).map((entry) => entry.typeName)).toEqual([
          'struct node',
          'struct node',
        ]);
      },
      CLANG_TIMEOUT
    );

    it(
      'never drops a node from the heap for one step and shows it again, as a call returns',
      async () => {
        // What the user saw: a node prepend made vanished on the step after
        // the call returned, before `list = ...` stored it, then came back.
        const recording = await record('linked_list.c', program('linked_list.c'));
        const onHeap = recording.steps.map((step) => new Set(Object.keys(step.heap)));
        const describeStep = (index: number) => {
          const step = recording.steps[index];
          const values = Object.values(step.heap).map(
            (entry) => (entry.value as Record<string, { value: unknown }>).value?.value
          );
          return `step ${index + 1} ${step.function}:${step.line} heap values [${values.join(', ')}]`;
        };

        // A node that is on the heap at some step and again later must be
        // there at every step in between.
        const gaps: string[] = [];
        onHeap.forEach((addrs, index) => {
          addrs.forEach((addr) => {
            const back = onHeap.findIndex((later, at) => at > index && later.has(addr));
            const missing = onHeap.findIndex(
              (between, at) => at > index && at < back && !between.has(addr)
            );
            if (
              back !== -1 &&
              missing !== -1 &&
              !gaps.some((gap) => gap.startsWith(`node ${addr} `))
            ) {
              gaps.push(
                `node ${addr} is on the heap at ${describeStep(index)}, missing at ${describeStep(missing)}, back at ${describeStep(back)}`
              );
            }
          });
        });

        expect(
          gaps,
          `linked_list.c: nodes that disappear from the heap for a step and come back. Every step:\n${recording.steps.map((_, i) => describeStep(i)).join('\n')}\n`
        ).toEqual([]);
      },
      CLANG_TIMEOUT
    );

    const nodeProgram = (body: string) =>
      [
        '#include <stdlib.h>',
        '#include <string.h>',
        'struct node { int value; struct node *next; };',
        'int main(void) {',
        body,
        '    return 0;',
        '}',
      ].join('\n');

    it(
      'does not follow pointers to freed memory or into the stack',
      async () => {
        const source = nodeProgram(
          [
            '    struct node *gone = malloc(sizeof(struct node));', // 5
            '    free(gone);', // 6
            '    struct node local = {1, NULL};', // 7
            '    struct node *here = &local;', // 8
            '    int done = 1;', // 9
          ].join('\n')
        );

        const recording = await record('freed.c', source);
        const last = recording.steps.find((s) => s.line === 9)!;

        expect(last.variables.gone.value).not.toBe('0x0');
        expect(last.heap).toEqual({});
      },
      CLANG_TIMEOUT
    );

    it(
      'follows memory from calloc and realloc',
      async () => {
        const source = nodeProgram(
          [
            '    struct node *a = calloc(1, sizeof(struct node));', // 5
            '    a = realloc(a, 2 * sizeof(struct node));', // 6
            '    a->value = 7;', // 7
            '    int done = 1;', // 8
          ].join('\n')
        );

        const recording = await record('calloc.c', source);
        const last = recording.steps.find((s) => s.line === 8)!;

        expect(Object.values(last.heap).map((entry) => entry.value)).toEqual([
          {
            value: { kind: 'int', value: 7, addr: null },
            next: { kind: 'struct node *', value: '0x0', addr: null },
          },
        ]);
      },
      CLANG_TIMEOUT
    );

    it.each([
      ['reading through it', '    struct node *p = NULL;\n    int v = p->value;'],
      ['writing through it', '    struct node *p = NULL;\n    p->next = p;'],
      ['copying from it', '    struct node *p = NULL;\n    struct node copy = *p;'],
      ['passing it to the C library', '    char *s = NULL;\n    int n = strlen(s);'],
    ])(
      'crashes on a NULL pointer when %s, on the line that did it',
      async (_, body) => {
        const recording = await record('null.c', nodeProgram(body));

        expect(recording.end).toEqual({ crashed: 'NULL pointer dereference' });
        expect(recording.steps.at(-1)?.line).toBe(6);
      },
      CLANG_TIMEOUT
    );

    it(
      'stops a recording that outgrows its size budget, keeping the steps before it',
      async () => {
        const source = nodeProgram(
          [
            '    struct node *list = NULL;', // 5
            '    for (int i = 0; i < 1000; i++) {', // 6
            '        struct node *n = malloc(sizeof(struct node));', // 7
            '        n->value = i;', // 8
            '        n->next = list;', // 9
            '        list = n;', // 10
            '    }', // 11
          ].join('\n')
        );

        const recording = await record('big.c', source, { sizeLimit: 20_000 });

        expect(recording.end).toEqual({ sizeLimit: 20_000 });
        expect(recording.steps.length).toBeGreaterThan(10);
      },
      CLANG_TIMEOUT
    );

    /** The heap's entries at the step on `line`, by typeName, with their values. */
    const heapAt = (recording: Recording, line: number) =>
      Object.values(recording.steps.find((s) => s.line === line)!.heap).map(
        (entry) =>
          `${entry.typeName} ${JSON.stringify(
            Object.fromEntries(Object.entries(entry.value).map(([name, f]) => [name, f.value]))
          )}`
      );

    it(
      'names a nameless struct by its typedef, even through a const pointer',
      async () => {
        const source = [
          '#include <stdlib.h>',
          'typedef struct { int value; } Node;',
          'int main(void) {',
          '    Node *n = malloc(sizeof(Node));', // 4
          '    n->value = 7;', // 5
          '    const Node *view = n;', // 6
          '    n = NULL;', // 7
          '    int done = 1;', // 8
          '    return done;',
          '}',
        ].join('\n');

        // The visualiser matches heap nodes by this name, so it's "Node",
        // the way the type is declared, not "const Node".
        expect(heapAt(await record('named.c', source), 8)).toEqual(['Node {"value":7}']);
      },
      CLANG_TIMEOUT
    );

    it(
      'follows tables of pointers, as a hash table uses',
      async () => {
        const source = nodeProgram(
          [
            '    struct node **table = calloc(4, sizeof(struct node *));', // 5
            '    table[2] = malloc(sizeof(struct node));', // 6
            '    table[2]->value = 5;', // 7
            '    table[2]->next = NULL;', // 8
            '    int done = 1;', // 9
          ].join('\n')
        );

        expect(heapAt(await record('table.c', source), 9)).toEqual([
          'struct node {"value":5,"next":"0x0"}',
        ]);
      },
      CLANG_TIMEOUT
    );

    it(
      'shows structs inside heap structs, and nodes past 200 array elements',
      async () => {
        const source = [
          '#include <stdlib.h>',
          'struct node { int value; struct node *next; };',
          'struct box { int tag; struct node child; };',
          'int main(void) {',
          '    struct box *box = calloc(1, sizeof(struct box));', // 5
          '    box->child.value = 9;', // 6
          '    struct node *roots[201] = {0};', // 7
          '    roots[200] = calloc(1, sizeof(struct node));', // 8
          '    int done = 1;', // 9
          '    return 0;',
          '}',
        ].join('\n');

        expect((await heapAt(await record('box.c', source), 9)).sort()).toEqual([
          'struct box {"tag":0,"child":{"value":9,"next":"0x0"}}',
          'struct node {"value":0,"next":"0x0"}',
          'struct node {"value":9,"next":"0x0"}',
        ]);
      },
      CLANG_TIMEOUT
    );

    it(
      'reads bit-fields and changes between special numbers, and to -0, on the heap',
      async () => {
        const source = [
          '#include <stdlib.h>',
          'struct flags { unsigned a : 1; int c : 3; double x; };',
          'int main(void) {',
          '    struct flags *f = calloc(1, sizeof(struct flags));', // 4
          '    f->a = 1;', // 5
          '    f->c = -2;', // 6
          '    f->x = 1.0 / 0.0;', // 7
          '    f->x = 0.0 / 0.0;', // 8
          '    f->x = 0.0;', // 9
          '    f->x = -0.0;', // 10
          '    return 0;', // 11
          '}',
        ].join('\n');

        const recording = await record('flags.c', source);

        expect(heapAt(recording, 7)).toEqual(['struct flags {"a":1,"c":-2,"x":0}']);
        const x = (line: number) =>
          Object.values(recording.steps.find((s) => s.line === line)!.heap)[0].value.x.value;
        expect([x(8), x(9), x(10), x(11)]).toEqual([Infinity, NaN, 0, -0]);
      },
      CLANG_TIMEOUT
    );

    it(
      'counts a big heap towards the size budget on every step, even unchanged',
      async () => {
        const source = nodeProgram(
          [
            '    struct node *list = NULL;', // 5
            '    for (int i = 0; i < 300; i++) {', // 6
            '        struct node *n = malloc(sizeof(struct node));', // 7
            '        n->value = i;', // 8
            '        n->next = list;', // 9
            '        list = n;', // 10
            '    }', // 11
            '    int total = 0;', // 12
            '    for (int i = 0; i < 3000; i++) total += i;', // 13
          ].join('\n')
        );

        const recording = await record('steady.c', source, { sizeLimit: 2_000_000 });

        expect(recording.end).toEqual({ sizeLimit: 2_000_000 });
      },
      CLANG_TIMEOUT
    );

    it(
      'finds the struct inside each of 20,000 heap blocks quickly',
      async () => {
        // Each box's child starts inside the box, so the recorder has to find
        // which block it belongs to. The loop runs on one line, so one step.
        const source = [
          '#include <stdlib.h>',
          'struct node { int value; struct node *next; };',
          'struct box { int tag; struct node child; struct box *next; };',
          'int main(void) {',
          '    struct box *list = NULL;', // 5
          '    for (int i = 0; i < 20000; i++) { struct box *b = calloc(1, sizeof(struct box)); b->next = list; list = b; }', // 6
          '    int a = 1;', // 7
          '    int b = 2;', // 8
          '    int c = 3;', // 9
          '    int d = 4;', // 10
          '    int e = 5;', // 11
          '    return a + b + c + d + e;', // 12
          '}',
        ].join('\n');

        const recording = await record('boxes.c', source, {
          stepLimit: Infinity,
          timeLimitMs: 4000,
        });

        expect(recording.end).toEqual({ exitCode: 15 });
        expect(Object.keys(recording.steps.at(-1)?.heap ?? {})).toHaveLength(40000);
      },
      CLANG_TIMEOUT
    );

    it(
      'stops showing a struct once realloc shrinks its block past it, even when malloc reuses that memory',
      async () => {
        // fixtures/realloc_shrink.c: nodes = malloc(4 nodes) on line 9; last
        // points at nodes[3] on line 14 (so it's shown), then is dropped on
        // line 15; realloc shrinks the block to 1 node on line 16, in place;
        // numbers = malloc(4 ints) on line 17, which wasm's malloc puts in the
        // tail realloc gave back, and lines 18-20 fill it with 1000..1003.
        const name = 'realloc_shrink.c';
        const recording = await record(name, fixture(name));
        const { steps } = recording;
        const pointer = (index: number, variable: string) =>
          steps[index].variables[variable]?.value as string;
        const NODE_SIZE = 8; // struct node on wasm32: an int and a 4-byte pointer
        const describeStep = (index: number) =>
          `step ${index + 1} ${steps[index].function}:${steps[index].line}`;

        // The situation the test needs: if any of these fail, the program no
        // longer sets it up, rather than the recorder being wrong.
        const shownLast = steps.findIndex((step) => step.line === 15);
        const tail = pointer(shownLast, 'last');
        expect(
          steps[shownLast]?.heap[tail]?.typeName,
          `${name} line 15: nodes[3] (last = ${tail}) is shown on the heap before the realloc`
        ).toBe('struct node');
        const afterRealloc = steps.findIndex((step) => step.line === 17);
        const shrunk = pointer(afterRealloc, 'shrunk');
        expect(
          shrunk,
          `${name} line 17: realloc(nodes, 1 node) on line 16 shrank the block in place (shrunk == nodes)`
        ).toBe(pointer(afterRealloc, 'nodes'));
        const afterMalloc = steps.findIndex((step) => step.line === 18);
        const numbers = parseInt(pointer(afterMalloc, 'numbers'), 16);
        expect(
          numbers <= parseInt(tail, 16) && parseInt(tail, 16) + NODE_SIZE <= numbers + 16,
          `${name} line 18: malloc(4 ints) on line 17 reused the tail, covering the old nodes[3] at ${tail} ` +
            `(numbers = ${pointer(afterMalloc, 'numbers')})`
        ).toBe(true);

        // From the realloc on, no struct node may be shown past the shrunk
        // block's end: that memory isn't a node any more.
        const end = parseInt(shrunk, 16) + NODE_SIZE;
        const stale = steps.slice(afterRealloc).flatMap((step, offset) =>
          Object.values(step.heap)
            .filter((entry) => entry.typeName === 'struct node' && parseInt(entry.addr, 16) >= end)
            .map(
              (entry) =>
                `${describeStep(afterRealloc + offset)}: struct node at ${entry.addr} ` +
                `${JSON.stringify(Object.fromEntries(Object.entries(entry.value).map(([field, f]) => [field, f.value])))}`
            )
        );
        expect(
          stale,
          `${name}: struct nodes shown after realloc shrank nodes (${shrunk}) to 1 node, at or past its new end ` +
            `0x${end.toString(16)}; that memory was given back and reused by numbers (${pointer(afterMalloc, 'numbers')}, ` +
            `ints 1000..1003), so they are read from the ints`
        ).toEqual([]);
      },
      CLANG_TIMEOUT
    );

    describe('a pool whose memory is reused as another struct', () => {
      // fixtures/pool_reuse.c: pool = malloc(64) on line 16; words =
      // malloc(2 ints) on line 17 holds 777 and 0 (lines 18-19), the bytes of
      // a struct node, but only an int * ever points at it. n points at a
      // struct node at pool + 8 (line 20), so it's shown, then is dropped on
      // line 23. t points at a struct triple at pool + 4 (line 24), whose c
      // field covers the old node's next; line 27 stores words' address in
      // t->c, as an int. Nothing reaches words as a struct node.
      const name = 'pool_reuse.c';
      const NODE_SIZE = 8; // struct node on wasm32: an int and a 4-byte pointer
      const TRIPLE_SIZE = 12;
      const pointer = (step: Step, variable: string) => step.variables[variable]?.value as string;
      const describeEntry = (step: Step, address: string) => {
        const entry = step.heap[address];
        return `${entry.typeName} at ${address} ${JSON.stringify(
          Object.fromEntries(Object.entries(entry.value).map(([field, f]) => [field, f.value]))
        )}`;
      };
      const describeStep = (steps: Step[], index: number) =>
        `step ${index + 1} ${steps[index].function}:${steps[index].line}`;

      const recordPool = async () => {
        const recording = await record(name, fixture(name));
        const { steps } = recording;
        // The situation the tests need: if these fail, the program no longer
        // sets it up, rather than the recorder being wrong.
        const nodeShown = steps.find((step) => step.line === 23);
        const node = nodeShown && pointer(nodeShown, 'n');
        expect(
          nodeShown && node && nodeShown.heap[node]?.typeName,
          `${name} line 23: n (${node}) points at a struct node at pool + 8, shown on the heap`
        ).toBe('struct node');
        const reused = steps.findIndex((step) => step.line === 25);
        const triple = pointer(steps[reused], 't');
        expect(
          parseInt(triple, 16) + 4,
          `${name} line 25: t (${triple}) points 4 bytes before the old node (${node}), so t->c covers its next`
        ).toBe(parseInt(node!, 16));
        const words = pointer(steps.at(-1)!, 'words');
        return { steps, node: node!, reused, triple, words };
      };

      it(
        'never shows memory that only an int field points at as a struct',
        async () => {
          const { steps, words } = await recordPool();

          const phantoms = steps.flatMap((step, index) =>
            words in step.heap
              ? [`${describeStep(steps, index)}: ${describeEntry(step, words)}`]
              : []
          );
          expect(
            phantoms,
            `${name}: heap entries at words (${words}), the block holding 777, 0 that only an int * and the ` +
              `int t->c point at, so nothing reaches it as a struct: the old struct node at pool + 8 was followed ` +
              `through its next field, which is now t->c`
          ).toEqual([]);
        },
        CLANG_TIMEOUT
      );

      it(
        'shows the reused memory only as the struct that now reaches it',
        async () => {
          const { steps, reused, triple } = await recordPool();
          const start = parseInt(triple, 16);

          const wrong = steps.slice(reused).flatMap((step, offset) => {
            const where = describeStep(steps, reused + offset);
            const missing =
              step.heap[triple]?.typeName === 'struct triple'
                ? []
                : [`${where}: no struct triple at t (${triple})`];
            const overlapping = Object.keys(step.heap)
              .filter(
                (address) => address !== triple && step.heap[address].typeName === 'struct node'
              )
              .filter((address) => {
                const at = parseInt(address, 16);
                return at < start + TRIPLE_SIZE && start < at + NODE_SIZE;
              })
              .map(
                (address) =>
                  `${where}: ${describeEntry(step, address)}, inside the struct triple at ${triple}`
              );
            return [...missing, ...overlapping];
          });
          expect(
            wrong,
            `${name}: from line 25, where t points at a struct triple at pool + 4 over the old struct node at ` +
              `pool + 8, the triple should be shown and no struct node read from its bytes`
          ).toEqual([]);
        },
        CLANG_TIMEOUT
      );
    });

    it(
      'keeps showing a struct that reuses a remembered struct’s address, after its last pointer is dropped',
      async () => {
        // fixtures/pool_same_address.c: pool = malloc(64) on line 14; n
        // points at a struct node at pool + 0 (line 15), so it's shown, then
        // is dropped on line 18. Lines 19-21 write 41, 42 there through an
        // int *. p points at a struct pair at the same address on line 22,
        // so it's shown at the step on line 23, and is dropped on line 23.
        // The pool is never freed, so the pair stays shown to the end.
        const name = 'pool_same_address.c';
        const { steps } = await record(name, fixture(name));
        const describeStep = (index: number) =>
          `step ${index + 1} ${steps[index].function}:${steps[index].line}`;
        const describeHeap = (index: number) =>
          Object.values(steps[index].heap)
            .map(
              (entry) =>
                `${entry.typeName} at ${entry.addr} ${JSON.stringify(
                  Object.fromEntries(
                    Object.entries(entry.value).map(([field, f]) => [field, f.value])
                  )
                )}`
            )
            .join(', ') || 'nothing';

        // The situation the test needs: if these fail, the program no longer
        // sets it up, rather than the recorder being wrong.
        const nodeShown = steps.find((step) => step.line === 18);
        const pool = nodeShown?.variables.pool?.value as string;
        expect(
          nodeShown?.heap[pool]?.typeName,
          `${name} line 18: n points at a struct node at pool (${pool}), shown on the heap`
        ).toBe('struct node');
        const reached = steps.findIndex((step) => step.line === 23);
        expect(
          steps[reached]?.variables.p?.value,
          `${name} line 23: p points at the struct pair at pool (${pool}), the old node's address`
        ).toBe(pool);

        const wrong = steps.slice(reached).flatMap((step, offset) => {
          const entry = step.heap[pool];
          return entry?.typeName === 'struct pair'
            ? []
            : [
                `${describeStep(reached + offset)}: no struct pair at ${pool}; the whole heap holds ${describeHeap(reached + offset)}`,
              ];
        });
        expect(
          wrong,
          `${name}: from line 23, where p reaches the struct pair {left: 41, right: 42} at pool (${pool}), the ` +
            `same address as the struct node shown before, it should be shown at every step to the end (p is ` +
            `dropped on line 23, but the pool is never freed)`
        ).toEqual([]);
      },
      CLANG_TIMEOUT
    );

    it(
      'shares a heap entry between steps while it stays the same',
      async () => {
        const recording = await record('linked_list.c', program('linked_list.c'));
        const [before, after] = recording.steps.filter((s) => s.line === 19 || s.line === 20);
        const shared = Object.keys(before.heap).filter((addr) => addr in after.heap);

        expect(shared.length).toBeGreaterThan(0);
        shared.forEach((addr) => expect(after.heap[addr]).toBe(before.heap[addr]));
      },
      CLANG_TIMEOUT
    );
  });

  describe('input', () => {
    /** Where a waiting recording says the program is paused, if it says. */
    const pausedAt = (recording: Recording) => (recording.end as { at?: Step }).at;

    const SLOT_SOURCE = [
      '#include <stdio.h>', // 1
      'int slot(void) {', // 2
      '    return 1;', // 3
      '}', // 4
      'int main(void) {', // 5
      '    int values[2] = {0, 0};', // 6
      '    scanf("%d", &values[slot()]);', // 7: slot() returns, then scanf waits
      '    return values[1];', // 8
      '}', // 9
    ].join('\n');

    it(
      'says where it is paused when it waits in the caller right after a call returned',
      async () => {
        const recording = await record('slot.c', SLOT_SOURCE);
        const steps = stepsOf(recording).join(', ');
        const at = pausedAt(recording);

        expect(recording.end, `slot.c with no input: end (steps: ${steps})`).toEqual({
          waitingForInput: true,
          at: expect.anything(),
        });
        expect(
          at && `${at.function}:${at.line}@${at.depth}`,
          `slot.c waits in scanf on main's line 7 after slot() returned: end.at as function:line@depth (steps: ${steps})`
        ).toBe('main:7@0');
        expect(at?.variables.values?.value, "slot.c: values in end.at's variables").toEqual([0, 0]);
        expect(
          recording.steps.at(-1)?.function,
          `slot.c: the last recorded step is still slot()'s; end.at is not added as a step (steps: ${steps})`
        ).toBe('slot');
      },
      CLANG_TIMEOUT
    );

    it(
      'says nothing more when it waits in a call that has a step on that line',
      async () => {
        // slot() returns on line 7, and main then has a step of its own on
        // line 8, where scanf waits.
        const ownLine = SLOT_SOURCE.replace(
          '    scanf("%d", &values[slot()]);',
          '    int i = slot();\n    scanf("%d", &values[i]);'
        );
        const cases: [string, string][] = [
          ['sum_input.c (a plain scanf loop)', program('sum_input.c')],
          ['slot.c with slot() on a line before the scanf', ownLine],
        ];

        const recordings = await Promise.all(
          cases.map(([, source], i) => record(`case${i}.c`, source))
        );
        recordings.forEach((recording, i) => {
          expect(
            recording.end,
            `${cases[i][0]} with no input: end should have no "at" (steps: ${stepsOf(recording).join(', ')})`
          ).toEqual({ waitingForInput: true });
        });
      },
      CLANG_TIMEOUT
    );

    it(
      'keeps the steps a full run has, so stepping by index carries on after the input arrives',
      async () => {
        const waiting = await record('slot.c', SLOT_SOURCE);
        const full = await record('slot.c', SLOT_SOURCE, { input: { text: '5\n', eof: true } });

        expect(full.end, 'slot.c given "5\\n" and end-of-file: end').toEqual({ exitCode: 5 });
        expect(
          stepsOf(waiting),
          `slot.c: steps while waiting, against the first steps of the run given "5" (full run: ${stepsOf(full).join(', ')})`
        ).toEqual(stepsOf(full).slice(0, waiting.steps.length));
        expect(
          stepsOf(full)[waiting.steps.length],
          `slot.c given "5": the step after the ones recorded while waiting (waiting: ${stepsOf(waiting).join(', ')}; full: ${stepsOf(full).join(', ')})`
        ).toBe('main:8');
      },
      CLANG_TIMEOUT
    );

    it(
      'stops where the program waits for input it has not been given',
      async () => {
        const recording = await record('sum_input.c', program('sum_input.c'));

        expect(recording.end).toEqual({ waitingForInput: true });
        expect(stepsOf(recording).at(-1)).toBe('main:6');
      },
      CLANG_TIMEOUT
    );

    it(
      'reads the input typed so far, then waits for more',
      async () => {
        const recording = await record('sum_input.c', program('sum_input.c'), {
          input: { text: '2\n3\n', eof: false },
        });
        const totals = recording.steps
          .filter((step) => step.line === 6)
          .map((step) => step.variables.total.value);

        expect(recording.end).toEqual({ waitingForInput: true });
        expect(totals).toEqual([0, 2, 5]);
      },
      CLANG_TIMEOUT
    );

    it(
      'gives each read one line at most, as a terminal does',
      async () => {
        // Typing "a" then "b" re-records with both lines. The first read must
        // still get only "a", or the run differs from the one already shown.
        const source = [
          '#include <stdio.h>',
          '#include <unistd.h>',
          'int main(void) {',
          '    char first[16] = {0};',
          '    char second[16] = {0};',
          '    read(0, first, 15);',
          '    read(0, second, 15);',
          '    printf("[%s][%s]", first, second);',
          '    return 0;',
          '}',
        ].join('\n');

        const recording = await record('reads.c', source, {
          input: { text: 'a\nb\n', eof: false },
        });

        expect(recording.end).toEqual({ exitCode: 0 });
        expect(recording.steps.map((step) => step.output).join('')).toBe('[a\n][b\n]');
      },
      CLANG_TIMEOUT
    );

    it(
      'returns from a read of no bytes without waiting, as a terminal does',
      async () => {
        const source = [
          '#include <stdio.h>',
          '#include <unistd.h>',
          'int main(void) {',
          '    char c;',
          '    printf("%d", (int)read(0, &c, 0));',
          '    return 0;',
          '}',
        ].join('\n');

        const recording = await record('empty_read.c', source);

        expect(recording.end).toEqual({ exitCode: 0 });
        expect(recording.steps.map((step) => step.output).join('')).toBe('0');
      },
      CLANG_TIMEOUT
    );

    it(
      'keeps half a character back while waiting for input',
      async () => {
        // "é" is two bytes in UTF-8, written either side of the read.
        const source = [
          '#include <unistd.h>',
          'int main(void) {',
          '    char c;',
          '    write(1, "\\xc3", 1);',
          '    read(0, &c, 1);',
          '    write(1, "\\xa9", 1);',
          '    return 0;',
          '}',
        ].join('\n');
        const output = (recording: Recording) =>
          recording.steps.map((step) => step.output).join('');

        const waiting = await record('split.c', source);
        const done = await record('split.c', source, { input: { text: 'x', eof: true } });

        expect(waiting.end).toEqual({ waitingForInput: true });
        expect(output(waiting)).toBe('');
        expect(output(done)).toBe('é');
      },
      CLANG_TIMEOUT
    );

    it(
      'reads to the end of the input once end-of-file is sent',
      async () => {
        const recording = await record('sum_input.c', program('sum_input.c'), {
          input: { text: '2\n3\n', eof: true },
        });

        expect(recording.end).toEqual({ exitCode: 0 });
        expect(recording.steps.map((step) => step.output).join('')).toBe('total 5\n');
      },
      CLANG_TIMEOUT
    );
  });
});
