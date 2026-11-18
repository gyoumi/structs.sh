import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileAndInstrument } from './instrumenter';
import { recordRun, Recording, Variable } from './recording';
import gdb from './fixtures/gdb-variables.json';
// Recorded from the GDB debugger at line 20 of e2e/programs/linked_list.c.
import gdbList from '../../../visualiser-debugger/Component/Visualizer/Parser/fixtures/gdb-linked-list-state.json';

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
      // Each call reads its own n, from its own frame.
      expect(
        recording.steps
          .filter((step) => step.function === 'fact')
          .map((step) => `${step.line}@${step.depth} n=${step.variables.n.value}`)
      ).toEqual([
        '2@1 n=3',
        '5@1 n=3',
        '2@2 n=2',
        '5@2 n=2',
        '2@3 n=1',
        '3@3 n=1',
        '6@3 n=1',
        '5@2 n=2',
        '6@2 n=2',
        '5@1 n=3',
        '6@1 n=3',
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
        // A parameter has its value from the call's first step.
        expect(valuesOf('x')).toEqual(['square:2 x=4', 'square:3 x=4']);
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
