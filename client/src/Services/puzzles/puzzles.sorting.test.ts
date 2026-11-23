import { describe, expect, it } from 'vitest';
import { evaluatePuzzle, scorePuzzle, type EvalPuzzleInstance } from './puzzles';

/** Needs the puzzles wasm built first: `pnpm run puzzles` from the repo root. Counts are worked by hand in e2e/support/daily-sorting-fixtures.ts. */

const BUBBLE_21: EvalPuzzleInstance = {
  template: 'bubble-exact-passes',
  values: [6, 2, 8, 1, 5, 3, 7, 4],
  fixed: [1, 4, 6],
  targetPasses: 4,
};

const INSERTION_22: EvalPuzzleInstance = {
  template: 'insertion-beats-merge',
  values: [5, 3, 8, 1, 7, 2, 6, 4],
  fixed: [1, 4],
};

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;

const describeCall = (puzzle: EvalPuzzleInstance, arrangement: readonly number[]) =>
  `evaluatePuzzle(${JSON.stringify(puzzle)}, ${fmt(arrangement)})`;

const evaluate = (puzzle: EvalPuzzleInstance, arrangement: readonly number[]) =>
  evaluatePuzzle(puzzle, [...arrangement]);

const rejection = async (puzzle: EvalPuzzleInstance, arrangement: readonly number[]) => {
  const call = describeCall(puzzle, arrangement);
  const outcome = await evaluate(puzzle, arrangement).then(
    (result) => ({ rejected: false as const, result }),
    (error: unknown) => ({ rejected: true as const, error })
  );
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

const CASES: Case[] = [
  {
    label: 'quicksort [2, 1] keeps its Checkpoint 1 score',
    puzzle: { template: 'quicksort-most-comparisons', values: [1, 2], fixed: [] },
    arrangement: [2, 1],
    expected: { template: 'quicksort-most-comparisons', solved: true, score: 3 },
  },
  {
    label: 'bubble #21 start: 5 passes miss the target 4, so unsolved with score null',
    puzzle: BUBBLE_21,
    arrangement: [6, 2, 8, 1, 5, 3, 7, 4],
    expected: { template: 'bubble-exact-passes', solved: false, score: null, passes: 5, swaps: 14 },
  },
  {
    label: 'bubble #21 solved: exactly 4 passes, scored by its 11 swaps',
    puzzle: BUBBLE_21,
    arrangement: [4, 2, 8, 1, 5, 3, 7, 6],
    expected: { template: 'bubble-exact-passes', solved: true, score: 11, passes: 4, swaps: 11 },
  },
  {
    label: 'bubble #21 most passes: n - 1 = 7 passes (never 8), unsolved',
    puzzle: BUBBLE_21,
    arrangement: [8, 2, 6, 4, 5, 3, 7, 1],
    expected: { template: 'bubble-exact-passes', solved: false, score: null, passes: 7, swaps: 18 },
  },
  {
    label: 'bubble 8 reversed values with targetPasses 7: the n - 1 boundary is solvable',
    puzzle: {
      template: 'bubble-exact-passes',
      values: [1, 2, 3, 4, 5, 6, 7, 8],
      fixed: [],
      targetPasses: 7,
    },
    arrangement: [8, 7, 6, 5, 4, 3, 2, 1],
    expected: { template: 'bubble-exact-passes', solved: true, score: 28, passes: 7, swaps: 28 },
  },
  {
    label: 'bubble empty array with targetPasses 0: no passes, solved with 0 swaps',
    puzzle: { template: 'bubble-exact-passes', values: [], fixed: [], targetPasses: 0 },
    arrangement: [],
    expected: { template: 'bubble-exact-passes', solved: true, score: 0, passes: 0, swaps: 0 },
  },
  {
    label: 'insertion-beats-merge #22 solved: insertion 15 < merge 16, scored by 11 inversions',
    puzzle: INSERTION_22,
    arrangement: [5, 3, 2, 6, 7, 1, 4, 8],
    expected: {
      template: 'insertion-beats-merge',
      solved: true,
      score: 11,
      insertionComparisons: 15,
      mergeComparisons: 16,
      inversions: 11,
    },
  },
  {
    label: 'insertion-beats-merge #22 tie: insertion 16 = merge 16 is unsolved',
    puzzle: INSERTION_22,
    arrangement: [5, 3, 1, 6, 7, 2, 8, 4],
    expected: {
      template: 'insertion-beats-merge',
      solved: false,
      score: null,
      insertionComparisons: 16,
      mergeComparisons: 16,
      inversions: 11,
    },
  },
  {
    label: 'insertion-beats-merge #22 start: insertion 20 > merge 17 is unsolved',
    puzzle: INSERTION_22,
    arrangement: [5, 3, 8, 1, 7, 2, 6, 4],
    expected: {
      template: 'insertion-beats-merge',
      solved: false,
      score: null,
      insertionComparisons: 20,
      mergeComparisons: 17,
      inversions: 15,
    },
  },
  {
    label: 'insertion-beats-merge singleton [42]: 0 = 0 tie is unsolved with score null',
    puzzle: { template: 'insertion-beats-merge', values: [42], fixed: [] },
    arrangement: [42],
    expected: {
      template: 'insertion-beats-merge',
      solved: false,
      score: null,
      insertionComparisons: 0,
      mergeComparisons: 0,
      inversions: 0,
    },
  },
];

describe('evaluatePuzzle — results through the wasm build', () => {
  it.each(CASES)('$label', async ({ label, puzzle, arrangement, expected }) => {
    const result = await evaluate(puzzle, arrangement);
    expect(
      result,
      `${label}: ${describeCall(puzzle, arrangement)} should resolve to ${JSON.stringify(expected)}, got ${JSON.stringify(result)}`
    ).toEqual(expected);
  });

  it('ignores extra daily-puzzle metadata fields when evaluating a full Puzzle object', async () => {
    const bubbleDaily = { ...BUBBLE_21, number: 21, par: 11, date: '2026-11-24' };
    const insertionDaily = { ...INSERTION_22, number: 22, par: 10, date: '2026-11-24' };

    await expect(evaluate(bubbleDaily, [4, 2, 8, 1, 5, 3, 7, 6])).resolves.toEqual({
      template: 'bubble-exact-passes',
      solved: true,
      score: 11,
      passes: 4,
      swaps: 11,
    });
    await expect(evaluate(insertionDaily, [5, 3, 2, 6, 7, 1, 4, 8])).resolves.toEqual({
      template: 'insertion-beats-merge',
      solved: true,
      score: 11,
      insertionComparisons: 15,
      mergeComparisons: 16,
      inversions: 11,
    });
  });

  it('gives the same results when every case runs concurrently', async () => {
    const results = await Promise.all(
      CASES.map(({ puzzle, arrangement }) => evaluate(puzzle, arrangement))
    );
    CASES.forEach(({ label, puzzle, arrangement, expected }, index) => {
      expect(
        results[index],
        `Promise.all entry #${index + 1} (${label}): ${describeCall(puzzle, arrangement)} should resolve to ${JSON.stringify(expected)}`
      ).toEqual(expected);
    });
  });
});

describe('evaluatePuzzle — invalid arrangements', () => {
  it.each([
    {
      label: 'bubble #21 with fixed slot 2 (value 2) moved',
      puzzle: BUBBLE_21,
      arrangement: [2, 6, 8, 1, 5, 3, 7, 4],
      pattern: /fixed/i,
    },
    {
      label: 'bubble #21 with 7 values instead of 8',
      puzzle: BUBBLE_21,
      arrangement: [6, 2, 8, 1, 5, 3, 7],
      pattern: /length/i,
    },
    {
      label: 'insertion-beats-merge #22 with 9 in place of 5',
      puzzle: INSERTION_22,
      arrangement: [9, 3, 8, 1, 7, 2, 6, 4],
      pattern: /permutation/i,
    },
    {
      label: 'insertion-beats-merge #22 with fixed slot 5 (value 7) moved',
      puzzle: INSERTION_22,
      arrangement: [5, 3, 8, 1, 2, 7, 6, 4],
      pattern: /fixed/i,
    },
  ])('rejects $label', async ({ label, puzzle, arrangement, pattern }) => {
    const message = await rejection(puzzle, arrangement);
    expect(
      message,
      `${label}: ${describeCall(puzzle, arrangement)} error message should match ${pattern}, got ${JSON.stringify(message)}`
    ).toMatch(pattern);
  });

  it('still evaluates correctly right after a rejection', async () => {
    await rejection(BUBBLE_21, [2, 6, 8, 1, 5, 3, 7, 4]);
    const result = await evaluate(BUBBLE_21, [4, 2, 8, 1, 5, 3, 7, 6]);
    expect(
      result,
      `after a rejected bubble call, ${describeCall(BUBBLE_21, [4, 2, 8, 1, 5, 3, 7, 6])} should still resolve to the solved 4 passes / 11 swaps result, got ${JSON.stringify(result)}`
    ).toEqual({ template: 'bubble-exact-passes', solved: true, score: 11, passes: 4, swaps: 11 });
  });

  it.each([
    { label: 'bubble-exact-passes', puzzle: BUBBLE_21, arrangement: BUBBLE_21.values },
    { label: 'insertion-beats-merge', puzzle: INSERTION_22, arrangement: INSERTION_22.values },
  ])(
    'scorePuzzle rejects $label instead of returning null as a number',
    async ({ puzzle, arrangement }) => {
      await expect(scorePuzzle(puzzle, arrangement)).rejects.toThrow(/evaluatePuzzle/i);
    }
  );
});
