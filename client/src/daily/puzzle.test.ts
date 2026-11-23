import { describe, expect, it } from 'vitest';
import { parsePuzzle, shareText, type Puzzle } from './puzzle';

const DAILY_12: Puzzle = {
  number: 12,
  template: 'quicksort-most-comparisons',
  values: [8, 1, 6, 3, 2, 7, 4, 5],
  fixed: [1, 4, 6],
  par: 34,
};

const without = <K extends keyof Puzzle>(key: K) => {
  const { [key]: omitted, ...rest } = DAILY_12;
  return rest;
};

const expectInvalid = (label: string, input: unknown) => {
  const call = `parsePuzzle(${JSON.stringify(input)}) [${label}]`;
  let outcome: { threw: false; result: Puzzle } | { threw: true; error: unknown };
  try {
    outcome = { threw: false, result: parsePuzzle(input) };
  } catch (error: unknown) {
    outcome = { threw: true, error };
  }

  expect(
    outcome.threw,
    `${call}: expected parsePuzzle to throw an Error, but it returned ${
      outcome.threw ? 'an error' : JSON.stringify(outcome.result)
    }`
  ).toBe(true);
  if (!outcome.threw) return;

  expect(outcome.error, `${call}: expected thrown value to be an Error instance`).toBeInstanceOf(
    Error
  );
};

describe('parsePuzzle — valid puzzles', () => {
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
  ])('returns $label unchanged', ({ label, input }) => {
    const result = parsePuzzle(input);
    expect(
      result,
      `parsePuzzle(${JSON.stringify(input)}) [${label}]: expected puzzle to be returned unchanged`
    ).toEqual(input);
  });
});

describe('parsePuzzle — invalid fixed indices', () => {
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
    expectInvalid(label, input);
  });
});

describe('parsePuzzle — broken shapes', () => {
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
      label: 'missing par',
      input: without('par'),
    },
    {
      label: 'non-string date',
      input: { ...DAILY_12, date: 20261123 },
    },
    {
      label: 'blank date',
      input: { ...DAILY_12, date: '   ' },
    },
  ])('throws an Error for $label', ({ label, input }) => {
    expectInvalid(label, input);
  });
});

describe('parsePuzzle — no best score', () => {
  it('parses a puzzle that has no best field', () => {
    const input = { ...DAILY_12 };
    const call = `parsePuzzle(${JSON.stringify(input)}) [no best field]`;
    let result: Puzzle | undefined;
    let error: unknown;
    try {
      result = parsePuzzle(input);
    } catch (caught: unknown) {
      error = caught;
    }
    expect(
      error,
      `${call}: expected no error because best is not part of the puzzle file, but it threw ${String(error)}`
    ).toBeUndefined();
    expect(result, `${call}: expected the puzzle back unchanged`).toEqual(input);
  });

  it('accepts a file with an extra best field but does not pass best on', () => {
    const input = { ...DAILY_12, best: 36 };
    const call = `parsePuzzle(${JSON.stringify(input)}) [extra best field]`;
    let result: Puzzle | undefined;
    let error: unknown;
    try {
      result = parsePuzzle(input);
    } catch (caught: unknown) {
      error = caught;
    }
    expect(
      error,
      `${call}: expected an extra best field to be ignored, but it threw ${String(error)}`
    ).toBeUndefined();
    expect(
      result && 'best' in result,
      `${call}: expected the returned puzzle to have no best key, got ${JSON.stringify(result)}`
    ).toBe(false);
    expect(result, `${call}: expected { number, template, values, fixed, par } only`).toEqual(
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
      `shareText(puzzle #12 goal 34, ${JSON.stringify(scores)}) [${label}]: expected ${JSON.stringify(want)}, got ${JSON.stringify(text)}`
    ).toBe(want);
  });

  it('never includes a best score, a 🏆, or the arrangement', () => {
    const scores = [30, 34, 36];
    const text = shareText({ ...DAILY_12, best: 36 } as Puzzle, scores);
    const call = `shareText(puzzle #12 goal 34 with extra best 36, ${JSON.stringify(scores)})`;
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
