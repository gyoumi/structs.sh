import { describe, expect, it } from 'vitest';
import type { Step } from './recording';
import {
  CLANG_TIMEOUT,
  describeEntry,
  describeHeap,
  describeStep,
  fieldValues,
  fixture,
  record,
} from './__tests__/recordingTestKit';

// Heap memory that stops being one struct and becomes another, or part of
// one: what the recorder keeps showing, and what it must stop showing. The
// programs are in ./fixtures.

/** struct node on wasm32: an int and a 4-byte pointer. */
const NODE_SIZE = 8;

const pointer = (step: Step | undefined, variable: string) =>
  step?.variables[variable]?.value as string;

describe('recordRun: heap memory reused as another struct', () => {
  it(
    'stops showing a struct once realloc shrinks its block past it, even when malloc reuses that memory',
    async () => {
      // fixtures/realloc_shrink.c: nodes = malloc(4 nodes) on line 9; last
      // points at nodes[3] on line 14 (so it's shown), then is dropped on
      // line 15; realloc shrinks the block to 1 node on line 16, in place;
      // numbers = malloc(4 ints) on line 17, which wasm's malloc puts in the
      // tail realloc gave back, and lines 18-20 fill it with 1000..1003.
      const name = 'realloc_shrink.c';
      const { steps } = await record(name, fixture(name));

      // The situation the test needs: if any of these fail, the program no
      // longer sets it up, rather than the recorder being wrong.
      const shownLast = steps.findIndex((step) => step.line === 15);
      const tail = pointer(steps[shownLast], 'last');
      expect(
        steps[shownLast]?.heap[tail]?.typeName,
        `${name} line 15: nodes[3] (last = ${tail}) is shown on the heap before the realloc`
      ).toBe('struct node');
      const afterRealloc = steps.findIndex((step) => step.line === 17);
      const shrunk = pointer(steps[afterRealloc], 'shrunk');
      expect(
        shrunk,
        `${name} line 17: realloc(nodes, 1 node) on line 16 shrank the block in place (shrunk == nodes)`
      ).toBe(pointer(steps[afterRealloc], 'nodes'));
      const afterMalloc = steps.findIndex((step) => step.line === 18);
      const numbersAt = pointer(steps[afterMalloc], 'numbers');
      const numbers = parseInt(numbersAt, 16);
      expect(
        numbers <= parseInt(tail, 16) && parseInt(tail, 16) + NODE_SIZE <= numbers + 16,
        `${name} line 18: malloc(4 ints) on line 17 reused the tail, covering the old nodes[3] at ${tail} ` +
          `(numbers = ${numbersAt})`
      ).toBe(true);

      // From the realloc on, no struct node may be shown past the shrunk
      // block's end: that memory isn't a node any more.
      const end = parseInt(shrunk, 16) + NODE_SIZE;
      const stale = steps.slice(afterRealloc).flatMap((step, offset) =>
        Object.values(step.heap)
          .filter((entry) => entry.typeName === 'struct node' && parseInt(entry.addr, 16) >= end)
          .map((entry) => `${describeStep(steps, afterRealloc + offset)}: ${describeEntry(entry)}`)
      );
      expect(
        stale,
        `${name}: struct nodes shown after realloc shrank nodes (${shrunk}) to 1 node, at or past its new end ` +
          `0x${end.toString(16)}; that memory was given back and reused by numbers (${numbersAt}, ` +
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
    const TRIPLE_SIZE = 12;

    const recordPool = async () => {
      const { steps } = await record(name, fixture(name));
      // The situation the tests need: if these fail, the program no longer
      // sets it up, rather than the recorder being wrong.
      const nodeShown = steps.find((step) => step.line === 23);
      const node = pointer(nodeShown, 'n');
      expect(
        nodeShown && node && nodeShown.heap[node]?.typeName,
        `${name} line 23: n (${node}) points at a struct node at pool + 8, shown on the heap`
      ).toBe('struct node');
      const reused = steps.findIndex((step) => step.line === 25);
      const triple = pointer(steps[reused], 't');
      expect(
        parseInt(triple, 16) + 4,
        `${name} line 25: t (${triple}) points 4 bytes before the old node (${node}), so t->c covers its next`
      ).toBe(parseInt(node, 16));
      const words = pointer(steps.at(-1), 'words');
      return { steps, reused, triple, words };
    };

    it(
      'never shows memory that only an int field points at as a struct',
      async () => {
        const { steps, words } = await recordPool();

        const phantoms = steps.flatMap((step, index) =>
          words in step.heap
            ? [`${describeStep(steps, index)}: ${describeEntry(step.heap[words])}`]
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
                `${where}: ${describeEntry(step.heap[address])}, inside the struct triple at ${triple}`
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

      // The situation the test needs: if these fail, the program no longer
      // sets it up, rather than the recorder being wrong.
      const nodeShown = steps.find((step) => step.line === 18);
      const pool = pointer(nodeShown, 'pool');
      expect(
        nodeShown?.heap[pool]?.typeName,
        `${name} line 18: n points at a struct node at pool (${pool}), shown on the heap`
      ).toBe('struct node');
      const reached = steps.findIndex((step) => step.line === 23);
      expect(
        steps[reached]?.variables.p?.value,
        `${name} line 23: p points at the struct pair at pool (${pool}), the old node's address`
      ).toBe(pool);

      const wrong = steps
        .slice(reached)
        .flatMap((step, offset) =>
          step.heap[pool]?.typeName === 'struct pair'
            ? []
            : [
                `${describeStep(steps, reached + offset)}: no struct pair at ${pool}; the whole heap holds ${describeHeap(step)}`,
              ]
        );
      expect(
        wrong,
        `${name}: from line 23, where p reaches the struct pair {left: 41, right: 42} at pool (${pool}), the ` +
          `same address as the struct node shown before, it should be shown at every step to the end (p is ` +
          `dropped on line 23, but the pool is never freed)`
      ).toEqual([]);
    },
    CLANG_TIMEOUT
  );

  describe('a struct embedded in another', () => {
    /**
     * Each step from `from` to the end where the heap has no `typeName`
     * at `address`, as "step N main:L: ...", saying what it holds instead.
     */
    const missingFrom = (steps: Step[], from: number, address: string, typeName: string) =>
      steps
        .slice(from)
        .flatMap((step, offset) =>
          step.heap[address]?.typeName === typeName
            ? []
            : [
                `${describeStep(steps, from + offset)}: no ${typeName} at ${address}; ` +
                  `the whole heap holds ${describeHeap(step)}`,
              ]
        );

    it(
      'keeps showing a struct after the only pointer left points at a struct inside it',
      async () => {
        // fixtures/embedded_child.c: box = malloc(struct box) on line 14,
        // filled with id 7 and child {70, 700} on lines 15-17. child =
        // &box->child on line 18, box = NULL on line 19, then child->value
        // = 71 on line 20. The box is never freed, so it stays shown, with
        // the 71 in its child field.
        const name = 'embedded_child.c';
        const { steps } = await record(name, fixture(name));

        // The situation the test needs: if this fails, the program no
        // longer sets it up, rather than the recorder being wrong.
        const shown = steps.findIndex((step) => step.line === 15);
        const box = pointer(steps[shown], 'box');
        expect(
          steps[shown]?.heap[box]?.typeName,
          `${name} line 15: box (${box}) points at a malloc'd struct box, shown on the heap`
        ).toBe('struct box');

        expect(
          missingFrom(steps, shown, box, 'struct box'),
          `${name}: from line 15 the struct box at ${box} should be shown at every step to the end: it's never ` +
            `freed, and after box = NULL on line 19 child still points inside it (at its child field)`
        ).toEqual([]);
        expect(
          steps.at(-1)?.heap[box] && fieldValues(steps.at(-1)!.heap[box]),
          `${name} last step (line ${steps.at(-1)?.line}): the struct box at ${box}, with the change made ` +
            `through child on line 20`
        ).toEqual({ id: 7, child: { value: 71, weight: 700 } });
      },
      CLANG_TIMEOUT
    );

    it(
      'keeps showing a struct after a struct around it is reached, and both after the pointers are dropped',
      async () => {
        // fixtures/embedded_parent.c: raw = malloc(struct box) on line 15.
        // child points at its child field on line 16 (so a struct inner is
        // shown), set to {70, 700} on lines 17-18, dropped on line 19. box
        // points at the whole block on line 20, id = 7 on line 21, dropped
        // on line 22. Nothing is freed. The struct inner shown first is the
        // box's child field (same type, at that field's offset), so it
        // doesn't conflict with the box.
        const name = 'embedded_parent.c';
        const { steps } = await record(name, fixture(name));

        const innerShown = steps.findIndex((step) => step.line === 17);
        const inner = pointer(steps[innerShown], 'child');
        expect(
          steps[innerShown]?.heap[inner]?.typeName,
          `${name} line 17: child (${inner}) points at a struct inner, shown on the heap`
        ).toBe('struct inner');
        const boxShown = steps.findIndex((step) => step.line === 21);
        const box = pointer(steps[boxShown], 'box');
        expect(
          steps[boxShown]?.heap[box]?.typeName,
          `${name} line 21: box (${box}) points at the struct box around it, shown on the heap`
        ).toBe('struct box');

        expect(
          [
            ...missingFrom(steps, innerShown, inner, 'struct inner'),
            ...missingFrom(steps, boxShown, box, 'struct box'),
          ],
          `${name}: the struct inner at ${inner} (from line 17) and the struct box around it at ${box} ` +
            `(from line 21) should both be shown at every step to the end: neither is freed`
        ).toEqual([]);
        expect(
          steps.at(-1)?.heap[box] && fieldValues(steps.at(-1)!.heap[box]),
          `${name} last step (line ${steps.at(-1)?.line}): the struct box at ${box}`
        ).toEqual({ id: 7, child: { value: 70, weight: 700 } });
      },
      CLANG_TIMEOUT
    );
  });
});
