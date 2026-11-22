import { describe, expect, it } from 'vitest';
import { loadPuzzles, scorePuzzle, type PuzzleInstance } from './puzzles';

// Needs the puzzles wasm built first: `pnpm run puzzles` from the repo root.

const QUICKSORT = 'quicksort-most-comparisons';

const DAILY_12: PuzzleInstance = {
  template: QUICKSORT,
  values: [8, 1, 6, 3, 2, 7, 4, 5],
  fixed: [1, 4, 6],
};

const TWO_VALUES: PuzzleInstance = {
  template: QUICKSORT,
  values: [2, 1],
  fixed: [],
};

const FIVE_VALUES: PuzzleInstance = {
  template: QUICKSORT,
  values: [1, 2, 3, 4, 5],
  fixed: [],
};

const SINGLE_VALUE: PuzzleInstance = {
  template: QUICKSORT,
  values: [42],
  fixed: [],
};

const EMPTY_PUZZLE: PuzzleInstance = {
  template: QUICKSORT,
  values: [],
  fixed: [],
};

const LARGE_SORTED_VALUES = Array.from({ length: 300 }, (_, index) => index + 1);

const LARGE_SORTED_PUZZLE: PuzzleInstance = {
  template: QUICKSORT,
  values: LARGE_SORTED_VALUES,
  fixed: [],
};

type ScoreCase = {
  label: string;
  puzzle: PuzzleInstance;
  arrangement: number[];
  expected: number;
};

const formatArray = (values: number[]) =>
  values.length <= 12
    ? `[${values.join(', ')}]`
    : `[${values.slice(0, 3).join(', ')}, ..., ${values[values.length - 1]}] (length ${values.length})`;

const describeCall = (puzzle: PuzzleInstance, arrangement: number[], label?: string) => {
  const prefix = label ? `${label}: ` : '';
  return `${prefix}scorePuzzle({ template: "${puzzle.template}", values: ${formatArray(puzzle.values)}, fixed: ${formatArray(puzzle.fixed)} }, ${formatArray(arrangement)})`;
};

const expectRejection = async (
  puzzle: PuzzleInstance,
  arrangement: number[],
  expectedPattern: RegExp,
  label: string
) => {
  const call = describeCall(puzzle, arrangement, label);
  const outcome = await scorePuzzle(puzzle, arrangement).then(
    (score) => ({ rejected: false as const, score }),
    (error: unknown) => ({ rejected: true as const, error })
  );

  expect(
    outcome.rejected,
    `${call}: should reject with an Error matching ${expectedPattern}, but resolved with ${
      outcome.rejected ? 'a rejection' : outcome.score
    }`
  ).toBe(true);
  if (!outcome.rejected) return;

  expect(outcome.error, `${call}: rejection reason should be an Error instance`).toBeInstanceOf(
    Error
  );
  expect(
    (outcome.error as Error).message,
    `${call}: error message should match ${expectedPattern}`
  ).toMatch(expectedPattern);
};

// All expected comparison counts below were computed with `/tmp/qsteps.py`.
const FIXED_CASES: ScoreCase[] = [
  {
    label: 'DAILY_12 starting arrangement',
    puzzle: DAILY_12,
    arrangement: [8, 1, 6, 3, 2, 7, 4, 5],
    expected: 30,
  },
  {
    label: 'DAILY_12 par arrangement (keeping fixed slots 1, 4, 6)',
    puzzle: DAILY_12,
    arrangement: [8, 1, 5, 3, 2, 7, 4, 6],
    expected: 34,
  },
  {
    label: 'DAILY_12 best arrangement (keeping fixed slots 1, 4, 6)',
    puzzle: DAILY_12,
    arrangement: [8, 1, 6, 3, 2, 5, 4, 7],
    expected: 36,
  },
  {
    label: 'DAILY_12 low arrangement (keeping fixed slots 1, 4, 6)',
    puzzle: DAILY_12,
    arrangement: [5, 1, 8, 3, 2, 7, 4, 6],
    expected: 25,
  },
  {
    label: 'two values reversed [2, 1]',
    puzzle: TWO_VALUES,
    arrangement: [2, 1],
    expected: 3,
  },
  {
    label: 'two values sorted [1, 2]',
    puzzle: TWO_VALUES,
    arrangement: [1, 2],
    expected: 3,
  },
  {
    label: 'five values sorted [1, 2, 3, 4, 5]',
    puzzle: FIVE_VALUES,
    arrangement: [1, 2, 3, 4, 5],
    expected: 18,
  },
  {
    label: 'five values reversed [5, 4, 3, 2, 1]',
    puzzle: FIVE_VALUES,
    arrangement: [5, 4, 3, 2, 1],
    expected: 18,
  },
  {
    label: 'single value [42]',
    puzzle: SINGLE_VALUE,
    arrangement: [42],
    expected: 0,
  },
  {
    label: 'empty puzzle []',
    puzzle: EMPTY_PUZZLE,
    arrangement: [],
    expected: 0,
  },
];

describe('loadPuzzles', () => {
  it('resolves on initial and repeated calls', async () => {
    const first = await loadPuzzles().then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error })
    );
    expect(
      first,
      'loadPuzzles(), first call: should resolve after loading generated/puzzles.wasm'
    ).toEqual({ ok: true });

    const repeated = await Promise.all([loadPuzzles(), loadPuzzles()]).then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error })
    );
    expect(
      repeated,
      'Promise.all([loadPuzzles(), loadPuzzles()]): repeated calls after load should resolve'
    ).toEqual({ ok: true });
  });
});

describe('scorePuzzle — fixed inputs', () => {
  it.each(FIXED_CASES)(
    'scores $label as $expected',
    async ({ label, puzzle, arrangement, expected }) => {
      const score = await scorePuzzle(puzzle, arrangement);
      expect(
        score,
        `${describeCall(puzzle, arrangement, label)}: comparison count should be ${expected}`
      ).toBe(expected);
    }
  );
});

describe('scorePuzzle — large input', () => {
  it('scores a large input (300 sorted values, the deepest recursion for that size) as 45448', async () => {
    const score = await scorePuzzle(LARGE_SORTED_PUZZLE, LARGE_SORTED_VALUES);
    expect(
      score,
      `${describeCall(LARGE_SORTED_PUZZLE, LARGE_SORTED_VALUES, '300 sorted values')}: comparison count should be 45448`
    ).toBe(45448);
  });
});

describe('scorePuzzle — repeated and concurrent calls', () => {
  const BATCH_CASES: ScoreCase[] = [
    FIXED_CASES[0], // DAILY_12 start -> 30
    FIXED_CASES[1], // DAILY_12 par -> 34
    FIXED_CASES[2], // DAILY_12 best -> 36
    FIXED_CASES[3], // DAILY_12 low -> 25
    FIXED_CASES[4], // [2, 1] -> 3
    FIXED_CASES[6], // [1, 2, 3, 4, 5] -> 18
    FIXED_CASES[9], // [] -> 0
    {
      label: '300 sorted values',
      puzzle: LARGE_SORTED_PUZZLE,
      arrangement: LARGE_SORTED_VALUES,
      expected: 45448,
    },
  ];

  it('gives consistent scores across 40 sequential calls without memory corruption', async () => {
    const totalCalls = 40;
    const sequence = Array.from(
      { length: totalCalls },
      (_, index) => BATCH_CASES[index % BATCH_CASES.length]
    );
    const scores: number[] = [];

    await sequence.reduce(
      (chain, { puzzle, arrangement }) =>
        chain.then(async () => {
          scores.push(await scorePuzzle(puzzle, arrangement));
        }),
      Promise.resolve()
    );

    sequence.forEach(({ label, puzzle, arrangement, expected }, index) => {
      expect(
        scores[index],
        `sequential call #${index + 1}/${totalCalls} (${describeCall(puzzle, arrangement, label)}): comparison count should be ${expected}`
      ).toBe(expected);
    });
  });

  it('gives consistent scores across concurrent Promise.all calls', async () => {
    const batch = [...BATCH_CASES, FIXED_CASES[5], FIXED_CASES[7], FIXED_CASES[8], FIXED_CASES[2]];
    const scores = await Promise.all(
      batch.map(({ puzzle, arrangement }) => scorePuzzle(puzzle, arrangement))
    );

    batch.forEach(({ label, puzzle, arrangement, expected }, index) => {
      expect(
        scores[index],
        `Promise.all entry #${index + 1}/${batch.length} (${describeCall(puzzle, arrangement, label)}): comparison count should be ${expected}`
      ).toBe(expected);
    });
  });
});

describe('scorePuzzle — invalid inputs and recovery', () => {
  it('rejects when the template id is unknown, naming the id in the Error message', async () => {
    const unknownId = 'unknown-puzzle-template';
    const puzzle: PuzzleInstance = { template: unknownId, values: [2, 1], fixed: [] };
    await expectRejection(puzzle, [2, 1], new RegExp(unknownId), 'unknown template id');
  });

  it.each([
    {
      label: 'arrangement shorter than puzzle values (7 vs 8)',
      arrangement: [8, 1, 6, 3, 2, 7, 4],
    },
    {
      label: 'arrangement longer than puzzle values (9 vs 8)',
      arrangement: [8, 1, 6, 3, 2, 7, 4, 5, 9],
    },
  ])('rejects with "length" when $label', async ({ label, arrangement }) => {
    await expectRejection(DAILY_12, arrangement, /length/i, label);
  });

  it.each([
    {
      label: 'fixed slot 1 moved (value 1 swapped with 8 at slot 0)',
      arrangement: [1, 8, 6, 3, 2, 7, 4, 5],
    },
    {
      label: 'fixed slot 6 moved (value 4 swapped with 5 at slot 7)',
      arrangement: [8, 1, 6, 3, 2, 7, 5, 4],
    },
  ])('rejects with "fixed" when $label', async ({ label, arrangement }) => {
    await expectRejection(DAILY_12, arrangement, /fixed/i, label);
  });

  it.each([
    {
      label: 'arrangement duplicates a free value (8 twice, missing 5)',
      arrangement: [8, 1, 6, 3, 2, 7, 4, 8],
    },
    {
      label: 'arrangement contains a value not in puzzle.values (99 instead of 8)',
      arrangement: [99, 1, 6, 3, 2, 7, 4, 5],
    },
  ])('rejects with "permutation" when $label', async ({ label, arrangement }) => {
    await expectRejection(DAILY_12, arrangement, /permutation/i, label);
  });

  it('scores valid puzzles correctly immediately after each rejection kind', async () => {
    const recoverySteps: Array<{
      badLabel: string;
      badPuzzle: PuzzleInstance;
      badArrangement: number[];
      pattern: RegExp;
      goodCase: ScoreCase;
    }> = [
      {
        badLabel: 'unknown template id',
        badPuzzle: { template: 'not-a-real-template', values: [2, 1], fixed: [] },
        badArrangement: [2, 1],
        pattern: /not-a-real-template/,
        goodCase: FIXED_CASES[0], // DAILY_12 start -> 30
      },
      {
        badLabel: 'wrong length (7 vs 8)',
        badPuzzle: DAILY_12,
        badArrangement: [8, 1, 6, 3, 2, 7, 4],
        pattern: /length/i,
        goodCase: FIXED_CASES[1], // DAILY_12 par -> 34
      },
      {
        badLabel: 'fixed slot 1 moved',
        badPuzzle: DAILY_12,
        badArrangement: [1, 8, 6, 3, 2, 7, 4, 5],
        pattern: /fixed/i,
        goodCase: FIXED_CASES[2], // DAILY_12 best -> 36
      },
      {
        badLabel: 'not a permutation (duplicate 8)',
        badPuzzle: DAILY_12,
        badArrangement: [8, 1, 6, 3, 2, 7, 4, 8],
        pattern: /permutation/i,
        goodCase: FIXED_CASES[3], // DAILY_12 low -> 25
      },
    ];

    await recoverySteps.reduce(
      (chain, { badLabel, badPuzzle, badArrangement, pattern, goodCase }) =>
        chain.then(async () => {
          await expectRejection(badPuzzle, badArrangement, pattern, badLabel);
          const score = await scorePuzzle(goodCase.puzzle, goodCase.arrangement);
          expect(
            score,
            `recovery call after ${badLabel} (${describeCall(goodCase.puzzle, goodCase.arrangement, goodCase.label)}): comparison count should be ${goodCase.expected}`
          ).toBe(goodCase.expected);
        }),
      Promise.resolve()
    );
  });
});
