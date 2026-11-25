import { describe, expect, it } from 'vitest';
import {
  HISTORY_STORAGE_KEY,
  HISTORY_VERSION,
  currentStreak,
  loadHistory,
  persistChallengeTriesLocked,
  recordChallengeTries,
  savedTriesForChallenge,
  streakForChallenge,
  type DailyHistory,
  type SavedTry,
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
    const day21 = loaded.results['2026-12-21'];
    const call =
      'loadHistory(2026-12-21 saved with 0 tries but completed: true, bestScore 99; 2026-12-22 saved with 4 tries)';
    expect(
      day21?.completed,
      `${call}: 2026-12-21 has no tries, so completed must be false, got ${JSON.stringify(day21)}`
    ).toBe(false);
    expect(
      day21?.bestScore,
      `${call}: 2026-12-21 has no tries, so bestScore must be null, got ${JSON.stringify(day21)}`
    ).toBe(null);
    const streak = currentStreak(loaded, '2026-12-21');
    expect(
      streak,
      `${call}: currentStreak on 2026-12-21 must be 0 (no finished day), got ${streak}`
    ).toBe(0);
    expect(
      loaded.results['2026-12-22'],
      `${call}: 2026-12-22 has 4 tries (more than MAX_TRIES 3), so it must be dropped, got ${JSON.stringify(loaded.results['2026-12-22'])}`
    ).toBe(undefined);
  });

  it.each([
    {
      label: 'locked slot 1 no longer holds 1 (8 and 1 swapped)',
      challenge: QUICK_12,
      saved: QUICK_12,
      input: arrangement([1, 8, 6, 3, 2, 7, 4, 5]),
    },
    {
      label: 'the values do not match (8 twice, 6 missing)',
      challenge: QUICK_12,
      saved: QUICK_12,
      input: arrangement([8, 1, 8, 3, 2, 7, 4, 5]),
    },
    {
      label: 'the saved day was for challenge #12 but the fetched one is #99',
      challenge: { ...QUICK_12, number: 99 },
      saved: QUICK_12,
      input: arrangement([8, 1, 6, 3, 2, 7, 4, 5]),
    },
    {
      label: 'delete(9) is out of range for the 4-node start list',
      challenge: DRIFT_26,
      saved: DRIFT_26,
      input: { kind: 'operations', operations: [{ kind: 'delete', index: 9 }] } satisfies PlayInput,
    },
  ])('does not restore a saved try when $label', ({ label, challenge, saved, input }) => {
    const history = recordChallengeTries(emptyHistory(), saved, [tryOf(30, input)]);
    const restored = savedTriesForChallenge(history, challenge);
    expect(
      restored,
      `savedTriesForChallenge(#${saved.number} saved with input ${JSON.stringify(input)}, fetched #${challenge.number}) [${label}]: expected no tries restored, got ${JSON.stringify(restored)}`
    ).toEqual([]);
  });

  it('restores a saved DRIFT_26 try whose operations are valid', () => {
    const valid = recordChallengeTries(emptyHistory(), DRIFT_26, [tryOf(5, OPERATIONS)]);
    const restored = savedTriesForChallenge(valid, DRIFT_26);
    expect(
      restored,
      `savedTriesForChallenge(DRIFT_26 saved with ${JSON.stringify(OPERATIONS)}): expected the one try back, got ${JSON.stringify(restored)}`
    ).toHaveLength(1);
  });

  it('merges into fresh storage without erasing another tab or regressing same-day tries', async () => {
    const { storage } = memoryStorage();
    const persist = async (challenge: Challenge, tries: SavedTry[]) =>
      (await persistChallengeTriesLocked(challenge, tries, storage)).history;
    const scores = (tries: SavedTry[] | undefined) => JSON.stringify(tries?.map((t) => t.score));
    const day22 = { ...QUICK_12, number: 13, date: '2026-12-22' };
    await persist(day22, [tryOf(30), tryOf(34), tryOf(31)]);
    const afterStaleTab = await persist(QUICK_12, [tryOf(30)]);
    expect(
      afterStaleTab.results['2026-12-22']?.completed,
      `persist 2026-12-22 (3 tries), then 2026-12-21 (1 try): 2026-12-22 saved by another tab must stay completed, got ${JSON.stringify(afterStaleTab.results['2026-12-22'])}`
    ).toBe(true);
    const afterRegress = await persist(day22, [tryOf(30)]);
    expect(
      afterRegress.results['2026-12-22']?.tries.length,
      `persist 2026-12-22 again with 1 try after 3 were saved: the stale tab must not overwrite them, got scores ${scores(afterRegress.results['2026-12-22']?.tries)}`
    ).toBe(3);

    const day23 = { ...QUICK_12, number: 14, date: '2026-12-23' };
    const tabATry = tryOf(34, arrangement([8, 1, 5, 3, 2, 7, 4, 6]));
    const tabBTry = tryOf(30, arrangement([8, 1, 6, 3, 2, 7, 4, 5]));
    await persist(day23, [tabATry]);
    const afterEqualStale = await persist(day23, [tabBTry]);
    expect(
      afterEqualStale.results['2026-12-23']?.tries,
      `persist 2026-12-23 [tab A's try 34], then [tab B's try 30]: an equal-length divergent write must not erase tab A's try`
    ).toEqual([tabATry]);
    const afterDivergentLonger = await persist(day23, [tabBTry, tryOf(31)]);
    expect(
      afterDivergentLonger.results['2026-12-23']?.tries,
      `persist 2026-12-23 [tab B's try 30, 31] over [tab A's try 34]: a longer divergent write must not erase tab A's try`
    ).toEqual([tabATry]);

    const afterOverCap = await persist(day22, [tryOf(30), tryOf(34), tryOf(31), tryOf(36)]);
    expect(
      afterOverCap.results['2026-12-22']?.tries,
      `persist 2026-12-22 with 4 tries over a completed 3-try day: must keep the 3 saved tries, got scores ${scores(afterOverCap.results['2026-12-22']?.tries)}`
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
      'savedTriesForChallenge(2026-12-20 finished, 2026-12-21 saved with locked slot 1 moved; QUICK_12): the invalid tries for today must not restore'
    ).toEqual([]);
    expect(
      streakForChallenge(withInvalidToday, QUICK_12),
      'streakForChallenge(2026-12-20 finished, 2026-12-21 saved with locked slot 1 moved; QUICK_12): today is invalid, so expected 1 (yesterday only), not 2'
    ).toBe(1);

    const onlyInvalidToday = recordChallengeTries(emptyHistory(), QUICK_12, [
      tryOf(30, movedFixed),
      tryOf(34, movedFixed),
      tryOf(31, movedFixed),
    ]);
    expect(
      streakForChallenge(onlyInvalidToday, QUICK_12),
      'streakForChallenge(only 2026-12-21, saved with locked slot 1 moved; QUICK_12): expected 0'
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
    const call =
      'persistChallengeTriesLocked(QUICK_12, 3 tries, storage whose setItem throws) after 2 tries were saved';
    expect(
      outcome.status,
      `${call}: expected status 'failed', got ${JSON.stringify(outcome.status)}`
    ).toBe('failed');
    expect(
      outcome.tries,
      `${call}: must report only the 2 tries already saved, got scores ${JSON.stringify(outcome.tries.map((t) => t.score))}`
    ).toHaveLength(2);
    expect(
      outcome.history.results['2026-12-21']?.completed,
      `${call}: the 3rd try was not saved, so the returned history must not mark 2026-12-21 completed`
    ).toBe(false);
    expect(
      streakForChallenge(outcome.history, QUICK_12),
      `${call}: the 3rd try was not saved, so the streak must stay 0`
    ).toBe(0);
  });

  it('waits for navigator.locks before writing, and both days share one lock so neither is lost', async () => {
    const { items, storage } = memoryStorage();
    const originalLocks = navigator.locks;
    // A stand-in for Web Locks that holds every callback until the test grants it.
    const requests: { name: string; grant: () => Promise<unknown> }[] = [];
    Object.defineProperty(navigator, 'locks', {
      configurable: true,
      value: {
        request: <T>(name: string, callback: () => T | Promise<T>): Promise<T> =>
          new Promise<T>((resolve, reject) => {
            requests.push({
              name,
              grant: async () => {
                try {
                  resolve(await callback());
                } catch (error) {
                  reject(error);
                }
              },
            });
          }),
      },
    });
    try {
      const day22 = { ...QUICK_12, number: 13, date: '2026-12-22' };
      const call =
        'persistChallengeTriesLocked(2026-12-21, 3 tries) and persistChallengeTriesLocked(2026-12-22, 3 tries) started together';
      const firstWrite = persistChallengeTriesLocked(
        QUICK_12,
        [tryOf(30), tryOf(34), tryOf(31)],
        storage
      );
      const secondWrite = persistChallengeTriesLocked(
        day22,
        [tryOf(30), tryOf(34), tryOf(36)],
        storage
      );
      await Promise.resolve();

      expect(
        [...items.keys()],
        `${call}: before any lock is granted, neither write may reach storage (it must wait for navigator.locks.request), but storage already has keys ${JSON.stringify([...items.keys()])}`
      ).toEqual([]);
      const names = requests.map(({ name }) => name);
      expect(
        names.length,
        `${call}: each write should request a lock from navigator.locks, got requests for ${JSON.stringify(names)}`
      ).toBe(2);
      expect(
        names[1],
        `${call}: both writes must request the same lock so they run one after the other, got ${JSON.stringify(names)}`
      ).toBe(names[0]);

      await requests[0]?.grant();
      await requests[1]?.grant();
      const [first, second] = await Promise.all([firstWrite, secondWrite]);
      expect(
        first.status,
        `${call}, locks granted in order: the 2026-12-21 write should report 'saved', got ${JSON.stringify(first.status)}`
      ).toBe('saved');
      expect(
        second.status,
        `${call}, locks granted in order: the 2026-12-22 write should report 'saved', got ${JSON.stringify(second.status)}`
      ).toBe('saved');
      const final = loadHistory(storage);
      const days = Object.keys(final.results).sort();
      expect(
        days,
        `${call}, locks granted in order: loadHistory afterwards should hold both days, got ${JSON.stringify(days)}`
      ).toEqual(['2026-12-21', '2026-12-22']);
      const streak = currentStreak(final, '2026-12-22');
      expect(
        streak,
        `${call}, locks granted in order: both days are finished, so currentStreak on 2026-12-22 should be 2, got ${streak}`
      ).toBe(2);
    } finally {
      Object.defineProperty(navigator, 'locks', { configurable: true, value: originalLocks });
    }
  });
});
