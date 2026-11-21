import { describe, expect, it } from 'vitest';
import gdb from './fixtures/gdb-variables.json';
import {
  CLANG_TIMEOUT,
  declarations,
  fixture,
  program,
  record,
  stepsOf,
  UNINITIALISED_INT,
  variablesAt,
} from './__tests__/recordingTestKit';

// The variables each step shows. fixtures/gdb-variables.json was recorded from
// the GDB debugger on fixtures/variables.c.

describe('recordRun: variables', () => {
  it(
    'lists the variables in scope at each step, named and typed as GDB names them',
    async () => {
      const recording = await record('variables.c', fixture('variables.c'));

      // GDB skips main's first line, so its first state is the second step.
      const steps = recording.steps.slice(1, 1 + gdb.states.length);
      expect(
        steps.map((step) => `${step.function}:${step.line}`),
        "variables.c: steps 2 onwards as function:line, against GDB's states"
      ).toEqual(gdb.states.map(({ frame_info: frame }) => `${frame.function}:${frame.line_num}`));
      steps.forEach((step, index) => {
        expect(
          declarations(step.variables),
          `variables.c ${step.function}:${step.line}: variables as "type name", against GDB's`
        ).toEqual(declarations(gdb.states[index].stack_data));
      });
    },
    CLANG_TIMEOUT
  );

  it(
    'reads each variable’s value from memory as GDB shows it',
    async () => {
      const recording = await record('variables.c', fixture('variables.c'));
      const atLine23 = variablesAt(recording, 23);
      const fromGdb = gdb.states.find((state) => state.frame_info.line_num === 23)!.stack_data;

      // Pointers and addresses differ between machines, so check those apart.
      (['nums', 'c', 'd', 'f'] as const).forEach((name) => {
        expect(atLine23[name].value, `variables.c line 23: ${name}, against GDB's value`).toEqual(
          fromGdb[name]!.value
        );
      });
      expect(atLine23.n.value, 'variables.c line 23: the struct n').toEqual({
        value: 7,
        next: '0x0',
      });
      expect(atLine23.p.value, `variables.c line 23: p = &n, n's address ${atLine23.n.addr}`).toBe(
        atLine23.n.addr
      );
      expect(atLine23.s.value, 'variables.c line 23: the pointer s, as a hex address').toMatch(
        /^0x[0-9a-f]+$/
      );
      expect(atLine23.s.value, 'variables.c line 23: the pointer s, set to a string').not.toBe(
        '0x0'
      );
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
      expect(
        firstSteps.length,
        `uninitialised.c: steps on line 6 of fresh (steps: ${stepsOf(recording).join(', ')})`
      ).toBe(2);
      firstSteps.forEach((step, call) => {
        const { keep, n, p, c } = step.variables;
        const where = `uninitialised.c fresh(${call + 1}) line 6`;
        expect(keep.value, `${where}: parameter keep`).toBe(call + 1);
        expect(n.value, `${where}: uninitialised int n`).toBe(UNINITIALISED_INT);
        expect(p.value, `${where}: uninitialised int *p`).toBe('0xaaaaaaaa');
        expect(c.value, `${where}: uninitialised char c`).toBe(-86);
      });
      lastSteps.forEach((step, call) => {
        const { n, p, c } = step.variables;
        const where = `uninitialised.c fresh(${call + 1}) line 9`;
        expect(n.value, `${where}: n = keep`).toBe(call + 1);
        expect(p.value, `${where}: p = &n, n's address ${n.addr}`).toBe(n.addr);
        expect(c.value, `${where}: c = (char) keep`).toBe(call + 1);
      });
      // calloc still hands out zeroed memory.
      expect(
        variablesAt(recording, 15).total.value,
        'uninitialised.c line 15: total = fresh(1) + fresh(2), each 2 * keep'
      ).toBe(1 + 1 + 2 + 2);
      expect(
        recording.end,
        'uninitialised.c: how the run ended (total + *zeroed, where calloc zeroed *zeroed)'
      ).toEqual({ exitCode: 6 });
    },
    CLANG_TIMEOUT
  );

  // GDB sends a string with its quotes, and the first 200 elements of an
  // array (its default `print elements`). For buf it sends the unused bytes
  // as escapes; showing the string up to its end is clearer.
  it.each([
    {
      name: 'arrays.c: char arrays as strings, escaped as GDB escapes them, and long arrays cut to 200',
      file: 'arrays.c',
      source: [
        'int main(void) {', // 1
        '    char text[] = "hi";', // 2
        '    char buf[8] = "ab";', // 3
        '    int big[300];', // 4
        '    for (int i = 0; i < 300; i++) big[i] = i;', // 5
        '    char odd[] = "\\a\\b\\t\\"\\001";', // 6
        '    return text[0] + buf[0] + big[299] + odd[0];', // 7
        '}', // 8
      ],
      step: 7,
      values: {
        text: '"hi"',
        buf: '"ab"',
        big: Array.from({ length: 200 }, (_, i) => i),
        odd: '"\\a\\b\\t\\"\\001"',
      },
    },
    {
      name: 'types.c: negative enums, bit-fields and arrays of a typedef’d struct',
      file: 'types.c',
      source: [
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
      ],
      step: 10,
      values: {
        nodes: [
          { value: 2, next: '0x0' },
          { value: 3, next: '0x0' },
        ],
        status: -1,
        flags: { a: 1, b: 1, c: -2 },
      },
    },
    {
      name: 'shape.c: an anonymous union’s fields, null for numbers it can’t read, and an enum array as numbers',
      file: 'shape.c',
      source: [
        'struct shape { int kind; union { int side; float radius; }; };', // 1
        'int main(void) {', // 2
        '    struct shape square = {1, {4}};', // 3
        '    long double big = 1.0L;', // 4
        '    enum __attribute__((packed)) charset { A = 65, B } letters[2] = {A, B};', // 5
        '    double _Complex z = 1.0;', // 6
        '    double after = 2.5;', // 7
        '    return 0;', // 8
        '}', // 9
      ],
      // The final step, as the old test read it.
      step: 'last' as const,
      values: {
        square: { kind: 1, side: 4, radius: expect.any(Number) },
        big: null,
        // An enum isn't a char, whatever it's called.
        letters: [65, 66],
        z: null,
        after: 2.5,
      },
    },
  ])(
    'reads $name',
    async ({ name, file, source, step, values }) => {
      const recording = await record(file, source.join('\n'));
      const last = recording.steps.at(-1);
      const variables = step === 'last' ? (last?.variables ?? {}) : variablesAt(recording, step);
      const where = step === 'last' ? `the last step (line ${last?.line})` : `line ${step}`;

      Object.entries(values).forEach(([variable, expected]) => {
        expect(variables[variable]?.value, `${name}; ${where}: ${variable}`).toEqual(expected);
      });
    },
    CLANG_TIMEOUT
  );

  it(
    'shows a variable whatever its name',
    async () => {
      const source = 'int main(void) {\n    int constructor = 1;\n    return constructor;\n}\n';

      const recording = await record('names.c', source);

      expect(
        Object.entries(recording.steps[1].variables),
        'names.c line 3: the variables listed (one int named constructor, a key every JS object has)'
      ).toEqual([['constructor', expect.objectContaining({ typeName: 'int', value: 1 })]]);
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

      expect(typeNames, 'names.c line 19: each variable’s type name').toEqual({
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
    'lists the struct types the variables use, with their fields',
    async () => {
      const recording = await record('variables.c', fixture('variables.c'));

      expect(
        recording.types,
        "variables.c: the struct types listed, which should include GDB's (array types aside)"
      ).toEqual(
        expect.arrayContaining(
          gdb.typeDeclarations.filter(({ typeName }) => !typeName.endsWith(']'))
        )
      );
    },
    CLANG_TIMEOUT
  );
});
