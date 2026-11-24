import { MAX_TRIES, reachesGoal } from './playMachine';
import type { Puzzle, Template } from './puzzle';
import {
  isFiniteNumber,
  isPlainObject,
  isSavedTry,
  isValidTryForPuzzle,
  TEMPLATES,
  type SavedTry,
} from './historyValidation';

export type { SavedTry } from './historyValidation';

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

const DAY_MS = 86_400_000;

const emptyHistory = (): DailyHistory => ({ version: HISTORY_VERSION, results: {} });

/** A real calendar day written as YYYY-MM-DD. */
export function isIsoDate(date: string | undefined): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  parsed.setUTCFullYear(year);
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const dayNumber = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const time = new Date(Date.UTC(year, month - 1, day));
  time.setUTCFullYear(year);
  return Math.round(time.getTime() / DAY_MS);
};

const previousIsoDate = (date: string) => {
  const time = new Date(dayNumber(date) * DAY_MS - DAY_MS);
  const year = String(time.getUTCFullYear()).padStart(4, '0');
  const month = String(time.getUTCMonth() + 1).padStart(2, '0');
  const day = String(time.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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

/** Saves `history`, quietly giving up when storage is full or blocked. */
export function saveHistory(history: DailyHistory, storage?: StorageLike | null): void {
  const store = storage === undefined ? defaultStorage() : storage;
  if (!store) return;
  try {
    store.setItem(HISTORY_STORAGE_KEY, JSON.stringify(history));
  } catch {
    /** Storage is full or blocked; the result just isn't kept. */
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

/** Merges `tries` for `puzzle` into the latest stored history without losing other days or newer same-day tries. */
export function persistPuzzleTries(
  puzzle: Puzzle,
  tries: SavedTry[],
  storage?: StorageLike | null
): DailyHistory {
  const latest = loadHistory(storage);
  if (!isIsoDate(puzzle.date)) return latest;
  const existingTries = savedTriesForPuzzle(latest, puzzle);
  if (existingTries.length > tries.length) return latest;
  const next = recordPuzzleTries(latest, puzzle, tries);
  saveHistory(next, storage);
  return next;
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
