import { describe, expect, it } from 'vitest';
import { loadChallenges, scoreChallenge, type ChallengeInstance } from './challenges';

// Needs the challenges wasm built first: `pnpm run challenges` from the repo root.

const QUICKSORT = 'quicksort-most-comparisons';

const DAILY_12: ChallengeInstance = {
  template: QUICKSORT,
  values: [8, 1, 6, 3, 2, 7, 4, 5],
  fixed: [1, 4, 6],
};

const TWO_VALUES: ChallengeInstance = {
  template: QUICKSORT,
  values: [2, 1],
  fixed: [],
};

const FIVE_VALUES: ChallengeInstance = {
  template: QUICKSORT,
  values: [1, 2, 3, 4, 5],
  fixed: [],
};

const SINGLE_VALUE: ChallengeInstance = {
  template: QUICKSORT,
  values: [42],
  fixed: [],
};

const EMPTY_PUZZLE: ChallengeInstance = {
  template: QUICKSORT,
  values: [],
  fixed: [],
};

const LARGE_SORTED_VALUES = Array.from({ length: 300 }, (_, index) => index + 1);

const LARGE_SORTED_PUZZLE: ChallengeInstance = {
  template: QUICKSORT,
  values: LARGE_SORTED_VALUES,
  fixed: [],
};

type ScoreCase = {
  label: string;
  challenge: ChallengeInstance;
  arrangement: number[];
  expected: number;
};

const formatArray = (values: number[]) =>
  values.length <= 12
    ? `[${values.join(', ')}]`
    : `[${values.slice(0, 3).join(', ')}, ..., ${values[values.length - 1]}] (length ${values.length})`;

const describeCall = (challenge: ChallengeInstance, arrangement: number[], label?: string) => {
  const prefix = label ? `${label}: ` : '';
  return `${prefix}scoreChallenge({ template: "${challenge.template}", values: ${formatArray(challenge.values)}, fixed: ${formatArray(challenge.fixed)} }, ${formatArray(arrangement)})`;
};

const rejectionMessage = async (
  challenge: ChallengeInstance,
  arrangement: number[],
  label: string
) => {
  const call = describeCall(challenge, arrangement, label);
  const outcome = await scoreChallenge(challenge, arrangement).then(
    (score) => ({ rejected: false as const, score }),
    (error: unknown) => ({ rejected: true as const, error })
  );

  expect(
    outcome.rejected,
    `${call}: should reject with an Error, but resolved with ${
      outcome.rejected ? 'a rejection' : outcome.score
    }`
  ).toBe(true);
  if (!outcome.rejected) return '';

  expect(outcome.error, `${call}: rejection reason should be an Error instance`).toBeInstanceOf(
    Error
  );
  return (outcome.error as Error).message;
};

const FIXED_CASES: ScoreCase[] = [
  {
    label: 'DAILY_12 starting arrangement',
    challenge: DAILY_12,
    arrangement: [8, 1, 6, 3, 2, 7, 4, 5],
    expected: 30,
  },
  {
    label: 'DAILY_12 goal arrangement (keeping fixed slots 1, 4, 6)',
    challenge: DAILY_12,
    arrangement: [8, 1, 5, 3, 2, 7, 4, 6],
    expected: 34,
  },
  {
    label: 'DAILY_12 best arrangement (keeping fixed slots 1, 4, 6)',
    challenge: DAILY_12,
    arrangement: [8, 1, 6, 3, 2, 5, 4, 7],
    expected: 36,
  },
  {
    label: 'DAILY_12 low arrangement (keeping fixed slots 1, 4, 6)',
    challenge: DAILY_12,
    arrangement: [5, 1, 8, 3, 2, 7, 4, 6],
    expected: 25,
  },
  {
    label: 'two values reversed [2, 1]',
    challenge: TWO_VALUES,
    arrangement: [2, 1],
    expected: 3,
  },
  {
    label: 'two values sorted [1, 2]',
    challenge: TWO_VALUES,
    arrangement: [1, 2],
    expected: 3,
  },
  {
    label: 'five values sorted [1, 2, 3, 4, 5]',
    challenge: FIVE_VALUES,
    arrangement: [1, 2, 3, 4, 5],
    expected: 18,
  },
  {
    label: 'five values reversed [5, 4, 3, 2, 1]',
    challenge: FIVE_VALUES,
    arrangement: [5, 4, 3, 2, 1],
    expected: 18,
  },
  {
    label: 'single value [42]',
    challenge: SINGLE_VALUE,
    arrangement: [42],
    expected: 0,
  },
  {
    label: 'empty challenge []',
    challenge: EMPTY_PUZZLE,
    arrangement: [],
    expected: 0,
  },
];

describe('loadChallenges', () => {
  it('resolves on initial and repeated calls', async () => {
    const first = await loadChallenges().then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error })
    );
    expect(
      first,
      'loadChallenges(), first call: should resolve after loading generated/challenges.wasm'
    ).toEqual({ ok: true });

    const repeated = await Promise.all([loadChallenges(), loadChallenges()]).then(
      () => ({ ok: true as const }),
      (error: unknown) => ({ ok: false as const, error })
    );
    expect(
      repeated,
      'Promise.all([loadChallenges(), loadChallenges()]): repeated calls after load should resolve'
    ).toEqual({ ok: true });
  });
});

describe('scoreChallenge — fixed inputs', () => {
  it.each(FIXED_CASES)(
    'scores $label as $expected',
    async ({ label, challenge, arrangement, expected }) => {
      const score = await scoreChallenge(challenge, arrangement);
      expect(
        score,
        `${describeCall(challenge, arrangement, label)}: comparison count should be ${expected}`
      ).toBe(expected);
    }
  );
});

describe('scoreChallenge — large input', () => {
  it('scores a large input (300 sorted values, the deepest recursion for that size) as 45448', async () => {
    const score = await scoreChallenge(LARGE_SORTED_PUZZLE, LARGE_SORTED_VALUES);
    expect(
      score,
      `${describeCall(LARGE_SORTED_PUZZLE, LARGE_SORTED_VALUES, '300 sorted values')}: comparison count should be 45448`
    ).toBe(45448);
  });
});

describe('scoreChallenge — repeated and concurrent calls', () => {
  const BATCH_CASES: ScoreCase[] = [
    FIXED_CASES[0], // DAILY_12 start -> 30
    FIXED_CASES[1], // DAILY_12 goal -> 34
    FIXED_CASES[2], // DAILY_12 best -> 36
    FIXED_CASES[3], // DAILY_12 low -> 25
    FIXED_CASES[4], // [2, 1] -> 3
    FIXED_CASES[6], // [1, 2, 3, 4, 5] -> 18
    FIXED_CASES[9], // [] -> 0
    {
      label: '300 sorted values',
      challenge: LARGE_SORTED_PUZZLE,
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
      (chain, { challenge, arrangement }) =>
        chain.then(async () => {
          scores.push(await scoreChallenge(challenge, arrangement));
        }),
      Promise.resolve()
    );

    sequence.forEach(({ label, challenge, arrangement, expected }, index) => {
      expect(
        scores[index],
        `sequential call #${index + 1}/${totalCalls} (${describeCall(challenge, arrangement, label)}): comparison count should be ${expected}`
      ).toBe(expected);
    });
  });

  it('gives consistent scores across concurrent Promise.all calls', async () => {
    const batch = [...BATCH_CASES, FIXED_CASES[5], FIXED_CASES[7], FIXED_CASES[8], FIXED_CASES[2]];
    const scores = await Promise.all(
      batch.map(({ challenge, arrangement }) => scoreChallenge(challenge, arrangement))
    );

    batch.forEach(({ label, challenge, arrangement, expected }, index) => {
      expect(
        scores[index],
        `Promise.all entry #${index + 1}/${batch.length} (${describeCall(challenge, arrangement, label)}): comparison count should be ${expected}`
      ).toBe(expected);
    });
  });
});

describe('scoreChallenge — invalid inputs and recovery', () => {
  it('rejects when the template id is unknown, naming the id in the Error message', async () => {
    const unknownId = 'unknown-challenge-template';
    const challenge: ChallengeInstance = { template: unknownId, values: [2, 1], fixed: [] };
    const message = await rejectionMessage(challenge, [2, 1], 'unknown template id');
    expect(
      message,
      `${describeCall(challenge, [2, 1], 'unknown template id')}: error message should name ${unknownId}`
    ).toMatch(new RegExp(unknownId));
  });

  it.each([
    {
      label: 'arrangement shorter than challenge values (7 vs 8)',
      arrangement: [8, 1, 6, 3, 2, 7, 4],
    },
    {
      label: 'arrangement longer than challenge values (9 vs 8)',
      arrangement: [8, 1, 6, 3, 2, 7, 4, 5, 9],
    },
  ])('rejects with "length" when $label', async ({ label, arrangement }) => {
    const message = await rejectionMessage(DAILY_12, arrangement, label);
    expect(
      message,
      `${describeCall(DAILY_12, arrangement, label)}: error message should match /length/i`
    ).toMatch(/length/i);
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
    const message = await rejectionMessage(DAILY_12, arrangement, label);
    expect(
      message,
      `${describeCall(DAILY_12, arrangement, label)}: error message should match /fixed/i`
    ).toMatch(/fixed/i);
  });

  it.each([
    {
      label: 'arrangement duplicates a free value (8 twice, missing 5)',
      arrangement: [8, 1, 6, 3, 2, 7, 4, 8],
    },
    {
      label: 'arrangement contains a value not in challenge.values (99 instead of 8)',
      arrangement: [99, 1, 6, 3, 2, 7, 4, 5],
    },
  ])('rejects with "permutation" when $label', async ({ label, arrangement }) => {
    const message = await rejectionMessage(DAILY_12, arrangement, label);
    expect(
      message,
      `${describeCall(DAILY_12, arrangement, label)}: error message should match /permutation/i`
    ).toMatch(/permutation/i);
  });

  it('scores valid challenges correctly immediately after each rejection kind', async () => {
    const recoverySteps: Array<{
      badLabel: string;
      badPuzzle: ChallengeInstance;
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
        goodCase: FIXED_CASES[1], // DAILY_12 goal -> 34
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
          const message = await rejectionMessage(badPuzzle, badArrangement, badLabel);
          expect(
            message,
            `${describeCall(badPuzzle, badArrangement, badLabel)}: error message should match ${pattern}`
          ).toMatch(pattern);
          const score = await scoreChallenge(goodCase.challenge, goodCase.arrangement);
          expect(
            score,
            `recovery call after ${badLabel} (${describeCall(goodCase.challenge, goodCase.arrangement, goodCase.label)}): comparison count should be ${goodCase.expected}`
          ).toBe(goodCase.expected);
        }),
      Promise.resolve()
    );
  });
});
