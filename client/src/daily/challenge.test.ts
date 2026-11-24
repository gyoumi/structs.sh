import { describe, expect, it } from 'vitest';
import { CHALLENGE_URL, parseChallenge, shareText, type Challenge } from './challenge';

const DAILY_12: Challenge = {
  number: 12,
  template: 'quicksort-most-comparisons',
  values: [8, 1, 6, 3, 2, 7, 4, 5],
  fixed: [1, 4, 6],
  goal: 34,
};

const without = <K extends keyof Challenge>(key: K) => {
  const { [key]: omitted, ...rest } = DAILY_12;
  return rest;
};

const parseOutcome = (input: unknown) => {
  try {
    return { threw: false as const, result: parseChallenge(input) };
  } catch (error: unknown) {
    return { threw: true as const, error };
  }
};

describe('parseChallenge — valid challenges', () => {
  it.each([
    {
      label: 'README example (fixed [1, 4, 6])',
      input: DAILY_12,
    },
    {
      label: 'README example with empty fixed []',
      input: { ...DAILY_12, fixed: [] },
    },
    {
      label: 'boundary fixed indices [0, 7] for 8 values',
      input: { ...DAILY_12, fixed: [0, 7] },
    },
    {
      label: 'optional date label ("Mon 23 Nov")',
      input: { ...DAILY_12, date: 'Mon 23 Nov' },
    },
    {
      label: 'forced-order with duplicate values and distinct BST preorder targetTree',
      input: {
        number: 24,
        template: 'bst-forced-order',
        values: [1, 2, 2, 3],
        targetTree: [1, 2, 3],
        fixed: [],
        goal: 2,
      },
    },
  ])('returns $label unchanged', ({ label, input }) => {
    const result = parseChallenge(input);
    expect(
      result,
      `parseChallenge(${JSON.stringify(input)}) [${label}]: expected challenge to be returned unchanged`
    ).toEqual(input);
  });
});

describe('parseChallenge — invalid fixed indices', () => {
  it.each([
    {
      label: 'non-whole-number fixed index 1.5',
      input: { ...DAILY_12, fixed: [1, 1.5] },
    },
    {
      label: 'negative fixed index -1',
      input: { ...DAILY_12, fixed: [-1] },
    },
    {
      label: 'out-of-range fixed index 8 for 8 values',
      input: { ...DAILY_12, fixed: [8] },
    },
    {
      label: 'out-of-range fixed index 100',
      input: { ...DAILY_12, fixed: [100] },
    },
    {
      label: 'string fixed index "1"',
      input: { ...DAILY_12, fixed: ['1'] },
    },
    {
      label: 'null fixed index',
      input: { ...DAILY_12, fixed: [null] },
    },
  ])('throws an Error for $label', ({ label, input }) => {
    const call = `parseChallenge(${JSON.stringify(input)}) [${label}]`;
    const outcome = parseOutcome(input);
    expect(
      outcome.threw,
      `${call}: expected parseChallenge to throw an Error, but it returned ${
        outcome.threw ? 'an error' : JSON.stringify(outcome.result)
      }`
    ).toBe(true);
    if (outcome.threw) {
      expect(
        outcome.error,
        `${call}: expected thrown value to be an Error instance`
      ).toBeInstanceOf(Error);
    }
  });
});

describe('parseChallenge — broken shapes', () => {
  it.each([
    {
      label: 'null input',
      input: null,
    },
    {
      label: 'missing values',
      input: without('values'),
    },
    {
      label: 'empty values',
      input: { ...DAILY_12, values: [], fixed: [] },
    },
    {
      label: 'non-string template',
      input: { ...DAILY_12, template: 42 },
    },
    {
      label: 'missing goal',
      input: without('goal'),
    },
    {
      label: 'non-string date',
      input: { ...DAILY_12, date: 20261123 },
    },
    {
      label: 'blank date',
      input: { ...DAILY_12, date: '   ' },
    },
    {
      label: 'bubble targetPasses above u32::MAX',
      input: {
        ...DAILY_12,
        template: 'bubble-exact-passes',
        targetPasses: 4294967296,
      },
    },
    {
      label: 'forced-order targetTree that is not a valid BST preorder',
      input: {
        number: 24,
        template: 'bst-forced-order',
        values: [1, 2, 3],
        targetTree: [2, 3, 1],
        goal: 2,
      },
    },
    {
      label: 'non-integer value in values',
      input: { ...DAILY_12, values: [1.5, 2, 3], fixed: [] },
    },
  ])('throws an Error for $label', ({ label, input }) => {
    const call = `parseChallenge(${JSON.stringify(input)}) [${label}]`;
    const outcome = parseOutcome(input);
    expect(
      outcome.threw,
      `${call}: expected parseChallenge to throw an Error, but it returned ${
        outcome.threw ? 'an error' : JSON.stringify(outcome.result)
      }`
    ).toBe(true);
    if (outcome.threw) {
      expect(
        outcome.error,
        `${call}: expected thrown value to be an Error instance`
      ).toBeInstanceOf(Error);
    }
  });
});

describe('parseChallenge — no best score', () => {
  it('parses a challenge that has no best field', () => {
    const input = { ...DAILY_12 };
    const call = `parseChallenge(${JSON.stringify(input)}) [no best field]`;
    let result: Challenge | undefined;
    let error: unknown;
    try {
      result = parseChallenge(input);
    } catch (caught: unknown) {
      error = caught;
    }
    expect(
      error,
      `${call}: expected no error because best is not part of the challenge file, but it threw ${String(error)}`
    ).toBeUndefined();
    expect(result, `${call}: expected the challenge back unchanged`).toEqual(input);
  });

  it('accepts a file with an extra best field but does not pass best on', () => {
    const input = { ...DAILY_12, best: 36 };
    const call = `parseChallenge(${JSON.stringify(input)}) [extra best field]`;
    let result: Challenge | undefined;
    let error: unknown;
    try {
      result = parseChallenge(input);
    } catch (caught: unknown) {
      error = caught;
    }
    expect(
      error,
      `${call}: expected an extra best field to be ignored, but it threw ${String(error)}`
    ).toBeUndefined();
    expect(
      result && 'best' in result,
      `${call}: expected the returned challenge to have no best key, got ${JSON.stringify(result)}`
    ).toBe(false);
    expect(result, `${call}: expected { number, template, values, fixed, goal } only`).toEqual(
      DAILY_12
    );
  });
});

describe('shareText', () => {
  const header = 'structs.sh daily #12 · Quicksort · Goal 34';

  it.each([
    {
      label: 'one try below the goal (30 < 34)',
      scores: [30],
      expected: [header, '30', 'structs.sh/daily'],
    },
    {
      label: 'one try equal to the goal (34 = 34)',
      scores: [34],
      expected: [header, '34 ⭐', 'structs.sh/daily'],
    },
    {
      label: 'one try above the goal (36 > 34, also the solver best)',
      scores: [36],
      expected: [header, '36 ⭐', 'structs.sh/daily'],
    },
    {
      label: 'three tries below, at and above the goal',
      scores: [30, 34, 36],
      expected: [header, '30', '34 ⭐', '36 ⭐', 'structs.sh/daily'],
    },
    {
      label: 'three tries, highest first',
      scores: [34, 25, 31],
      expected: [header, '34 ⭐', '25', '31', 'structs.sh/daily'],
    },
  ])('formats $label', ({ label, scores, expected }) => {
    const text = shareText(DAILY_12, scores);
    const want = expected.join('\n');
    expect(
      text,
      `shareText(challenge #12 goal 34, ${JSON.stringify(scores)}) [${label}]: expected ${JSON.stringify(want)}, got ${JSON.stringify(text)}`
    ).toBe(want);
  });

  it('never includes a best score, a 🏆, or the arrangement', () => {
    const scores = [30, 34, 36];
    const text = shareText({ ...DAILY_12, best: 36 } as Challenge, scores);
    const call = `shareText(challenge #12 goal 34 with extra best 36, ${JSON.stringify(scores)})`;
    expect(text.includes('🏆'), `${call}: must not contain 🏆, got ${JSON.stringify(text)}`).toBe(
      false
    );
    expect(
      /\/\s*36/.test(text),
      `${call}: must not contain "/ 36" (the best), got ${JSON.stringify(text)}`
    ).toBe(false);
    [DAILY_12.values, [8, 1, 5, 3, 2, 7, 4, 6]].forEach((arrangement) => {
      expect(
        text.includes(arrangement.join(', ')) || text.includes(arrangement.join(',')),
        `${call}: must not contain the arrangement ${JSON.stringify(arrangement)}, got ${JSON.stringify(text)}`
      ).toBe(false);
    });
  });
});

describe('shareText — streak line', () => {
  const header = 'structs.sh daily #12 · Quicksort · Goal 34';
  const scores = [34, 25, 31];

  it.each([
    { streak: 1, line: 'Streak: 1 day 🔥' },
    { streak: 4, line: 'Streak: 4 days 🔥' },
  ])('adds "$line" before the link for a streak of $streak', ({ streak, line }) => {
    const text = shareText(DAILY_12, scores, streak);
    const want = [header, '34 ⭐', '25', '31', line, 'structs.sh/daily'].join('\n');
    expect(
      text,
      `shareText(challenge #12 goal 34, ${JSON.stringify(scores)}, streak ${streak}): expected ${JSON.stringify(want)}, got ${JSON.stringify(text)}`
    ).toBe(want);
  });

  it.each([{ streak: 0 }, { streak: undefined }, { streak: -2 }])(
    'adds no streak line for a streak of $streak',
    ({ streak }) => {
      const text = shareText(DAILY_12, scores, streak);
      const want = [header, '34 ⭐', '25', '31', 'structs.sh/daily'].join('\n');
      expect(
        text,
        `shareText(challenge #12 goal 34, ${JSON.stringify(scores)}, streak ${streak}): expected no "Streak:" line, ${JSON.stringify(want)}, got ${JSON.stringify(text)}`
      ).toBe(want);
    }
  );
});

describe('CHALLENGE_URL', () => {
  it("fetches today's challenge from the game server", () => {
    expect(
      CHALLENGE_URL,
      `CHALLENGE_URL: expected the server endpoint '/api/daily' (the server decides the day), got ${JSON.stringify(CHALLENGE_URL)}`
    ).toBe('/api/daily');
  });
});
