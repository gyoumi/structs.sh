import { useEffect, useState } from 'react';

export const PUZZLE_URL = '/puzzles/today.json';

export type Puzzle = {
  number: number;
  template: string;
  values: number[];
  fixed: number[];
  par: number;
  best: number;
};

const isNumbers = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every((item) => Number.isFinite(item));

export const parsePuzzle = (data: unknown): Puzzle => {
  const puzzle = data as Partial<Puzzle> | null;
  const length = Array.isArray(puzzle?.values) ? puzzle.values.length : 0;
  if (
    !puzzle ||
    !Number.isFinite(puzzle.number) ||
    typeof puzzle.template !== 'string' ||
    !isNumbers(puzzle.values) ||
    puzzle.values.length === 0 ||
    !isNumbers(puzzle.fixed) ||
    !puzzle.fixed.every((index) => Number.isInteger(index) && index >= 0 && index < length) ||
    !Number.isFinite(puzzle.par) ||
    !Number.isFinite(puzzle.best)
  ) {
    throw new Error('The puzzle file is not in the expected format.');
  }
  return puzzle as Puzzle;
};

/** "quicksort-most-comparisons" is shown as "Quicksort". */
export const puzzleTitle = (template: string) => {
  const [first = ''] = template.split('-');
  return first.charAt(0).toUpperCase() + first.slice(1);
};

/** One line per try: its score over the best, marked ⭐ at the goal and 🏆 at the best. Never the arrangement. */
export const shareText = (puzzle: Puzzle, scores: number[]) =>
  [
    `structs.sh daily #${puzzle.number} · ${puzzleTitle(puzzle.template)}`,
    ...scores.map((score) => {
      let mark = '';
      if (score >= puzzle.best) mark = ' 🏆';
      else if (score >= puzzle.par) mark = ' ⭐';
      return `${score} / ${puzzle.best}${mark}`;
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
