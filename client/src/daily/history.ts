import { MAX_TRIES, PlayInput, reachesGoal, TryScore } from './playMachine';
import type { Puzzle, Template } from './puzzle';

/** Bumped when the saved format changes, so older saves are dropped instead of misread. */
export const HISTORY_VERSION = 1 as const;

export const HISTORY_STORAGE_KEY = 'structs.daily.history';

/** One finished try: what the player ran and what it scored. */
export type SavedTry = { input: PlayInput; score: TryScore };

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

const TEMPLATES: readonly Template[] = [
  'quicksort-most-comparisons',
  'bubble-exact-passes',
  'insertion-beats-merge',
  'avl-most-rotations',
  'bst-forced-order',
  'upset-bst-beats-avl',
  'linked-list-index-drift',
];

const DAY_MS = 86_400_000;

const emptyHistory = (): DailyHistory => ({ version: HISTORY_VERSION, results: {} });

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

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

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isTryScore = (value: unknown): value is TryScore =>
  isFiniteNumber(value) ||
  (isPlainObject(value) && value.kind === 'unsolved' && typeof value.reason === 'string');

const isOperation = (value: unknown) =>
  isPlainObject(value) &&
  ((value.kind === 'insert' && Number.isInteger(value.index) && isFiniteNumber(value.value)) ||
    (value.kind === 'delete' && Number.isInteger(value.index)));

const isPlayInput = (value: unknown): value is PlayInput =>
  isPlainObject(value) &&
  ((value.kind === 'arrangement' &&
    Array.isArray(value.arrangement) &&
    value.arrangement.every(isFiniteNumber)) ||
    (value.kind === 'operations' &&
      Array.isArray(value.operations) &&
      value.operations.every(isOperation)));

const isSavedTry = (value: unknown): value is SavedTry =>
  isPlainObject(value) && isPlayInput(value.input) && isTryScore(value.score);

const isSavedResult = (value: unknown): value is SavedPuzzleResult =>
  isPlainObject(value) &&
  typeof value.date === 'string' &&
  isIsoDate(value.date) &&
  isFiniteNumber(value.number) &&
  TEMPLATES.includes(value.template as Template) &&
  isFiniteNumber(value.par) &&
  Array.isArray(value.tries) &&
  value.tries.every(isSavedTry) &&
  typeof value.completed === 'boolean' &&
  (value.bestScore === null || isFiniteNumber(value.bestScore)) &&
  typeof value.goalReached === 'boolean';

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
  Object.entries(parsed.results).forEach(([key, entry]) => {
    if (isSavedResult(entry)) results[key] = entry;
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

/** A copy of `history` with the puzzle's day set to `tries`. */
export function recordPuzzleTries(
  history: DailyHistory,
  puzzle: Puzzle,
  tries: SavedTry[]
): DailyHistory {
  if (!isIsoDate(puzzle.date)) return history;
  const solved = tries.map(({ score }) => score).filter(isFiniteNumber);
  const lowerWins = puzzle.template === 'linked-list-index-drift';
  const bestScore =
    solved.length === 0 ? null : lowerWins ? Math.min(...solved) : Math.max(...solved);
  return {
    version: HISTORY_VERSION,
    results: {
      ...history.results,
      [puzzle.date]: {
        date: puzzle.date,
        number: puzzle.number,
        template: puzzle.template,
        par: puzzle.par,
        tries: [...tries],
        completed: tries.length >= MAX_TRIES,
        bestScore,
        goalReached: bestScore !== null && reachesGoal(puzzle, bestScore),
      },
    },
  };
}

const completedDays = (history: DailyHistory) =>
  new Set(
    Object.values(history.results)
      .filter((entry) => entry.completed && isIsoDate(entry.date))
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
