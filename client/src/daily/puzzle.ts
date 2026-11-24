import { useEffect, useState } from 'react';
import type { DailyPuzzle } from '@/game/api';
import { reachesGoal } from './playMachine';

export const PUZZLE_URL = '/api/daily';

type PuzzleBase = {
  number: number;
  values: number[];
  fixed: number[];
  par: number;
  /** The day the puzzle is for, as written in the file. */
  date?: string;
};

export type QuicksortPuzzle = PuzzleBase & { template: 'quicksort-most-comparisons' };

export type BubblePuzzle = PuzzleBase & { template: 'bubble-exact-passes'; targetPasses: number };

export type InsertionMergePuzzle = PuzzleBase & { template: 'insertion-beats-merge' };

export type AvlRotationsPuzzle = PuzzleBase & { template: 'avl-most-rotations' };

/** No slot is locked, so `fixed` is always empty; the file leaves it out. */
export type ForcedOrderPuzzle = PuzzleBase & {
  template: 'bst-forced-order';
  fixed: [];
  /** The preorder of the tree the insert order has to build. */
  targetTree: number[];
};

export type UpsetPuzzle = PuzzleBase & { template: 'upset-bst-beats-avl' };

/** Turn `start` into `target` with inserts and deletes by index, at the lowest cost. It has no values to arrange. */
export type IndexDriftPuzzle = {
  number: number;
  template: 'linked-list-index-drift';
  start: number[];
  target: number[];
  par: number;
  date?: string;
  values?: never;
  fixed?: never;
};

export type Puzzle =
  | QuicksortPuzzle
  | BubblePuzzle
  | InsertionMergePuzzle
  | AvlRotationsPuzzle
  | ForcedOrderPuzzle
  | UpsetPuzzle
  | IndexDriftPuzzle;

export type Template = Puzzle['template'];

const TITLES: Record<DailyPuzzle['template'], string> = {
  'quicksort-most-comparisons': 'Quicksort',
  'bubble-exact-passes': 'Bubble sort',
  'insertion-beats-merge': 'Insertion beats merge',
  'avl-most-rotations': 'AVL tree',
  'bst-forced-order': 'Forced order',
  'upset-bst-beats-avl': 'Upset',
  'linked-list-index-drift': 'Index drift',
};

const isTemplate = (template: unknown): template is Template =>
  typeof template === 'string' && Object.hasOwn(TITLES, template);

const MIN_I32 = -0x80000000;
const MAX_I32 = 0x7fffffff;

const isNumbers = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.every((item) => Number.isInteger(item) && item >= MIN_I32 && item <= MAX_I32);

const isEmptyList = (value: unknown) => Array.isArray(value) && value.length === 0;

const isValidBstPreorder = (keys: number[]): boolean => {
  const stack: number[] = [];
  let lower: number | null = null;
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i];
    if (lower !== null && key <= lower) return false;
    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      if (key === top) return false;
      if (key > top) {
        lower = stack.pop()!;
      } else {
        break;
      }
    }
    stack.push(key);
  }
  return true;
};

const isValidTargetTree = (values: number[], targetTree: number[]) => {
  if (!isValidBstPreorder(targetTree)) return false;
  const distinct = [...new Set(values)].sort((x, y) => x - y);
  const targetSorted = [...targetTree].sort((x, y) => x - y);
  return (
    distinct.length === targetSorted.length &&
    distinct.every((value, i) => value === targetSorted[i])
  );
};

const formatError = () => new Error('The puzzle file is not in the expected format.');

/** Whether the file must list fixed slots, or has none and may only leave `fixed` out or empty. */
type FixedRule = 'listed' | 'none';

const parseDate = (date: unknown): string | undefined => {
  if (date !== undefined && (typeof date !== 'string' || date.trim() === '')) {
    throw new Error('The puzzle date is not in the expected format.');
  }
  return date?.trim();
};

const parseBase = (data: unknown, rule: FixedRule): PuzzleBase => {
  const raw = data as Partial<PuzzleBase> | null;
  const puzzle =
    raw && rule === 'none' && (raw.fixed === undefined || isEmptyList(raw.fixed))
      ? { ...raw, fixed: [] }
      : raw;
  const length = Array.isArray(puzzle?.values) ? puzzle.values.length : 0;
  if (
    !puzzle ||
    !Number.isFinite(puzzle.number) ||
    !isNumbers(puzzle.values) ||
    puzzle.values.length === 0 ||
    !isNumbers(puzzle.fixed) ||
    (rule === 'none' && puzzle.fixed.length > 0) ||
    !puzzle.fixed.every((index) => Number.isInteger(index) && index >= 0 && index < length) ||
    !Number.isFinite(puzzle.par)
  ) {
    throw formatError();
  }
  const date = parseDate((puzzle as { date?: unknown }).date);
  const { number, values, fixed, par } = puzzle as PuzzleBase;
  return date === undefined ? { number, values, fixed, par } : { number, values, fixed, par, date };
};

const MAX_U32 = 0xffffffff;

const parseForcedOrder = (data: unknown): ForcedOrderPuzzle => {
  const base = parseBase(data, 'none');
  const { targetTree } = data as { targetTree?: unknown };
  if (!isNumbers(targetTree) || !isValidTargetTree(base.values, targetTree)) throw formatError();
  return { template: 'bst-forced-order', ...base, fixed: [], targetTree };
};

const parseIndexDrift = (data: object): IndexDriftPuzzle => {
  const { number, start, target, par } = data as Partial<Record<string, unknown>>;
  if (
    Object.hasOwn(data, 'values') ||
    Object.hasOwn(data, 'fixed') ||
    !Number.isFinite(number) ||
    !isNumbers(start) ||
    !isNumbers(target) ||
    !Number.isFinite(par)
  ) {
    throw formatError();
  }
  const date = parseDate((data as { date?: unknown }).date);
  const puzzle: IndexDriftPuzzle = {
    number: number as number,
    template: 'linked-list-index-drift',
    start,
    target,
    par: par as number,
  };
  return date === undefined ? puzzle : { ...puzzle, date };
};

export const parsePuzzle = (data: unknown): Puzzle => {
  const { template, targetPasses } = (data ?? {}) as { template?: unknown; targetPasses?: unknown };
  if (!isTemplate(template)) throw formatError();
  if (template === 'bst-forced-order') return parseForcedOrder(data);
  if (template === 'linked-list-index-drift') return parseIndexDrift(data as object);
  const base = parseBase(data, 'listed');
  if (template !== 'bubble-exact-passes') return { template, ...base };
  if (
    !Number.isInteger(targetPasses) ||
    (targetPasses as number) < 0 ||
    (targetPasses as number) > MAX_U32
  ) {
    throw formatError();
  }
  return { template, ...base, targetPasses: targetPasses as number };
};

/** "quicksort-most-comparisons" is shown as "Quicksort". */
export const puzzleTitle = (template: string) => {
  if (isTemplate(template)) return TITLES[template];
  const [first = ''] = template.split('-');
  return first.charAt(0).toUpperCase() + first.slice(1);
};

/** A try's score, or null when the try did not solve the puzzle. */
export type SharedScore = number | null;

/** One line per try: its score, marked ⭐ at the goal, or ✗ when unsolved, then the streak when there is one. Never the try's input. */
export const shareText = (
  puzzle: Pick<Puzzle, 'number' | 'template' | 'par'>,
  scores: SharedScore[],
  streak?: number
) =>
  [
    `structs.sh daily #${puzzle.number} · ${puzzleTitle(puzzle.template)} · Goal ${puzzle.par}`,
    ...scores.map((score) => {
      if (score === null) return '✗';
      return `${score}${reachesGoal(puzzle, score) ? ' ⭐' : ''}`;
    }),
    ...(streak !== undefined && streak > 0
      ? [`Streak: ${streak} ${streak === 1 ? 'day' : 'days'} 🔥`]
      : []),
    'structs.sh/daily',
  ].join('\n');

/** The slot to swap with: the nearest free one from `from` in `direction`, skipping fixed slots. */
export const nextFreeSlot = (
  fixed: Set<number>,
  length: number,
  from: number,
  direction: 1 | -1
) => {
  for (let slot = from + direction; slot >= 0 && slot < length; slot += direction) {
    if (!fixed.has(slot)) return slot;
  }
  return null;
};

export type PuzzleState =
  | { status: 'loading' }
  | { status: 'unreachable' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; puzzle: Puzzle };

/** What a failed response means: no puzzle for today yet, a server that is down, or anything else. */
const failedStatus = (status: number): PuzzleState => {
  if (status === 404) return { status: 'unavailable' };
  if (status >= 500) return { status: 'unreachable' };
  return { status: 'error' };
};

/** Today's puzzle from the server, and `retry` to ask again after a failure. */
export const usePuzzle = (): { state: PuzzleState; retry: () => void } => {
  const [state, setState] = useState<PuzzleState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const settle = (next: PuzzleState) => {
      if (!controller.signal.aborted) setState(next);
    };
    fetch(PUZZLE_URL, { signal: controller.signal })
      .then(
        async (response) => {
          if (!response.ok) {
            settle(failedStatus(response.status));
            return;
          }
          try {
            settle({ status: 'ready', puzzle: parsePuzzle(await response.json()) });
          } catch (error) {
            console.error(error);
            settle({ status: 'error' });
          }
        },
        (error) => {
          if (controller.signal.aborted) return;
          console.error(error);
          settle({ status: 'unreachable' });
        }
      )
      .catch(() => {});
    return () => controller.abort();
  }, [attempt]);

  const retry = () => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  };

  return { state, retry };
};
