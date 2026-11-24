import { expect, vi } from 'vitest';
import { evaluateChallenge } from '@/Services/challenges/challenges';
import { DEFAULT_CANVAS_TARGET } from '@/visualiser-src/common/canvasTarget';
import type AnimationProducer from '@/visualiser-src/common/AnimationProducer';
import GraphicalAVL from '@/visualiser-src/avl-tree-visualiser/data-structure/GraphicalAVL';
import GraphicalBST from '@/visualiser-src/binary-search-tree-visualiser/data-structure/GraphicalBST';
import VisualiserController from '@/visualiser-src/controller/VisualiserController';
import { finalCounters, firstDecrease, formatArray } from './sortingParity';

/** Shared setup for the BST and AVL visualiser vs challenges wasm parity tests. Needs `pnpm run challenges` first. */

export type TreeCase = {
  label: string;
  values: number[];
  rotations: number;
  bstNodesPassed: number;
  avlNodesPassed: number;
  bstPreorder: number[];
  avlPreorder: number[];
};

const tree = (
  label: string,
  values: number[],
  [rotations, bstNodesPassed, avlNodesPassed]: [number, number, number],
  bstPreorder: number[],
  avlPreorder: number[]
): TreeCase => ({
  label,
  values,
  rotations,
  bstNodesPassed,
  avlNodesPassed,
  bstPreorder,
  avlPreorder,
});

/**
 * Hand-worked cases, [rotations, BST nodes passed, AVL nodes passed]. The #23, #24 and #25 inputs
 * come from e2e/support/daily-tree-fixtures.ts; their counts not listed there were worked with an
 * independent model of GraphicalBST.ts and GraphicalAVL.ts that reproduces every fixture count.
 */
export const TREE_CASES: TreeCase[] = [
  tree('empty', [], [0, 0, 0], [], []),
  tree('single key', [42], [0, 0, 0], [42], [42]),
  tree('two keys', [1, 2], [0, 1, 1], [1, 2], [1, 2]),
  tree('LL [3, 2, 1]', [3, 2, 1], [1, 3, 3], [3, 2, 1], [2, 1, 3]),
  tree('RR [1, 2, 3]', [1, 2, 3], [1, 3, 3], [1, 2, 3], [2, 1, 3]),
  tree('LR [3, 1, 2]', [3, 1, 2], [2, 3, 3], [3, 1, 2], [2, 1, 3]),
  tree('RL [1, 3, 2]', [1, 3, 2], [2, 3, 3], [1, 3, 2], [2, 1, 3]),
  tree(
    'sorted 1..7',
    [1, 2, 3, 4, 5, 6, 7],
    [4, 21, 14],
    [1, 2, 3, 4, 5, 6, 7],
    [4, 2, 1, 3, 6, 5, 7]
  ),
  tree(
    'reversed 7..1',
    [7, 6, 5, 4, 3, 2, 1],
    [4, 21, 14],
    [7, 6, 5, 4, 3, 2, 1],
    [4, 2, 1, 3, 6, 5, 7]
  ),
  tree('duplicates pass the equal node', [2, 1, 2, 1], [0, 4, 4], [2, 1], [2, 1]),
  tree(
    'AVL_23 start',
    [5, 1, 3, 8, 6, 7, 2, 4],
    [5, 15, 17],
    [5, 1, 3, 2, 4, 8, 6, 7],
    [6, 3, 1, 2, 5, 4, 8, 7]
  ),
  tree(
    'AVL_23 doubles',
    [5, 1, 2, 8, 6, 7, 3, 4],
    [7, 16, 18],
    [5, 1, 2, 3, 4, 8, 6, 7],
    [6, 2, 1, 4, 3, 5, 8, 7]
  ),
  tree(
    'FORCED_24 start',
    [3, 6, 9, 1, 2, 5, 4, 7, 8, 10],
    [8, 21, 25],
    [3, 1, 2, 6, 5, 4, 9, 7, 8, 10],
    [6, 3, 2, 1, 5, 4, 8, 7, 9, 10]
  ),
  tree(
    'FORCED_24 solved',
    [6, 3, 9, 5, 1, 2, 4, 7, 8, 10],
    [4, 19, 23],
    [6, 3, 1, 2, 5, 4, 9, 7, 8, 10],
    [6, 3, 1, 2, 5, 4, 8, 7, 9, 10]
  ),
  tree(
    'FORCED_24 longRun',
    [6, 9, 3, 1, 2, 4, 5, 7, 8, 10],
    [7, 19, 24],
    [6, 3, 1, 2, 4, 5, 9, 7, 8, 10],
    [6, 3, 2, 1, 4, 5, 8, 7, 9, 10]
  ),
  tree(
    'UPSET_25 start',
    [3, 2, 13, 6, 14, 1, 8, 10, 5, 12, 11, 7, 4, 9],
    [6, 42, 38],
    [3, 2, 1, 13, 6, 5, 4, 8, 7, 10, 9, 12, 11, 14],
    [8, 3, 2, 1, 6, 5, 4, 7, 11, 10, 9, 13, 12, 14]
  ),
  tree(
    'UPSET_25 solved',
    [3, 2, 8, 13, 14, 1, 10, 9, 6, 12, 11, 7, 4, 5],
    [11, 37, 41],
    [3, 2, 1, 8, 6, 4, 5, 7, 13, 10, 9, 12, 11, 14],
    [9, 3, 2, 1, 7, 5, 4, 6, 8, 13, 11, 10, 12, 14]
  ),
];

/** The #24 target tree, as its preorder. */
export const FORCED_24_TARGET = [6, 3, 1, 2, 5, 4, 9, 7, 8, 10];

/** The page the tree visualisers draw into, including the container they measure for layout. */
const freshCanvas = () => {
  const { container, canvas, code, codeContainer } = DEFAULT_CANVAS_TARGET;
  const id = (selector: string) => selector.replace(/^#/, '');
  document.body.innerHTML = `<div id="${container}"><svg id="${id(canvas)}"></svg></div><svg id="${id(code)}"></svg><div id="${codeContainer}"></div>`;
};

/** A fresh BST visualiser with `values` inserted in order by `insertAll`. */
export const buildBst = (values: number[]) => {
  freshCanvas();
  const bst = new GraphicalBST();
  return { bst, producer: bst.insertAll([...values]) };
};

/** A fresh AVL visualiser with `values` inserted in order by `insertAll`. */
export const buildAvl = (values: number[]) => {
  freshCanvas();
  const avl = new GraphicalAVL();
  return { avl, producer: avl.insertAll([...values]) };
};

const sorted = (values: number[]) => [...values].sort((a, b) => a - b);

/** The wasm oracle's rotations and nodes passed for inserting `values` in order. */
export const wasmTreeCounts = async (values: number[]) => {
  const rotations = await evaluateChallenge(
    { template: 'avl-most-rotations', values: sorted(values), fixed: [] },
    values
  );
  const upset = await evaluateChallenge(
    { template: 'upset-bst-beats-avl', values: sorted(values), fixed: [] },
    values
  );
  if (rotations.template !== 'avl-most-rotations' || upset.template !== 'upset-bst-beats-avl') {
    throw new Error(
      `evaluateChallenge on ${formatArray(values)} answered for templates ${rotations.template} and ${upset.template}`
    );
  }
  return { rotations: rotations.rotations, ...upset };
};

/** Whether the wasm oracle says inserting `values` in order builds the BST with preorder `targetTree`. */
export const wasmForcedSolved = async (values: number[], targetTree: number[]) => {
  const result = await evaluateChallenge(
    { template: 'bst-forced-order', values: sorted(values), targetTree },
    values
  );
  if (result.template !== 'bst-forced-order') {
    throw new Error(`evaluateChallenge(bst-forced-order) answered for template ${result.template}`);
  }
  return result.solved;
};

/** Checks the counters a producer records along its timeline, read back through VisualiserController. */
export const checkCounters = (
  context: string,
  producer: AnimationProducer,
  finals: Record<string, number>
) => {
  const keys = Object.keys(finals);
  const zeros = Object.fromEntries(keys.map((key) => [key, 0]));
  const last = finalCounters(producer.allRunners) ?? zeros;
  expect(
    last,
    `${context}: the last timeline step's counters should be exactly ${JSON.stringify(finals)}, got ${JSON.stringify(last)}`
  ).toEqual(finals);
  keys.forEach((key) => {
    const drop = firstDecrease(
      producer.allRunners,
      (runner) => (runner.counters as Record<string, number> | undefined)?.[key]
    );
    expect(
      drop,
      `${context}: counters.${key} should never go down between steps, but went ${drop?.from} -> ${drop?.to} at counted step #${drop?.step}`
    ).toBeNull();
  });
  vi.useFakeTimers();
  try {
    const controller = new VisualiserController();
    controller.constructTimeline(producer, () => {});
    controller.pause();
    const { duration } = controller;
    const read = (time: number) =>
      Object.fromEntries(keys.map((key) => [key, controller.countersAt(time)[key] ?? 0]));
    expect(read(0), `${context}: countersAt(0), before the first step, should be all 0`).toEqual(
      zeros
    );
    expect(
      read(duration),
      `${context}: countersAt(duration ${duration}) should be the final ${JSON.stringify(finals)}`
    ).toEqual(finals);
    const samples = Array.from({ length: 401 }, (_, i) => read(Math.round((duration * i) / 400)));
    keys.forEach((key) => {
      const seen = samples.map((sample) => sample[key]);
      const dropAt = seen.findIndex((value, i) => i > 0 && value < seen[i - 1]);
      const steps = seen.filter((value, i) => i === 0 || value !== seen[i - 1]).join(' -> ');
      expect(
        dropAt,
        `${context}: countersAt(t).${key} should never go down as t grows; values over time ${steps}`
      ).toBe(-1);
      if (finals[key] < 2) return;
      const between = seen.some((value) => value > 0 && value < finals[key]);
      expect(
        between,
        `${context}: countersAt(t).${key} should pass through a value strictly between 0 and ${finals[key]} while playing (record it after every step, e.g. after each single rotation of a double rotation), not jump to it; values over time ${steps}`
      ).toBe(true);
    });
  } finally {
    vi.advanceTimersByTime(100);
    vi.useRealTimers();
  }
};
