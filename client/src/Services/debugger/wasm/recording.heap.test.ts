import { describe, expect, it } from 'vitest';
// Recorded from the GDB debugger at line 20 of e2e/programs/linked_list.c.
import gdbList from '../../../visualiser-debugger/Component/Visualizer/Parser/fixtures/gdb-linked-list-state.json';
import {
  CLANG_TIMEOUT,
  describeHeap,
  heapAt,
  nodeProgram,
  program,
  record,
  stepsOf,
} from './__tests__/recordingTestKit';

// Which heap structs each step shows: the ones the variables reach, followed
// through their pointers. Memory reused as another struct is in
// recording.heapReuse.test.ts.

/** The values of the list that starts at `head`, following `next`. */
const listFrom = (heap: Record<string, { value: unknown }>, head: string) => {
  const values = [];
  let at = head;
  while (at !== '0x0') {
    const node = heap[at].value as Record<string, { value: string | number }>;
    values.push(node.value.value);
    at = node.next.value as string;
  }
  return values;
};

describe('recordRun: the heap', () => {
  it(
    'shows the structs reachable from the variables, as GDB shows the heap',
    async () => {
      const recording = await record('linked_list.c', program('linked_list.c'));
      const step = recording.steps.find((s) => s.line === 20)!;
      const heap = describeHeap(step);

      expect(
        listFrom(step.heap, step.variables.list.value as string),
        `linked_list.c line 20: the list's values from list, against GDB's (heap: ${heap})`
      ).toEqual(listFrom(gdbList.heap_data, gdbList.stack_data.list.value));
      // The same shape as GDB's entries, apart from the addresses. GDB's
      // recording keeps the old server's field shape, { kind, value, addr: null };
      // the debugger now names a field's type `typeName` and has no `addr`.
      const [gdbEntry] = Object.values(gdbList.heap_data);
      Object.values(step.heap).forEach((entry) => {
        const where = `linked_list.c line 20: heap entry at ${entry.addr}`;
        expect(entry.typeName, `${where}: type, against GDB's`).toBe(gdbEntry.typeName);
        expect(Object.keys(entry.value), `${where}: field names, against GDB's`).toEqual(
          Object.keys(gdbEntry.value)
        );
        expect(entry.value.value, `${where}: the value field`).toEqual({
          typeName: gdbEntry.value.value.kind,
          value: expect.any(Number),
        });
      });
      expect(Object.keys(step.heap).length, `linked_list.c line 20: heap entries (${heap})`).toBe(
        3
      );
    },
    CLANG_TIMEOUT
  );

  it(
    'keeps showing what a caller can reach while a function it called runs',
    async () => {
      const recording = await record('linked_list.c', program('linked_list.c'));
      // The third call to prepend: main's list already holds 2 and 3.
      const inThirdPrepend = recording.steps.filter((s) => s.function === 'prepend')[8];

      expect(
        inThirdPrepend.line,
        `linked_list.c: line of the first step of the third prepend (steps: ${stepsOf(recording).join(', ')})`
      ).toBe(9);
      expect(
        Object.values(inThirdPrepend.heap).map((entry) => entry.typeName),
        "linked_list.c, first step of prepend(list, 1): heap entry types, which should be main's two nodes"
      ).toEqual(['struct node', 'struct node']);
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

      expect(
        last.variables.gone.value,
        'freed.c line 9: gone, still pointing at the freed node'
      ).not.toBe('0x0');
      expect(
        last.heap,
        'freed.c line 9: the heap, with gone pointing at a freed node and here at a stack struct'
      ).toEqual({});
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

      expect(
        Object.values(last.heap).map((entry) => entry.value),
        'calloc.c line 8 (a = calloc, then realloc, then a->value = 7): the heap entries’ fields'
      ).toEqual([
        {
          value: { typeName: 'int', value: 7 },
          next: { typeName: 'struct node *', value: '0x0' },
        },
      ]);
    },
    CLANG_TIMEOUT
  );

  it.each([
    {
      // The visualiser matches heap nodes by this name, so it's "Node", the
      // way the type is declared, not "const Node".
      name: 'named.c: a nameless struct named by its typedef, even through a const pointer',
      file: 'named.c',
      source: [
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
      ].join('\n'),
      line: 8,
      heap: ['Node {"value":7}'],
    },
    {
      name: 'table.c: a table of pointers, as a hash table uses',
      file: 'table.c',
      source: nodeProgram(
        [
          '    struct node **table = calloc(4, sizeof(struct node *));', // 5
          '    table[2] = malloc(sizeof(struct node));', // 6
          '    table[2]->value = 5;', // 7
          '    table[2]->next = NULL;', // 8
          '    int done = 1;', // 9
        ].join('\n')
      ),
      line: 9,
      heap: ['struct node {"value":5,"next":"0x0"}'],
    },
    {
      name: 'box.c: a struct inside a heap struct, and a node past 200 array elements',
      file: 'box.c',
      source: [
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
      ].join('\n'),
      line: 9,
      heap: [
        'struct box {"tag":0,"child":{"value":9,"next":"0x0"}}',
        'struct node {"value":0,"next":"0x0"}',
        'struct node {"value":9,"next":"0x0"}',
      ],
    },
  ])(
    'follows pointers to show $name',
    async ({ name, file, source, line, heap }) => {
      expect(
        heapAt(await record(file, source), line).sort(),
        `${name}; line ${line}: heap entries as "type {fields}", sorted`
      ).toEqual(heap);
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

      expect(
        heapAt(recording, 7),
        'flags.c line 7 (after f->a = 1, f->c = -2): heap entries'
      ).toEqual(['struct flags {"a":1,"c":-2,"x":0}']);
      const x = (line: number) =>
        Object.values(recording.steps.find((s) => s.line === line)!.heap)[0].value.x.value;
      expect(
        [x(8), x(9), x(10), x(11)],
        'flags.c: f->x at lines 8 to 11, after it is set to 1.0 / 0.0, 0.0 / 0.0, 0.0 and -0.0'
      ).toEqual([Infinity, NaN, 0, -0]);
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
        statementLimit: Infinity,
        timeLimitMs: 4000,
      });

      expect(
        recording.end,
        'boxes.c (20,000 boxes, each with a struct node inside, 4 s time limit): how the run ended'
      ).toEqual({ exitCode: 15 });
      expect(
        Object.keys(recording.steps.at(-1)?.heap ?? {}).length,
        'boxes.c, last step: heap entries (a box and its child node for each of 20,000 boxes)'
      ).toBe(40000);
    },
    CLANG_TIMEOUT
  );

  it(
    'shares a heap entry between steps while it stays the same',
    async () => {
      // A long recording would otherwise hold a copy of the whole heap at
      // every step; postMessage keeps shared objects shared.
      const recording = await record('linked_list.c', program('linked_list.c'));
      const [before, after] = recording.steps.filter((s) => s.line === 19 || s.line === 20);
      const shared = Object.keys(before.heap).filter((addr) => addr in after.heap);

      expect(
        shared.length,
        `linked_list.c lines 19 and 20: heap addresses on both steps (line 19: ${describeHeap(before)})`
      ).toBeGreaterThan(0);
      shared.forEach((addr) =>
        expect(
          after.heap[addr],
          `linked_list.c: the entry at ${addr} on line 20 should be the same object as on line 19, not a copy`
        ).toBe(before.heap[addr])
      );
    },
    CLANG_TIMEOUT
  );
});
