import { MAX_TRIES, type PlayInput, type TryScore } from './playMachine';
import type { Challenge, Template } from './challenge';

/** One finished try: what the player ran and what it scored. */
export type SavedTry = { input: PlayInput; score: TryScore };

const DAY_MS = 86_400_000;

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

export const dayNumber = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  const time = new Date(Date.UTC(year, month - 1, day));
  time.setUTCFullYear(year);
  return Math.round(time.getTime() / DAY_MS);
};

export const previousIsoDate = (date: string) => {
  const time = new Date(dayNumber(date) * DAY_MS - DAY_MS);
  const year = String(time.getUTCFullYear()).padStart(4, '0');
  const month = String(time.getUTCMonth() + 1).padStart(2, '0');
  const day = String(time.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const sameTry = (a: SavedTry, b: SavedTry) => JSON.stringify(a) === JSON.stringify(b);

/** Whether two try sequences contain the exact same inputs and scores in order. */
export const sameTries = (a: SavedTry[], b: SavedTry[]) =>
  a.length === b.length && a.every((saved, i) => sameTry(saved, b[i]));

export const extendsExisting = (existing: SavedTry[], next: SavedTry[]) =>
  existing.length < MAX_TRIES &&
  next.length <= MAX_TRIES &&
  next.length > existing.length &&
  existing.every((saved, i) => sameTry(saved, next[i]));

export const TEMPLATES: readonly Template[] = [
  'quicksort-most-comparisons',
  'bubble-exact-passes',
  'insertion-beats-merge',
  'avl-most-rotations',
  'bst-forced-order',
  'upset-bst-beats-avl',
  'linked-list-index-drift',
];

const MIN_I32 = -0x80000000;
const MAX_I32 = 0x7fffffff;

export const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isI32 = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_I32 && value <= MAX_I32;

const isTryScore = (value: unknown): value is TryScore =>
  isFiniteNumber(value) ||
  (isPlainObject(value) && value.kind === 'unsolved' && typeof value.reason === 'string');

const isOperation = (value: unknown) =>
  isPlainObject(value) &&
  ((value.kind === 'insert' &&
    typeof value.index === 'number' &&
    Number.isInteger(value.index) &&
    value.index >= 0 &&
    value.index <= MAX_I32 &&
    isI32(value.value)) ||
    (value.kind === 'delete' &&
      typeof value.index === 'number' &&
      Number.isInteger(value.index) &&
      value.index >= 0 &&
      value.index <= MAX_I32));

const isPlayInput = (value: unknown): value is PlayInput =>
  isPlainObject(value) &&
  ((value.kind === 'arrangement' &&
    Array.isArray(value.arrangement) &&
    value.arrangement.every(isI32)) ||
    (value.kind === 'operations' &&
      Array.isArray(value.operations) &&
      value.operations.every(isOperation)));

export const isSavedTry = (value: unknown): value is SavedTry =>
  isPlainObject(value) && isPlayInput(value.input) && isTryScore(value.score);

const isValidOperationsForLength = (
  startLength: number,
  operations: Extract<PlayInput, { kind: 'operations' }>['operations']
): boolean => {
  if (operations.length === 0) return false;
  let length = startLength;
  for (let i = 0; i < operations.length; i += 1) {
    const op = operations[i];
    if (op.kind === 'insert') {
      length += 1;
    } else {
      if (op.index < 0 || op.index >= length) return false;
      length -= 1;
    }
  }
  return true;
};

const isValidArrangementForPuzzle = (
  challenge: Exclude<Challenge, { template: 'linked-list-index-drift' }>,
  arrangement: number[]
): boolean => {
  if (arrangement.length !== challenge.values.length) return false;
  if (!challenge.fixed.every((slot) => arrangement[slot] === challenge.values[slot])) return false;
  const expected = [...challenge.values].sort((a, b) => a - b);
  const actual = [...arrangement].sort((a, b) => a - b);
  return expected.every((value, i) => value === actual[i]);
};

/** Whether a saved try's input is legal for `challenge` (matching fixed slots, multiplicity, and list bounds). */
export const isValidTryForChallenge = (challenge: Challenge, saved: SavedTry): boolean => {
  if (challenge.template === 'linked-list-index-drift') {
    return (
      saved.input.kind === 'operations' &&
      isValidOperationsForLength(challenge.start.length, saved.input.operations)
    );
  }
  return (
    saved.input.kind === 'arrangement' &&
    isValidArrangementForPuzzle(challenge, saved.input.arrangement)
  );
};
