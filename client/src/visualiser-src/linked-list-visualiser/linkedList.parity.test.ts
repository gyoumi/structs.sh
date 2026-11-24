/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { evaluatePuzzle, type ListOperation } from '@/Services/puzzles/puzzles';
import { DEFAULT_CANVAS_TARGET } from '@/visualiser-src/common/canvasTarget';
import { actualNodeDiameter } from '@/visualiser-src/common/constants';
import { formatArray, setUpParityEnvironment } from '@/test/sortingParity';
import { checkCounters } from '@/test/treeParity';
import GraphicalLinkedList from './data-structure/GraphicalLinkedList';
import { nodePathWidth } from './util/constants';

/**
 * GraphicalLinkedList.runOperations vs the puzzles wasm. Needs `pnpm run puzzles` first.
 * Hand-worked counts use the rule in docs/puzzle-ideas.md (see e2e/support/daily-list-fixtures.ts):
 * insert(v, i) walks min(i, length before) and lands there, delete(i) walks i + 1,
 * cost = operations + nodes walked.
 */

type Counts = { operations: number; nodesWalked: number; cost: number };

type ListCase = {
  label: string;
  start: number[];
  operations: ListOperation[];
  final: number[];
  counts: Counts;
};

const ins = (value: number, index: number): ListOperation => ({ kind: 'insert', value, index });
const del = (index: number): ListOperation => ({ kind: 'delete', index });

const counts = (operations: number, nodesWalked: number): Counts => ({
  operations,
  nodesWalked,
  cost: operations + nodesWalked,
});

const listed = (operations: readonly ListOperation[]) =>
  `[${operations
    .map((op) =>
      op.kind === 'insert' ? `insert(${op.value}, ${op.index})` : `delete(${op.index})`
    )
    .join(', ')}]`;

const LIST_CASES: ListCase[] = [
  {
    label: 'DRIFT_26 unsolved',
    start: [8, 3, 6, 1],
    operations: [ins(5, 0)],
    final: [5, 8, 3, 6, 1],
    counts: counts(1, 0),
  },
  {
    label: 'DRIFT_26 cheap',
    start: [8, 3, 6, 1],
    operations: [del(0), ins(5, 2)],
    final: [3, 6, 5, 1],
    counts: counts(2, 3),
  },
  {
    label: 'DRIFT_26 costly',
    start: [8, 3, 6, 1],
    operations: [del(3), del(0), ins(5, 2), ins(1, 3)],
    final: [3, 6, 5, 1],
    counts: counts(4, 10),
  },
  {
    label: 'build from empty: insert(7, 0) walks 0, insert(9, 5) walks min(5, 1) = 1',
    start: [],
    operations: [ins(7, 0), ins(9, 5)],
    final: [7, 9],
    counts: counts(2, 1),
  },
  {
    label: 'insert(4, 99) on 3 nodes walks 3 and appends',
    start: [1, 2, 3],
    operations: [ins(4, 99)],
    final: [1, 2, 3, 4],
    counts: counts(1, 3),
  },
  {
    label: 'delete(2), the tail, walks 3',
    start: [1, 2, 3],
    operations: [del(2)],
    final: [1, 2],
    counts: counts(1, 3),
  },
  {
    label: 'delete every node from the front, equal values',
    start: [4, 4, 4],
    operations: [del(0), del(0), del(0)],
    final: [],
    counts: counts(3, 3),
  },
  {
    label: 'negative and extreme values',
    start: [-2147483648, 0, 2147483647],
    operations: [del(1), ins(-1, 1)],
    final: [-2147483648, -1, 2147483647],
    counts: counts(2, 3),
  },
];

/** Park-Miller LCG, so the random cases are the same on every run. */
const rngFor = (seed: number) => {
  let state = seed;
  const next = (maxExclusive: number) => {
    state = (state * 48271) % 2147483647;
    return state % maxExclusive;
  };
  // Neighbouring seeds start out alike, so drop the first draws.
  next(1);
  next(1);
  return next;
};

/** The final list, by the spec: inserts clamp to the length, deletes are always in range here. */
const applyAll = (start: number[], operations: ListOperation[]) =>
  operations.reduce((list, op) => {
    const next = [...list];
    if (op.kind === 'insert') next.splice(Math.min(op.index, next.length), 0, op.value);
    else next.splice(op.index, 1);
    return next;
  }, start);

const randomCase = (seed: number) => {
  const next = rngFor(seed);
  const start = Array.from({ length: next(7) }, () => next(41) - 20);
  let { length } = start;
  const operations = Array.from({ length: 1 + next(7) }, () => {
    if (length === 0 || next(2) === 0) {
      length += 1;
      return ins(next(41) - 20, next(length + 2));
    }
    length -= 1;
    return del(next(length + 1));
  });
  return { seed, start, operations, final: applyAll(start, operations) };
};

const RANDOM_CASES = Array.from({ length: 30 }, (_, i) => randomCase(20261126 + i));

const freshCanvas = () => {
  const { container, canvas, code, codeContainer } = DEFAULT_CANVAS_TARGET;
  const id = (selector: string) => selector.replace(/^#/, '');
  document.body.innerHTML = `<div id="${container}"><svg id="${id(canvas)}"></svg></div><svg id="${id(code)}"></svg><div id="${codeContainer}"></div>`;
};

const wasmCounts = async (start: number[], target: number[], operations: ListOperation[]) => {
  const result = await evaluatePuzzle(
    { template: 'linked-list-index-drift', start, target },
    operations
  );
  if (result.template !== 'linked-list-index-drift') {
    throw new Error(`evaluatePuzzle(linked-list-index-drift) answered for ${result.template}`);
  }
  const { solved, operations: ops, nodesWalked, cost } = result;
  return { solved, counts: { operations: ops, nodesWalked, cost } };
};

/** Runs the visualiser and the wasm on one try, checks they agree, and returns what they saw. */
const checkParity = async (
  context: string,
  start: number[],
  operations: ListOperation[],
  final: number[]
) => {
  const ctx = `${context}: start ${formatArray(start)}, operations ${listed(operations)}`;
  freshCanvas();
  const list = new GraphicalLinkedList();
  list.load([...start]);
  const producer = list.runOperations([...operations]);
  expect(
    list.data,
    `${ctx}: list.data after runOperations should be the final list ${formatArray(final)}`
  ).toEqual(final);
  const wasm = await wasmCounts(start, final, operations);
  expect(
    wasm.solved,
    `${ctx}: wasm should call the try solved when target is the final list ${formatArray(final)}`
  ).toBe(true);
  checkCounters(`${ctx} (GraphicalLinkedList.runOperations vs wasm)`, producer, wasm.counts);
  const unbalanced = producer.allRunners
    .map((runner) => runner.counters as Counts | undefined)
    .find((step) => step !== undefined && step.cost !== step.operations + step.nodesWalked);
  expect(
    unbalanced,
    `${ctx}: every recorded step should have cost = operations + nodesWalked, got ${JSON.stringify(unbalanced)}`
  ).toBeUndefined();
  return wasm.counts;
};

setUpParityEnvironment();

describe('linked list index drift parity (GraphicalLinkedList.runOperations vs wasm)', () => {
  it.each(LIST_CASES)(
    'matches for $label',
    async ({ label, start, operations, final, counts: want }) => {
      const got = await checkParity(label, start, operations, final);
      expect(
        got,
        `${label}: start ${formatArray(start)}, operations ${listed(operations)} should match the hand-worked counts ${JSON.stringify(want)}`
      ).toEqual(want);
    }
  );

  it.each(RANDOM_CASES)(
    'matches for seed $seed ($operations.length operations on $start.length nodes)',
    async ({ seed, start, operations, final }) => {
      const got = await checkParity(`seed ${seed}`, start, operations, final);
      expect(
        got.operations,
        `seed ${seed}: start ${formatArray(start)}, operations ${listed(operations)}: Operations should count every operation (${operations.length})`
      ).toBe(operations.length);
    }
  );

  it('hides the head pointer when loading an empty list', () => {
    freshCanvas();
    const list = new GraphicalLinkedList();
    list.load([]);
    expect(Number(list.headPointer.attr('opacity'))).toBe(0);
  });

  it('pre-zooms a front insert to fit the shifted tail node', () => {
    freshCanvas();
    const list = new GraphicalLinkedList();
    list.load([1, 2, 3, 4]);
    const producer = list.runOperations([ins(9, 0)]);
    const firstBounds = producer.allRunners[0]?.bounds;
    const expectedWidth = 5 * nodePathWidth + actualNodeDiameter;
    expect(firstBounds).toBeDefined();
    expect(firstBounds!.x + firstBounds!.width).toBeGreaterThanOrEqual(expectedWidth);
  });

  it('pre-zooms a delete with a bypass arc before the arc is drawn', () => {
    freshCanvas();
    const list = new GraphicalLinkedList();
    list.load([8, 3, 6, 1]);
    const producer = list.runOperations([del(0)]);
    const firstBounds = producer.allRunners[0]?.bounds;
    expect(firstBounds).toBeDefined();
    expect(firstBounds!.y).toBeLessThanOrEqual(30);
  });
});
