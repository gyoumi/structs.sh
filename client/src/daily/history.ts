import { MAX_TRIES, reachesGoal } from './playMachine';
import type { Puzzle, Template } from './puzzle';
import {
  dayNumber,
  extendsExisting,
  isFiniteNumber,
  isIsoDate,
  isPlainObject,
  isSavedTry,
  isValidTryForPuzzle,
  previousIsoDate,
  sameTries,
  TEMPLATES,
  type SavedTry,
} from './historyValidation';

export { isIsoDate, sameTries, type SavedTry } from './historyValidation';

/** Bumped when the saved format changes, so older saves are dropped instead of misread. */
export const HISTORY_VERSION = 1 as const;

export const HISTORY_STORAGE_KEY = 'structs.daily.history';

/** Everything saved about one day's puzzle. */
// eslint-disable-next-line structs/one-stage-value -- completed (all tries used) and goalReached (best score hits par) are independent facts, not stages
export type SavedPuzzleResult = {
  date: string;
  number: number;
  template: Template;
  par: number;
  tries: SavedTry[];
  completed: boolean;
  bestScore: number | null;
  goalReached: boolean;
};

export type DailyHistory = {
  version: typeof HISTORY_VERSION;
  results: Record<string, SavedPuzzleResult>;
};

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** Outcome of trying to persist a puzzle's tries into storage. */
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
  puzzle: { date: string; number: number; template: Template; par: number },
  tries: SavedTry[]
): SavedPuzzleResult => {
  const capped = tries.slice(0, MAX_TRIES);
  const solved = capped.map(({ score }) => score).filter(isFiniteNumber);
  const lowerWins = puzzle.template === 'linked-list-index-drift';
  const bestScore =
    solved.length === 0 ? null : lowerWins ? Math.min(...solved) : Math.max(...solved);
  return {
    date: puzzle.date,
    number: puzzle.number,
    template: puzzle.template,
    par: puzzle.par,
    tries: capped,
    completed: capped.length >= MAX_TRIES,
    bestScore,
    goalReached: bestScore !== null && reachesGoal(puzzle, bestScore),
  };
};

const parseSavedResult = (value: unknown): SavedPuzzleResult | null => {
  if (
    !isPlainObject(value) ||
    typeof value.date !== 'string' ||
    !isIsoDate(value.date) ||
    !isFiniteNumber(value.number) ||
    !TEMPLATES.includes(value.template as Template) ||
    !isFiniteNumber(value.par) ||
    !Array.isArray(value.tries) ||
    value.tries.length > MAX_TRIES ||
    !value.tries.every(isSavedTry)
  ) {
    return null;
  }
  const template = value.template as Template;
  const expectedKind = template === 'linked-list-index-drift' ? 'operations' : 'arrangement';
  if (!value.tries.every((saved) => saved.input.kind === expectedKind)) return null;
  return summarizeResult(
    { date: value.date, number: value.number, template, par: value.par },
    value.tries
  );
};

/** The saved history, or an empty one when nothing valid is saved. Malformed days are skipped. */
export function loadHistory(storage?: StorageLike | null): DailyHistory {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return emptyHistory();
  let parsed: unknown;
  try {
    const raw = store.getItem(HISTORY_STORAGE_KEY);
    if (raw === null) return emptyHistory();
    parsed = JSON.parse(raw);
  } catch {
    return emptyHistory();
  }
  if (!isPlainObject(parsed) || parsed.version !== HISTORY_VERSION) return emptyHistory();
  if (!isPlainObject(parsed.results)) return emptyHistory();
  const results: Record<string, SavedPuzzleResult> = {};
  Object.values(parsed.results).forEach((entry) => {
    const result = parseSavedResult(entry);
    if (!result) return;
    const existing = results[result.date];
    if (!existing || result.tries.length >= existing.tries.length) {
      results[result.date] = result;
    }
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

/** Validated saved tries matching `puzzle`'s date, identity, and input constraints. */
export function savedTriesForPuzzle(history: DailyHistory, puzzle: Puzzle): SavedTry[] {
  if (!isIsoDate(puzzle.date)) return [];
  const saved = Object.values(history.results).find((result) => result.date === puzzle.date);
  if (
    !saved ||
    saved.number !== puzzle.number ||
    saved.template !== puzzle.template ||
    saved.par !== puzzle.par ||
    saved.tries.length > MAX_TRIES ||
    !saved.tries.every((entry) => isValidTryForPuzzle(puzzle, entry))
  ) {
    return [];
  }
  return [...saved.tries];
}

/** A copy of `history` with the puzzle's day set to `tries`. */
export function recordPuzzleTries(
  history: DailyHistory,
  puzzle: Puzzle,
  tries: SavedTry[]
): DailyHistory {
  if (!isIsoDate(puzzle.date)) return history;
  return {
    version: HISTORY_VERSION,
    results: {
      ...history.results,
      [puzzle.date]: summarizeResult(
        { date: puzzle.date, number: puzzle.number, template: puzzle.template, par: puzzle.par },
        tries
      ),
    },
  };
}

const persistPuzzleTriesWithStatus = (
  puzzle: Puzzle,
  tries: SavedTry[],
  storage?: StorageLike | null
): PersistOutcome => {
  const latest = loadHistory(storage);
  if (!isIsoDate(puzzle.date)) return { status: 'saved', history: latest, tries };
  const existingTries = savedTriesForPuzzle(latest, puzzle);
  if (existingTries.length > 0 && !extendsExisting(existingTries, tries)) {
    return {
      status: sameTries(existingTries, tries) ? 'saved' : 'synced',
      history: latest,
      tries: existingTries,
    };
  }
  const next = recordPuzzleTries(latest, puzzle, tries);
  if (!saveHistory(next, storage)) {
    return { status: 'failed', history: latest, tries: existingTries };
  }
  return { status: 'saved', history: next, tries: next.results[puzzle.date]?.tries ?? tries };
};

/** Merges `tries` for `puzzle` into the latest stored history without losing other days or overwriting divergent same-day progress. */
export function persistPuzzleTries(
  puzzle: Puzzle,
  tries: SavedTry[],
  storage?: StorageLike | null
): DailyHistory {
  return persistPuzzleTriesWithStatus(puzzle, tries, storage).history;
}

/** Serializes cross-tab history writes with Web Locks when available and reports whether the write saved, reconciled, or failed. */
export async function persistPuzzleTriesLocked(
  puzzle: Puzzle,
  tries: SavedTry[],
  storage?: StorageLike | null
): Promise<PersistOutcome> {
  const run = () => persistPuzzleTriesWithStatus(puzzle, tries, storage);
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

/** Streak for `puzzle`'s date, ignoring today's stored entry if it fails validation for `puzzle`. */
export function streakForPuzzle(history: DailyHistory, puzzle: Puzzle): number {
  if (!isIsoDate(puzzle.date)) return 0;
  const hasEntryForToday = Object.values(history.results).some(
    (entry) => entry.date === puzzle.date
  );
  if (!hasEntryForToday || savedTriesForPuzzle(history, puzzle).length > 0) {
    return currentStreak(history, puzzle.date);
  }
  const filtered: Record<string, SavedPuzzleResult> = {};
  Object.entries(history.results).forEach(([key, entry]) => {
    if (entry.date !== puzzle.date) filtered[key] = entry;
  });
  return currentStreak({ version: HISTORY_VERSION, results: filtered }, puzzle.date);
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
