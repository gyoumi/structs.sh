import { describe, expect, it } from 'vitest';
import { parsePuzzle, type Puzzle } from './puzzle';

const DAILY_12: Puzzle = {
  number: 12,
  template: 'quicksort-most-comparisons',
  values: [8, 1, 6, 3, 2, 7, 4, 5],
  fixed: [1, 4, 6],
  par: 34,
  best: 36,
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
      label: 'missing best',
      input: without('best'),
    },
  ])('throws an Error for $label', ({ label, input }) => {
    expectInvalid(label, input);
  });
});
