import { useEffect, useState } from 'react';

export const PUZZLE_URL = '/puzzles/today.json';

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

export type Puzzle = QuicksortPuzzle | BubblePuzzle | InsertionMergePuzzle;

export type Template = Puzzle['template'];

const TITLES: Record<Template, string> = {
  'quicksort-most-comparisons': 'Quicksort',
  'bubble-exact-passes': 'Bubble sort',
  'insertion-beats-merge': 'Insertion beats merge',
};

const isTemplate = (template: unknown): template is Template =>
  typeof template === 'string' && Object.hasOwn(TITLES, template);

const isNumbers = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => Number.isFinite(item));

const formatError = () => new Error('The puzzle file is not in the expected format.');

const parseBase = (data: unknown): PuzzleBase => {
  const puzzle = data as Partial<PuzzleBase> | null;
  const length = Array.isArray(puzzle?.values) ? puzzle.values.length : 0;
  if (
    !puzzle ||
    !Number.isFinite(puzzle.number) ||
    !isNumbers(puzzle.values) ||
    puzzle.values.length === 0 ||
    !isNumbers(puzzle.fixed) ||
    !puzzle.fixed.every((index) => Number.isInteger(index) && index >= 0 && index < length) ||
    !Number.isFinite(puzzle.par)
  ) {
    throw formatError();
  }
  const { date } = puzzle as { date?: unknown };
  if (date !== undefined && (typeof date !== 'string' || date.trim() === '')) {
    throw new Error('The puzzle date is not in the expected format.');
  }
  const { number, values, fixed, par } = puzzle as PuzzleBase;
  return date === undefined
    ? { number, values, fixed, par }
    : { number, values, fixed, par, date: date.trim() };
};

const MAX_U32 = 0xffffffff;

export const parsePuzzle = (data: unknown): Puzzle => {
  const { template, targetPasses } = (data ?? {}) as { template?: unknown; targetPasses?: unknown };
  if (!isTemplate(template)) throw formatError();
  const base = parseBase(data);
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

/** One line per try: its score, marked ⭐ at the goal, or ✗ when unsolved. Never the arrangement. */
export const shareText = (
  puzzle: Pick<Puzzle, 'number' | 'template' | 'par'>,
  scores: SharedScore[]
) =>
  [
    `structs.sh daily #${puzzle.number} · ${puzzleTitle(puzzle.template)} · Goal ${puzzle.par}`,
    ...scores.map((score) => {
      if (score === null) return '✗';
      return `${score}${score >= puzzle.par ? ' ⭐' : ''}`;
    }),
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
  | { status: 'error' }
  | { status: 'ready'; puzzle: Puzzle };

export const usePuzzle = (): PuzzleState => {
  const [state, setState] = useState<PuzzleState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch(PUZZLE_URL, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`Fetching the puzzle failed: ${response.status}`);
        return response.json();
      })
      .then((data) => setState({ status: 'ready', puzzle: parsePuzzle(data) }))
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.error(error);
          setState({ status: 'error' });
        }
      });
    return () => controller.abort();
  }, []);

  return state;
};
