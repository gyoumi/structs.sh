import { describe, expect, it } from 'vitest';
import {
  HISTORY_STORAGE_KEY,
  HISTORY_VERSION,
  currentStreak,
  loadHistory,
  persistChallengeTries,
  persistChallengeTriesLocked,
  recordChallengeTries,
  savedTriesForChallenge,
  streakForChallenge,
  type DailyHistory,
  type StorageLike,
} from './history';
import type { PlayInput, TryScore } from './playMachine';
import type { Challenge } from './challenge';

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

const OPERATIONS: PlayInput = {
  kind: 'operations',
  operations: [
    { kind: 'delete', index: 0 },
    { kind: 'insert', value: 5, index: 2 },
  ],
};

const arrangement = (values: number[]): PlayInput => ({ kind: 'arrangement', arrangement: values });
const tryOf = (score: TryScore, input: PlayInput = arrangement([8, 1, 6, 3, 2, 7, 4, 5])) => ({
  input,
  score,
});
const emptyHistory = (): DailyHistory => ({ version: HISTORY_VERSION, results: {} });

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

describe('corrupt history, restored-input validation, and cross-tab merging', () => {
  it('derives completed from validated tries and drops entries over MAX_TRIES', () => {
    const { storage } = memoryStorage();
    storage.setItem(
      HISTORY_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        results: {
          '2026-12-21': {
            date: '2026-12-21',
            number: 12,
            template: 'quicksort-most-comparisons',
            goal: 34,
            tries: [],
            completed: true,
            bestScore: 99,
            goalReached: true,
          },
          '2026-12-22': {
            date: '2026-12-22',
            number: 13,
            template: 'quicksort-most-comparisons',
            goal: 34,
            tries: [tryOf(30), tryOf(31), tryOf(32), tryOf(33)],
            completed: true,
            bestScore: 33,
            goalReached: false,
          },
        },
      })
    );
    const loaded = loadHistory(storage);
    expect(loaded.results['2026-12-21']?.completed, 'empty tries must not be completed').toBe(
      false
    );
    expect(loaded.results['2026-12-21']?.bestScore, 'empty tries must have null bestScore').toBe(
      null
    );
    expect(currentStreak(loaded, '2026-12-21'), 'empty tries must not award a streak').toBe(0);
    expect(loaded.results['2026-12-22'], 'entry with 4 tries (> MAX_TRIES) must be dropped').toBe(
      undefined
    );
  });

  it('rejects saved tries whose challenge identity or inputs do not match the fetched challenge', () => {
    const movedFixed = recordChallengeTries(emptyHistory(), QUICK_12, [
      tryOf(30, arrangement([1, 8, 6, 3, 2, 7, 4, 5])),
    ]);
    expect(
      savedTriesForChallenge(movedFixed, QUICK_12),
      'moved fixed slot must be rejected'
    ).toEqual([]);
    const wrongMultiplicity = recordChallengeTries(emptyHistory(), QUICK_12, [
      tryOf(30, arrangement([8, 1, 8, 3, 2, 7, 4, 5])),
    ]);
    expect(
      savedTriesForChallenge(wrongMultiplicity, QUICK_12),
      'wrong value multiplicity must be rejected'
    ).toEqual([]);
    const changedPuzzle = recordChallengeTries(emptyHistory(), QUICK_12, [tryOf(30)]);
    expect(
      savedTriesForChallenge(changedPuzzle, { ...QUICK_12, number: 99 }),
      'mismatched challenge number must be rejected'
    ).toEqual([]);
    const badOps = recordChallengeTries(emptyHistory(), DRIFT_26, [
      tryOf(5, { kind: 'operations', operations: [{ kind: 'delete', index: 9 }] }),
    ]);
    expect(
      savedTriesForChallenge(badOps, DRIFT_26),
      'out-of-range delete must be rejected'
    ).toEqual([]);
    const valid = recordChallengeTries(emptyHistory(), DRIFT_26, [tryOf(5, OPERATIONS)]);
    expect(savedTriesForChallenge(valid, DRIFT_26), 'valid ops must restore').toHaveLength(1);
  });

  it('merges into fresh storage without erasing another tab or regressing same-day tries', () => {
    const { storage } = memoryStorage();
    const day22 = { ...QUICK_12, number: 13, date: '2026-12-22' };
    persistChallengeTries(day22, [tryOf(30), tryOf(34), tryOf(31)], storage);
    const afterStaleTab = persistChallengeTries(QUICK_12, [tryOf(30)], storage);
    expect(
      afterStaleTab.results['2026-12-22']?.completed,
      'writing 2026-12-21 must preserve 2026-12-22 saved by another tab'
    ).toBe(true);
    const afterRegress = persistChallengeTries(day22, [tryOf(30)], storage);
    expect(
      afterRegress.results['2026-12-22']?.tries.length,
      'stale tab with 1 try must not overwrite 3 completed tries for the same day'
    ).toBe(3);

    const day23 = { ...QUICK_12, number: 14, date: '2026-12-23' };
    const tabATry = tryOf(34, arrangement([8, 1, 5, 3, 2, 7, 4, 6]));
    const tabBTry = tryOf(30, arrangement([8, 1, 6, 3, 2, 7, 4, 5]));
    persistChallengeTries(day23, [tabATry], storage);
    const afterEqualStale = persistChallengeTries(day23, [tabBTry], storage);
    expect(
      afterEqualStale.results['2026-12-23']?.tries,
      'equal-length divergent write from a second tab must not erase the first tab try'
    ).toEqual([tabATry]);
    const afterDivergentLonger = persistChallengeTries(day23, [tabBTry, tryOf(31)], storage);
    expect(
      afterDivergentLonger.results['2026-12-23']?.tries,
      'divergent multi-try write must not erase the first tab try'
    ).toEqual([tabATry]);

    const afterOverCap = persistChallengeTries(
      day22,
      [tryOf(30), tryOf(34), tryOf(31), tryOf(36)],
      storage
    );
    expect(
      afterOverCap.results['2026-12-22']?.tries,
      'over-cap write must not overwrite an already completed 3-try day'
    ).toHaveLength(3);
  });

  it('excludes today from streakForChallenge when saved tries fail validation for today', () => {
    const movedFixed = arrangement([1, 8, 6, 3, 2, 7, 4, 5]);
    const day20 = { ...QUICK_12, number: 11, date: '2026-12-20' };
    const validYesterday = recordChallengeTries(emptyHistory(), day20, [
      tryOf(30),
      tryOf(34),
      tryOf(31),
    ]);
    const withInvalidToday = recordChallengeTries(validYesterday, QUICK_12, [
      tryOf(30, movedFixed),
      tryOf(34, movedFixed),
      tryOf(31, movedFixed),
    ]);
    expect(
      savedTriesForChallenge(withInvalidToday, QUICK_12),
      'invalid saved tries for today must not restore'
    ).toEqual([]);
    expect(
      streakForChallenge(withInvalidToday, QUICK_12),
      'invalid today entry must not increment streak past valid yesterday (expected 1, not 2)'
    ).toBe(1);

    const onlyInvalidToday = recordChallengeTries(emptyHistory(), QUICK_12, [
      tryOf(30, movedFixed),
      tryOf(34, movedFixed),
      tryOf(31, movedFixed),
    ]);
    expect(
      streakForChallenge(onlyInvalidToday, QUICK_12),
      'invalid today entry with no yesterday must give streak 0'
    ).toBe(0);
  });

  it('reports failed write without claiming completion or incrementing streak when setItem throws', async () => {
    const { items, storage } = memoryStorage();
    await persistChallengeTriesLocked(QUICK_12, [tryOf(30), tryOf(34)], storage);

    const quotaStorage: StorageLike = {
      getItem: (key) => items.get(key) ?? null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const outcome = await persistChallengeTriesLocked(
      QUICK_12,
      [tryOf(30), tryOf(34), tryOf(31)],
      quotaStorage
    );
    expect(outcome.status, 'failed setItem must report status failed').toBe('failed');
    expect(
      outcome.tries,
      'failed write must report only the 2 previously persisted tries'
    ).toHaveLength(2);
    expect(
      outcome.history.results['2026-12-21']?.completed,
      'failed 3rd try must not mark the day completed in returned history'
    ).toBe(false);
    expect(
      streakForChallenge(outcome.history, QUICK_12),
      'failed 3rd try must not increment streak'
    ).toBe(0);
  });

  it('serializes concurrent locked persists through navigator.locks so unrelated days survive', async () => {
    const { storage } = memoryStorage();
    let chain = Promise.resolve();
    const lockNames: string[] = [];
    const originalLocks = navigator.locks;
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: <T>(name: string, callback: () => T | Promise<T>): Promise<T> => {
          lockNames.push(name);
          const next = chain.then(() => callback());
          chain = next.then(
            () => undefined,
            () => undefined
          );
          return next;
        },
      },
    });
    try {
      const day22 = { ...QUICK_12, number: 13, date: '2026-12-22' };
      const [first, second] = await Promise.all([
        persistChallengeTriesLocked(QUICK_12, [tryOf(30), tryOf(34), tryOf(31)], storage),
        persistChallengeTriesLocked(day22, [tryOf(30), tryOf(34), tryOf(36)], storage),
      ]);
      expect(lockNames, 'both writes should acquire the shared history lock').toEqual([
        HISTORY_STORAGE_KEY,
        HISTORY_STORAGE_KEY,
      ]);
      expect(first.status).toBe('saved');
      expect(second.status).toBe('saved');
      const final = loadHistory(storage);
      expect(Object.keys(final.results).sort()).toEqual(['2026-12-21', '2026-12-22']);
      expect(currentStreak(final, '2026-12-22')).toBe(2);
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: originalLocks });
    }
  });
});
