import { describe, expect, it } from 'vitest';
import { evaluatePuzzle, scorePuzzle, type EvalPuzzleInstance } from './puzzles';

/** Needs the puzzles wasm built first: `pnpm run puzzles` from the repo root. Counts are worked by hand in e2e/support/daily-tree-fixtures.ts. */

const AVL_23: EvalPuzzleInstance = {
  template: 'avl-most-rotations',
  values: [5, 1, 3, 8, 6, 7, 2, 4],
  fixed: [0, 5],
};

const FORCED_24: EvalPuzzleInstance = {
  template: 'bst-forced-order',
  values: [3, 6, 9, 1, 2, 5, 4, 7, 8, 10],
  targetTree: [6, 3, 1, 2, 5, 4, 9, 7, 8, 10],
};

const UPSET_25: EvalPuzzleInstance = {
  template: 'upset-bst-beats-avl',
  values: [3, 2, 13, 6, 14, 1, 8, 10, 5, 12, 11, 7, 4, 9],
  fixed: [0, 1, 5, 9, 11, 12],
};

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;

const describeCall = (puzzle: object, arrangement: readonly number[]) =>
  `evaluatePuzzle(${JSON.stringify(puzzle)}, ${fmt(arrangement)})`;

const evaluate = (puzzle: EvalPuzzleInstance, arrangement: readonly number[]) =>
  evaluatePuzzle(puzzle, [...arrangement]);

const settle = <T>(promise: Promise<T>) =>
  promise.then(
    (result) => ({ rejected: false as const, result }),
    (error: unknown) => ({ rejected: true as const, error })
  );

const rejection = async (puzzle: EvalPuzzleInstance, arrangement: readonly number[]) => {
  const call = describeCall(puzzle, arrangement);
  const outcome = await settle(evaluate(puzzle, arrangement));
  expect(
    outcome.rejected,
    `${call}: should reject, but resolved with ${outcome.rejected ? '' : JSON.stringify(outcome.result)}`
  ).toBe(true);
  if (!outcome.rejected) return '';
  expect(outcome.error, `${call}: rejection reason should be an Error`).toBeInstanceOf(Error);
  return (outcome.error as Error).message;
};

type Case = {
  label: string;
  puzzle: EvalPuzzleInstance;
  arrangement: readonly number[];
  expected: Record<string, unknown>;
};

const avl = (rotations: number) => ({
  template: 'avl-most-rotations',
  solved: true,
  score: rotations,
  rotations,
});

const forced = (solved: boolean, run: number) => ({
  template: 'bst-forced-order',
  solved,
  score: solved ? run : null,
  longestIncreasingRun: run,
});

const upset = (bst: number, avlPassed: number) => {
  const solved = bst < avlPassed;
  return {
    template: 'upset-bst-beats-avl',
    solved,
    score: solved ? avlPassed - bst : null,
    bstNodesPassed: bst,
    avlNodesPassed: avlPassed,
    margin: Math.max(avlPassed - bst, 0),
  };
};

const CASES: Case[] = [
  {
    label: 'AVL #23 start: LR, RL and RR make 5 rotations, always solved',
    puzzle: AVL_23,
    arrangement: [5, 1, 3, 8, 6, 7, 2, 4],
    expected: avl(5),
  },
  {
    label: 'AVL #23 doubles: three double rotations and one single make 7',
    puzzle: AVL_23,
    arrangement: [5, 1, 2, 8, 6, 7, 3, 4],
    expected: avl(7),
  },
  {
    label: 'AVL empty tree: 0 rotations, still solved',
    puzzle: { template: 'avl-most-rotations', values: [], fixed: [] },
    arrangement: [],
    expected: avl(0),
  },
  {
    label: 'AVL [3, 1, 2]: one LR double rotation counts 2',
    puzzle: { template: 'avl-most-rotations', values: [1, 2, 3], fixed: [] },
    arrangement: [3, 1, 2],
    expected: avl(2),
  },
  {
    label: 'forced order #24 solved: builds the target, scored by its run of 6',
    puzzle: FORCED_24,
    arrangement: [6, 3, 9, 5, 1, 2, 4, 7, 8, 10],
    expected: forced(true, 6),
  },
  {
    label: 'forced order #24 start: root 3 builds a different tree, unsolved with run 4',
    puzzle: FORCED_24,
    arrangement: [3, 6, 9, 1, 2, 5, 4, 7, 8, 10],
    expected: forced(false, 4),
  },
  {
    label: 'forced order #24 longRun: run 7 but 4 and 5 hang in the wrong place, unsolved',
    puzzle: FORCED_24,
    arrangement: [6, 9, 3, 1, 2, 4, 5, 7, 8, 10],
    expected: forced(false, 7),
  },
  {
    label: 'forced order #24 ascending: a chain to the right, unsolved with run 10',
    puzzle: FORCED_24,
    arrangement: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    expected: forced(false, 10),
  },
  {
    label: 'upset #25 start: BST 42 >= AVL 38 is unsolved',
    puzzle: UPSET_25,
    arrangement: [3, 2, 13, 6, 14, 1, 8, 10, 5, 12, 11, 7, 4, 9],
    expected: upset(42, 38),
  },
  {
    label: 'upset #25 solved: BST 37 < AVL 41, margin 4 (rotations not counted)',
    puzzle: UPSET_25,
    arrangement: [3, 2, 8, 13, 14, 1, 10, 9, 6, 12, 11, 7, 4, 5],
    expected: upset(37, 41),
  },
  {
    label: 'upset [1, 2]: BST 1 = AVL 1 is a tie, unsolved',
    puzzle: { template: 'upset-bst-beats-avl', values: [1, 2], fixed: [] },
    arrangement: [1, 2],
    expected: upset(1, 1),
  },
];

describe('evaluatePuzzle — tree templates through the wasm build', () => {
  it.each(CASES)('$label', async ({ label, puzzle, arrangement, expected }) => {
    const result = await evaluate(puzzle, arrangement);
    expect(
      result,
      `${label}: ${describeCall(puzzle, arrangement)} should resolve to ${JSON.stringify(expected)}, got ${JSON.stringify(result)}`
    ).toEqual(expected);
  });

  it.each([
    { puzzle: AVL_23, par: 6, arrangement: [5, 1, 2, 8, 6, 7, 3, 4], expected: avl(7) },
    {
      puzzle: FORCED_24,
      par: 5,
      arrangement: [6, 3, 9, 5, 1, 2, 4, 7, 8, 10],
      expected: forced(true, 6),
    },
    {
      puzzle: UPSET_25,
      par: 4,
      arrangement: [3, 2, 8, 13, 14, 1, 10, 9, 6, 12, 11, 7, 4, 5],
      expected: upset(37, 41),
    },
  ])(
    'ignores daily metadata (number, par, date) on a full $puzzle.template puzzle',
    async ({ puzzle, par, arrangement, expected }) => {
      const daily = { ...puzzle, number: 25, par, date: '2026-11-24' };
      const outcome = await settle(evaluate(daily, arrangement));
      const got = outcome.rejected
        ? `a rejection: ${String((outcome.error as Error).message)}`
        : JSON.stringify(outcome.result);
      expect(
        outcome,
        `${describeCall(daily, arrangement)}: number, par and date must not reach the wasm request (it rejects unknown fields), so this should resolve to ${JSON.stringify(expected)}; got ${got}`
      ).toEqual({ rejected: false, result: expected });
    }
  );
});

describe('evaluatePuzzle — invalid tree arrangements', () => {
  it.each([
    {
      label: 'AVL #23 with fixed slot 1 (value 5) moved',
      puzzle: AVL_23,
      arrangement: [1, 5, 3, 8, 6, 7, 2, 4],
      pattern: /fixed/i,
    },
    {
      label: 'forced order #24 with 9 values instead of 10',
      puzzle: FORCED_24,
      arrangement: [6, 3, 9, 5, 1, 2, 4, 7, 8],
      pattern: /length/i,
    },
    {
      label: 'forced order #24 with 11 in place of 10',
      puzzle: FORCED_24,
      arrangement: [6, 3, 9, 5, 1, 2, 4, 7, 8, 11],
      pattern: /permutation/i,
    },
    {
      label: 'upset #25 with fixed slot 6 (value 1) moved',
      puzzle: UPSET_25,
      arrangement: [3, 2, 13, 6, 14, 8, 1, 10, 5, 12, 11, 7, 4, 9],
      pattern: /fixed/i,
    },
  ])('rejects $label', async ({ label, puzzle, arrangement, pattern }) => {
    const message = await rejection(puzzle, arrangement);
    expect(
      message,
      `${label}: ${describeCall(puzzle, arrangement)} error message should match ${pattern}, got ${JSON.stringify(message)}`
    ).toMatch(pattern);
  });

  it.each([
    { template: 'avl-most-rotations', values: AVL_23.values, fixed: [0, 5] },
    { template: 'bst-forced-order', values: FORCED_24.values, fixed: [] },
    { template: 'upset-bst-beats-avl', values: UPSET_25.values, fixed: [0, 1, 5, 9, 11, 12] },
  ])('scorePuzzle rejects $template and points to evaluatePuzzle', async (puzzle) => {
    const outcome = await settle(scorePuzzle(puzzle, puzzle.values));
    const message = outcome.rejected ? String((outcome.error as Error).message) : '';
    expect(
      { rejected: outcome.rejected, namesEvaluatePuzzle: /evaluatePuzzle/i.test(message) },
      `scorePuzzle(${JSON.stringify(puzzle)}, ${fmt(puzzle.values)}): tree templates have more than a score, so this should reject naming evaluatePuzzle; got ${outcome.rejected ? JSON.stringify(message) : `a resolved ${JSON.stringify(outcome.result)}`}`
    ).toEqual({ rejected: true, namesEvaluatePuzzle: true });
  });
});
