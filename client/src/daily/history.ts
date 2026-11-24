import { MAX_TRIES, reachesGoal } from './playMachine';
import type { Challenge, Template } from './challenge';
import {
  dayNumber,
  extendsExisting,
  isFiniteNumber,
  isIsoDate,
  isPlainObject,
  isSavedTry,
  isValidTryForChallenge,
  previousIsoDate,
  sameTries,
  TEMPLATES,
  type SavedTry,
} from './historyValidation';

export { extendsExisting, isIsoDate, sameTries, type SavedTry } from './historyValidation';

/** Bumped when the saved format changes, so older saves are dropped instead of misread. */
export const HISTORY_VERSION = 1 as const;

export const HISTORY_STORAGE_KEY = 'daily.history';

/** Storage key used before the rename; read as a fallback so existing players keep their streaks. */
export const LEGACY_HISTORY_STORAGE_KEY = 'structs.daily.history';

/** Everything saved about one day's challenge. */
// eslint-disable-next-line structs/one-stage-value -- completed (all tries used) and goalReached (best score hits goal) are independent facts, not stages
export type SavedChallengeResult = {
  date: string;
  number: number;
  template: Template;
  goal: number;
  tries: SavedTry[];
  completed: boolean;
  bestScore: number | null;
  goalReached: boolean;
};

export type DailyHistory = {
  version: typeof HISTORY_VERSION;
  results: Record<string, SavedChallengeResult>;
};

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Outcome of trying to persist a challenge's tries into storage. */
export type PersistOutcome =
  | { status: 'saved'; history: DailyHistory; tries: SavedTry[] }
  | { status: 'synced'; history: DailyHistory; tries: SavedTry[] }
  | { status: 'failed'; history: DailyHistory; tries: SavedTry[] };

const emptyHistory = (): DailyHistory => ({ version: HISTORY_VERSION, results: {} });

const defaultStorage = (): StorageLike | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

const summarizeResult = (
  challenge: { date: string; number: number; template: Template; goal: number },
  tries: SavedTry[]
): SavedChallengeResult => {
  const capped = tries.slice(0, MAX_TRIES);
  const solved = capped.map(({ score }) => score).filter(isFiniteNumber);
  const lowerWins = challenge.template === 'linked-list-index-drift';
  const bestScore =
    solved.length === 0 ? null : lowerWins ? Math.min(...solved) : Math.max(...solved);
  return {
    date: challenge.date,
    number: challenge.number,
    template: challenge.template,
    goal: challenge.goal,
    tries: capped,
    completed: capped.length >= MAX_TRIES,
    bestScore,
    goalReached: bestScore !== null && reachesGoal(challenge, bestScore),
  };
};

const parseSavedResult = (value: unknown): SavedChallengeResult | null => {
  if (!isPlainObject(value)) return null;
  const goal = isFiniteNumber(value.goal)
    ? value.goal
    : isFiniteNumber(value.par)
      ? value.par
      : null;
  if (
    typeof value.date !== 'string' ||
    !isIsoDate(value.date) ||
    !isFiniteNumber(value.number) ||
    !TEMPLATES.includes(value.template as Template) ||
    goal === null ||
    !Array.isArray(value.tries) ||
    value.tries.length > MAX_TRIES ||
    !value.tries.every(isSavedTry)
  ) {
    return null;
  }
  const template = value.template as Template;
  const expectedKind = template === 'linked-list-index-drift' ? 'operations' : 'arrangement';
  if (!value.tries.every((saved) => saved.input.kind === expectedKind)) return null;
  return summarizeResult({ date: value.date, number: value.number, template, goal }, value.tries);
};

const readStoredEntries = (store: StorageLike, key: string): SavedChallengeResult[] => {
  let parsed: unknown;
  try {
    const raw = store.getItem(key);
    if (raw === null) return [];
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (
    !isPlainObject(parsed) ||
    parsed.version !== HISTORY_VERSION ||
    !isPlainObject(parsed.results)
  )
    return [];
  return Object.values(parsed.results)
    .map(parseSavedResult)
    .filter((result): result is SavedChallengeResult => result !== null);
};

/** The saved history, or an empty one when nothing valid is saved. Malformed days are skipped; legacy saves are merged. */
export function loadHistory(storage?: StorageLike | null): DailyHistory {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return emptyHistory();
  const results: Record<string, SavedChallengeResult> = {};
  [LEGACY_HISTORY_STORAGE_KEY, HISTORY_STORAGE_KEY]
    .flatMap((key) => readStoredEntries(store, key))
    .forEach((result) => {
      const existing = results[result.date];
      if (!existing || result.tries.length >= existing.tries.length) results[result.date] = result;
    });
  return { version: HISTORY_VERSION, results };
}

/** Saves `history`, returning false when storage is unavailable, full, or blocked. */
export function saveHistory(history: DailyHistory, storage?: StorageLike | null): boolean {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return false;
  try {
    store.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
    return true;
  } catch {
    return false;
  }
}

/** Validated saved tries matching `challenge`'s date, identity, and input constraints. */
export function savedTriesForChallenge(history: DailyHistory, challenge: Challenge): SavedTry[] {
  if (!isIsoDate(challenge.date)) return [];
  const saved = Object.values(history.results).find((result) => result.date === challenge.date);
  if (
    !saved ||
    saved.number !== challenge.number ||
    saved.template !== challenge.template ||
    saved.goal !== challenge.goal ||
    saved.tries.length > MAX_TRIES ||
    !saved.tries.every((entry) => isValidTryForChallenge(challenge, entry))
  ) {
    return [];
  }
  return [...saved.tries];
}

/** A copy of `history` with the challenge's day set to `tries`. */
export function recordChallengeTries(
  history: DailyHistory,
  challenge: Challenge,
  tries: SavedTry[]
): DailyHistory {
  if (!isIsoDate(challenge.date)) return history;
  return {
    version: HISTORY_VERSION,
    results: {
      ...history.results,
      [challenge.date]: summarizeResult(
        {
          date: challenge.date,
          number: challenge.number,
          template: challenge.template,
          goal: challenge.goal,
        },
        tries
      ),
    },
  };
}

const persistChallengeTriesWithStatus = (
  challenge: Challenge,
  tries: SavedTry[],
  storage?: StorageLike | null
): PersistOutcome => {
  const latest = loadHistory(storage);
  if (!isIsoDate(challenge.date)) return { status: 'saved', history: latest, tries };
  const existingTries = savedTriesForChallenge(latest, challenge);
  if (existingTries.length > 0 && !extendsExisting(existingTries, tries)) {
    return {
      status: sameTries(existingTries, tries) ? 'saved' : 'synced',
      history: latest,
      tries: existingTries,
    };
  }
  const next = recordChallengeTries(latest, challenge, tries);
  if (!saveHistory(next, storage)) {
    return { status: 'failed', history: latest, tries: existingTries };
  }
  return { status: 'saved', history: next, tries: next.results[challenge.date]?.tries ?? tries };
};

/** Merges `tries` for `challenge` into the latest stored history without losing other days or overwriting divergent same-day progress. */
export function persistChallengeTries(
  challenge: Challenge,
  tries: SavedTry[],
  storage?: StorageLike | null
): DailyHistory {
  return persistChallengeTriesWithStatus(challenge, tries, storage).history;
}

/** Serializes cross-tab history writes with Web Locks when available and reports whether the write saved, reconciled, or failed. */
export async function persistChallengeTriesLocked(
  challenge: Challenge,
  tries: SavedTry[],
  storage?: StorageLike | null
): Promise<PersistOutcome> {
  const run = () => persistChallengeTriesWithStatus(challenge, tries, storage);
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  if (!locks?.request) return run();
  try {
    return await locks.request(HISTORY_STORAGE_KEY, run);
  } catch {
    return run();
  }
}

const completedDays = (history: DailyHistory) =>
  new Set(
    Object.values(history.results)
      .filter(
        (entry) => entry.completed && entry.tries.length >= MAX_TRIES && isIsoDate(entry.date)
      )
      .map((entry) => dayNumber(entry.date))
  );

const runEndingAt = (days: Set<number>, last: number) => {
  let length = 0;
  while (days.has(last - length)) length += 1;
  return length;
};

/** Days in a row finished up to today, or up to yesterday while today is still open. */
export function currentStreak(history: DailyHistory, todayDate: string | undefined): number {
  if (!isIsoDate(todayDate)) return 0;
  const days = completedDays(history);
  const today = dayNumber(todayDate);
  if (days.has(today)) return runEndingAt(days, today);
  const yesterday = dayNumber(previousIsoDate(todayDate));
  return days.has(yesterday) ? runEndingAt(days, yesterday) : 0;
}

/** Streak for `challenge`'s date, ignoring today's stored entry if it fails validation for `challenge`. */
export function streakForChallenge(history: DailyHistory, challenge: Challenge): number {
  if (!isIsoDate(challenge.date)) return 0;
  const hasEntryForToday = Object.values(history.results).some(
    (entry) => entry.date === challenge.date
  );
  if (!hasEntryForToday || savedTriesForChallenge(history, challenge).length > 0) {
    return currentStreak(history, challenge.date);
  }
  const filtered: Record<string, SavedChallengeResult> = {};
  Object.entries(history.results).forEach(([key, entry]) => {
    if (entry.date !== challenge.date) filtered[key] = entry;
  });
  return currentStreak({ version: HISTORY_VERSION, results: filtered }, challenge.date);
}

/** The most days in a row ever finished. */
export function longestStreak(history: DailyHistory): number {
  const days = completedDays(history);
  let longest = 0;
  days.forEach((day) => {
    if (days.has(day + 1)) return;
    longest = Math.max(longest, runEndingAt(days, day));
  });
  return longest;
}
