import { describe, expect, it } from 'vitest';
import {
  HISTORY_STORAGE_KEY,
  HISTORY_VERSION,
  currentStreak,
  isIsoDate,
  loadHistory,
  longestStreak,
  recordChallengeTries,
  saveHistory,
  type DailyHistory,
  type SavedTry,
  type StorageLike,
} from './history';
import type { PlayInput, TryScore } from './playMachine';
import type { Challenge } from './challenge';

/**
 * Daily history: which dated challenges were played, each try's input and score, and the streaks
 * worked out from them. QUICK_12 and DRIFT_26 are the challenges worked in e2e/support/daily-fixtures.ts
 * and e2e/support/daily-list-fixtures.ts, with a calendar date added.
 */

const QUICK_12: Challenge = {
  number: 12,
  template: 'quicksort-most-comparisons',
  values: [8, 1, 6, 3, 2, 7, 4, 5],
  fixed: [1, 4, 6],
  goal: 34,
  date: '2026-12-21',
};

const DRIFT_26: Challenge = {
  number: 26,
  template: 'linked-list-index-drift',
  start: [8, 3, 6, 1],
  target: [3, 6, 5, 1],
  goal: 6,
  date: '2026-12-22',
};

const MISS: TryScore = { kind: 'unsolved', reason: 'The list does not match the target.' };
const arrangement = (values: number[]): PlayInput => ({ kind: 'arrangement', arrangement: values });
const OPERATIONS: PlayInput = {
  kind: 'operations',
  operations: [
    { kind: 'delete', index: 0 },
    { kind: 'insert', value: 5, index: 2 },
  ],
};
const tryOf = (score: TryScore, input: PlayInput = arrangement([8, 1, 6, 3, 2, 7, 4, 5])) => ({
  input,
  score,
});
const describeScores = (tries: SavedTry[]) =>
  JSON.stringify(tries.map(({ score }) => (typeof score === 'number' ? score : '✗')));

const emptyHistory = (): DailyHistory => ({ version: HISTORY_VERSION, results: {} });
const EMPTY = { version: 1, results: {} };

const resultsFor = (history: DailyHistory, date: string) =>
  Object.values(history.results).filter((result) => result.date === date);

const memoryStorage = () => {
  const items = new Map<string, string>();
  const storage: StorageLike = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, String(value));
    },
  };
  return { items, storage };
};

const throwingStorage: StorageLike = {
  getItem: () => {
    throw new Error('SecurityError: localStorage is disabled');
  },
  setItem: () => {
    throw new Error('QuotaExceededError: localStorage is full');
  },
};

/** Records three tries (so the day is completed) on QUICK_12 for each date, in the order given. */
const finished = (dates: string[], start: DailyHistory = emptyHistory()) =>
  dates.reduce(
    (history, date) =>
      recordChallengeTries(history, { ...QUICK_12, date }, [tryOf(30), tryOf(34), tryOf(31)]),
    start
  );

const started = (date: string, start: DailyHistory) =>
  recordChallengeTries(start, { ...QUICK_12, date }, [tryOf(30)]);

describe('isIsoDate', () => {
  it.each(['2026-12-21', '2026-01-01', '2026-12-31', '2028-02-29', '2000-02-29'])(
    'accepts the calendar date %s',
    (date) => {
      expect(isIsoDate(date), `isIsoDate(${JSON.stringify(date)}): expected true`).toBe(true);
    }
  );

  it.each([
    ['2026-02-29', '2026 is not a leap year'],
    ['1900-02-29', '1900 is not a leap year'],
    ['2026-02-30', 'February never has 30 days'],
    ['2026-04-31', 'April has 30 days'],
    ['2026-13-01', 'there is no month 13'],
    ['2026-00-10', 'there is no month 0'],
    ['2026-12-00', 'there is no day 0'],
    ['2026-1-5', 'month and day need two digits'],
    ['2026-12-21T00:00:00Z', 'a timestamp is not a calendar date'],
    [' 2026-12-21', 'leading space'],
    ['Mon 23 Nov', 'a display label, not YYYY-MM-DD'],
    ['', 'empty string'],
    [undefined, 'no date'],
  ])('rejects %j (%s)', (date, why) => {
    expect(isIsoDate(date), `isIsoDate(${JSON.stringify(date)}) [${why}]: expected false`).toBe(
      false
    );
  });
});

describe('loadHistory and saveHistory', () => {
  it('loads an empty version 1 history from empty storage', () => {
    const { storage } = memoryStorage();
    const loaded = loadHistory(storage);
    expect(
      loaded,
      `loadHistory(empty storage): expected ${JSON.stringify(EMPTY)}, got ${JSON.stringify(loaded)}`
    ).toEqual(EMPTY);
  });

  it('round-trips arrangement and operations tries under the storage key with version 1', () => {
    const { items, storage } = memoryStorage();
    const withQuick = recordChallengeTries(emptyHistory(), QUICK_12, [
      tryOf(34, arrangement([8, 1, 5, 3, 2, 7, 4, 6])),
      tryOf(MISS, arrangement([5, 1, 8, 3, 2, 7, 4, 6])),
    ]);
    const history = recordChallengeTries(withQuick, DRIFT_26, [tryOf(5, OPERATIONS)]);
    saveHistory(history, storage);

    const raw = items.get('daily.history');
    expect(
      raw,
      `saveHistory: expected a value under 'daily.history', keys were ${JSON.stringify([...items.keys()])}`
    ).toBeTypeOf('string');
    const stored = JSON.parse(raw ?? 'null') as { version?: unknown };
    expect(stored?.version, `saveHistory: stored JSON ${raw} should have version 1`).toBe(1);

    const loaded = loadHistory(storage);
    expect(
      loaded,
      `loadHistory after saveHistory: expected the saved history back unchanged, stored ${raw}`
    ).toEqual(history);
    const drift = resultsFor(loaded, '2026-12-22')[0];
    expect(
      drift?.tries[0]?.input,
      `loadHistory: DRIFT_26 try 1 should keep its operations input, got ${JSON.stringify(drift)}`
    ).toEqual(OPERATIONS);
    const quick = resultsFor(loaded, '2026-12-21')[0];
    expect(
      quick?.tries[1],
      `loadHistory: QUICK_12 try 2 should keep its arrangement and unsolved score, got ${JSON.stringify(quick)}`
    ).toEqual(tryOf(MISS, arrangement([5, 1, 8, 3, 2, 7, 4, 6])));
  });

  it.each([
    ['corrupt JSON', '{"version": 1, "results": {'],
    ['JSON null', 'null'],
    ['a JSON array', '[]'],
    ['a JSON string', '"history"'],
    ['version 2', JSON.stringify({ version: 2, results: {} })],
    ['no version', JSON.stringify({ results: {} })],
    ['results that are not an object', JSON.stringify({ version: 1, results: 'none' })],
  ])('falls back to an empty history for %s', (label, raw) => {
    const { storage } = memoryStorage();
    storage.setItem(HISTORY_STORAGE_KEY, raw);
    let loaded: unknown;
    expect(() => {
      loaded = loadHistory(storage);
    }, `loadHistory(storage holding ${label}: ${raw}): must not throw`).not.toThrow();
    expect(
      loaded,
      `loadHistory(storage holding ${label}: ${raw}): expected ${JSON.stringify(EMPTY)}, got ${JSON.stringify(loaded)}`
    ).toEqual(EMPTY);
  });

  it.each([
    ['throwing storage', throwingStorage],
    ['null storage', null],
  ])('survives %s', (label, storage) => {
    const history = finished(['2026-12-21']);
    let loaded: unknown;
    expect(() => {
      loaded = loadHistory(storage);
    }, `loadHistory(${label}): must not throw`).not.toThrow();
    expect(
      loaded,
      `loadHistory(${label}): expected ${JSON.stringify(EMPTY)}, got ${JSON.stringify(loaded)}`
    ).toEqual(EMPTY);
    expect(
      () => saveHistory(history, storage),
      `saveHistory(history, ${label}): must swallow the storage error`
    ).not.toThrow();
  });
});

describe('recordChallengeTries', () => {
  it.each([
    {
      label: 'two tries, the first reaching goal 34',
      scores: [34, 25],
      completed: false,
      best: 34,
      goal: true,
    },
    {
      label: 'two tries, both below goal 34',
      scores: [30, 25],
      completed: false,
      best: 30,
      goal: false,
    },
    {
      label: 'three tries, highest reaching goal 34',
      scores: [34, 25, 31],
      completed: true,
      best: 34,
      goal: true,
    },
    {
      label: 'three tries with a miss, none reaching goal 34',
      scores: [30, MISS, 31],
      completed: true,
      best: 31,
      goal: false,
    },
    {
      label: 'three unsolved tries',
      scores: [MISS, MISS, MISS],
      completed: true,
      best: null,
      goal: false,
    },
  ])('records QUICK_12 (higher wins): $label', ({ label, scores, completed, best, goal }) => {
    const tries = scores.map((score) => tryOf(score));
    const call = `recordChallengeTries(empty, QUICK_12 2026-12-21 goal 34, scores ${describeScores(tries)}) [${label}]`;
    const results = resultsFor(recordChallengeTries(emptyHistory(), QUICK_12, tries), '2026-12-21');
    expect(
      results.length,
      `${call}: expected one result dated 2026-12-21, got ${JSON.stringify(results)}`
    ).toBe(1);
    expect(results[0], `${call}: expected the saved result`).toEqual({
      date: '2026-12-21',
      number: 12,
      template: 'quicksort-most-comparisons',
      goal: 34,
      tries,
      completed,
      bestScore: best,
      goalReached: goal,
    });
  });

  it.each([
    { label: 'cheapest try 5 at or below goal 6', scores: [9, 5, MISS], best: 5, goal: true },
    { label: 'cheapest try 7 above goal 6', scores: [9, 8, 7], best: 7, goal: false },
  ])('records DRIFT_26 (lower wins): $label', ({ label, scores, best, goal }) => {
    const tries = scores.map((score) => tryOf(score, OPERATIONS));
    const call = `recordChallengeTries(empty, DRIFT_26 2026-12-22 goal 6, costs ${describeScores(tries)}) [${label}]`;
    const [result] = resultsFor(
      recordChallengeTries(emptyHistory(), DRIFT_26, tries),
      '2026-12-22'
    );
    expect(
      result?.bestScore,
      `${call}: bestScore should be the lowest solved cost ${best}, got ${JSON.stringify(result)}`
    ).toBe(best);
    expect(
      result?.goalReached,
      `${call}: goalReached should be ${goal}, got ${JSON.stringify(result)}`
    ).toBe(goal);
    expect(result?.completed, `${call}: 3 tries should mark the day completed`).toBe(true);
    expect(result?.template, `${call}: template should be saved`).toBe('linked-list-index-drift');
  });

  it('replaces the earlier record for the same day and leaves the input history untouched', () => {
    const before = recordChallengeTries(emptyHistory(), QUICK_12, [tryOf(30)]);
    const snapshot = JSON.stringify(before);
    const after = recordChallengeTries(before, QUICK_12, [tryOf(30), tryOf(34), tryOf(31)]);
    const results = resultsFor(after, '2026-12-21');
    const call = 'recordChallengeTries(history with 1 try on 2026-12-21, QUICK_12, 3 tries)';
    expect(
      results.length,
      `${call}: expected a single 2026-12-21 result, got ${JSON.stringify(results)}`
    ).toBe(1);
    expect(results[0]?.tries.length, `${call}: the result should now hold 3 tries`).toBe(3);
    expect(results[0]?.completed, `${call}: the result should now be completed`).toBe(true);
    expect(
      JSON.stringify(before),
      `${call}: must return a new history, not change the one passed in`
    ).toBe(snapshot);
  });

  it.each([
    ['no date', { ...QUICK_12, date: undefined }],
    ['a display label "Mon 23 Nov"', { ...QUICK_12, date: 'Mon 23 Nov' }],
    ['an impossible date 2026-02-30', { ...QUICK_12, date: '2026-02-30' }],
  ])('leaves history unchanged for a challenge with %s', (label, challenge) => {
    const history = finished(['2026-12-20']);
    const snapshot = JSON.parse(JSON.stringify(history)) as DailyHistory;
    const result = recordChallengeTries(history, challenge, [tryOf(30), tryOf(34), tryOf(31)]);
    expect(
      result,
      `recordChallengeTries(history with 2026-12-20, QUICK_12 with ${label}, 3 tries): expected history unchanged, got ${JSON.stringify(result)}`
    ).toEqual(snapshot);
  });
});

describe('currentStreak and longestStreak', () => {
  const streaks = (history: DailyHistory, today: string | undefined) => ({
    current: currentStreak(history, today),
    longest: longestStreak(history),
  });
  const days = (history: DailyHistory) =>
    JSON.stringify(
      Object.values(history.results)
        .map((r) => `${r.date}${r.completed ? '' : ' (unfinished)'}`)
        .sort()
    );

  const D = (...dates: string[]) => dates;
  it.each([
    ['no history', D(), D(), '2026-12-21', 0, 0],
    ['today finished', D('2026-12-21'), D(), '2026-12-21', 1, 1],
    ['yesterday finished, today not played', D('2026-12-21'), D(), '2026-12-22', 1, 1],
    ['last finished two days ago', D('2026-12-21'), D(), '2026-12-23', 0, 1],
    ['today started but not finished', D(), D('2026-12-21'), '2026-12-21', 0, 0],
    ['month boundary', D('2026-11-30', '2026-12-01'), D(), '2026-12-01', 2, 2],
    ['year boundary', D('2026-12-30', '2026-12-31', '2027-01-01'), D(), '2027-01-01', 3, 3],
    ['leap day 2028-02-29', D('2028-02-28', '2028-02-29', '2028-03-01'), D(), '2028-03-01', 3, 3],
    ['no leap day in 2026', D('2026-02-28', '2026-03-01'), D(), '2026-03-01', 2, 2],
    ['skipped leap day 2028-02-29', D('2028-02-28', '2028-03-01'), D(), '2028-03-01', 1, 1],
    [
      'days recorded out of order',
      D('2026-12-23', '2026-12-21', '2026-12-22'),
      D(),
      '2026-12-23',
      3,
      3,
    ],
    [
      'an unfinished day in the middle',
      D('2026-12-21', '2026-12-23'),
      D('2026-12-22'),
      '2026-12-23',
      1,
      1,
    ],
    ['invalid today undefined', D('2026-12-21'), D(), undefined, 0, 1],
    ['invalid today "Mon 23 Nov"', D('2026-12-21'), D(), 'Mon 23 Nov', 0, 1],
    ['invalid today 2026-12-32', D('2026-12-31'), D(), '2026-12-32', 0, 1],
  ] as const)('%s', (label, done, unfinished, today, current, longest) => {
    const history = unfinished.reduce((h, date) => started(date, h), finished([...done]));
    const got = streaks(history, today);
    expect(
      got,
      `streaks for days ${days(history)} on today ${JSON.stringify(today)} [${label}]: expected current ${current}, longest ${longest}; got ${JSON.stringify(got)}`
    ).toEqual({ current, longest });
  });

  it('keeps the streak alive until today is finished, then counts today', () => {
    const twoDays = finished(['2026-12-21', '2026-12-22']);
    const inProgress = started('2026-12-23', twoDays);
    const before = currentStreak(inProgress, '2026-12-23');
    expect(
      before,
      `currentStreak(days ${days(inProgress)}, '2026-12-23'): yesterday is finished, so the streak should stay 2 while today is in progress, got ${before}`
    ).toBe(2);
    const done = finished(['2026-12-23'], inProgress);
    const after = currentStreak(done, '2026-12-23');
    expect(
      after,
      `currentStreak(days ${days(done)}, '2026-12-23'): finishing today should raise the streak to 3, got ${after}`
    ).toBe(3);
  });

  it('missing a day resets the current streak, and longestStreak remembers the earlier run', () => {
    const run = finished(['2026-12-20', '2026-12-21', '2026-12-22']);
    const gap = currentStreak(run, '2026-12-24');
    expect(
      gap,
      `currentStreak(days ${days(run)}, '2026-12-24'): 2026-12-23 was missed, so expected 0, got ${gap}`
    ).toBe(0);
    const restarted = finished(['2026-12-24'], run);
    const got = streaks(restarted, '2026-12-24');
    expect(
      got,
      `streaks for days ${days(restarted)} on '2026-12-24': finishing after a missed day should restart at 1 while the longest stays 3; got ${JSON.stringify(got)}`
    ).toEqual({ current: 1, longest: 3 });
  });
});
