import type { PlayInput, TryScore } from './playMachine';
import type { Puzzle, Template } from './puzzle';

/** One finished try: what the player ran and what it scored. */
export type SavedTry = { input: PlayInput; score: TryScore };

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
  puzzle: Exclude<Puzzle, { template: 'linked-list-index-drift' }>,
  arrangement: number[]
): boolean => {
  if (arrangement.length !== puzzle.values.length) return false;
  if (!puzzle.fixed.every((slot) => arrangement[slot] === puzzle.values[slot])) return false;
  const expected = [...puzzle.values].sort((a, b) => a - b);
  const actual = [...arrangement].sort((a, b) => a - b);
  return expected.every((value, i) => value === actual[i]);
};

/** Whether a saved try's input is legal for `puzzle` (matching fixed slots, multiplicity, and list bounds). */
export const isValidTryForPuzzle = (puzzle: Puzzle, saved: SavedTry): boolean => {
  if (puzzle.template === 'linked-list-index-drift') {
    return (
      saved.input.kind === 'operations' &&
      isValidOperationsForLength(puzzle.start.length, saved.input.operations)
    );
  }
  return (
    saved.input.kind === 'arrangement' &&
    isValidArrangementForPuzzle(puzzle, saved.input.arrangement)
  );
};
