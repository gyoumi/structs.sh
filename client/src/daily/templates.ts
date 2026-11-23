import type { EvalPuzzleInstance, PuzzleEvaluation } from '@/Services/puzzles/puzzles';
import { CanvasTarget, namedCanvasTarget } from '@/visualiser-src/common/canvasTarget';
import type { TryScore } from './playMachine';
import type { Puzzle } from './puzzle';

/** A running count one stage's animation keeps: quicksort's or insertion's comparisons, or bubble sort's passes and swaps. */
export type CounterSource = { stage: 0 | 1; key: 'comparisons' | 'passes' | 'swaps' };

export type ReadoutValue =
  | { kind: 'live'; source: CounterSource }
  | { kind: 'fixed'; value: number };

export type Readout = { key: string; label: string; value: ReadoutValue };

/** The scored readout shown large beside the goal, then the rest. */
export type Readouts = { primary: Readout; others: Readout[] };

export type StageSpec = { command: string; label: string };

export type DualStageSpec = StageSpec & { region: string; target: CanvasTarget };

export type StagePlan =
  | { kind: 'single'; stage: StageSpec }
  | { kind: 'dual'; stages: [DualStageSpec, DualStageSpec] };

/** Pairs `i < j` with `values[i] > values[j]`. */
export const outOfOrderPairs = (values: number[]) =>
  values.reduce(
    (pairs, value, i) => pairs + values.slice(i + 1).filter((later) => value > later).length,
    0
  );

const live = (key: string, label: string, source: CounterSource): Readout => ({
  key,
  label,
  value: { kind: 'live', source },
});

const fixed = (key: string, label: string, value: number): Readout => ({
  key,
  label,
  value: { kind: 'fixed', value },
});

export const readoutsFor = (puzzle: Puzzle, values: number[]): Readouts => {
  switch (puzzle.template) {
    case 'bubble-exact-passes':
      return {
        primary: live('swaps', 'Swaps', { stage: 0, key: 'swaps' }),
        others: [
          live('passes', 'Passes', { stage: 0, key: 'passes' }),
          fixed('target-passes', 'Target passes', puzzle.targetPasses),
        ],
      };
    case 'insertion-beats-merge':
      return {
        primary: fixed('out-of-order', 'Out-of-order pairs', outOfOrderPairs(values)),
        others: [
          live('insertion', 'Insertion comparisons', { stage: 0, key: 'comparisons' }),
          live('merge', 'Merge comparisons', { stage: 1, key: 'comparisons' }),
        ],
      };
    default:
      return {
        primary: live('comparisons', 'Comparisons', { stage: 0, key: 'comparisons' }),
        others: [],
      };
  }
};

export const stagePlanFor = (puzzle: Puzzle): StagePlan => {
  switch (puzzle.template) {
    case 'bubble-exact-passes':
      return { kind: 'single', stage: { command: 'bubble', label: 'Bubble sort drawing' } };
    case 'insertion-beats-merge':
      return {
        kind: 'dual',
        stages: [
          {
            command: 'insertion',
            label: 'Insertion sort drawing',
            region: 'Insertion sort',
            target: namedCanvasTarget('daily-insertion'),
          },
          {
            command: 'merge',
            label: 'Merge sort drawing',
            region: 'Merge sort',
            target: namedCanvasTarget('daily-merge'),
          },
        ],
      };
    default:
      return { kind: 'single', stage: { command: 'quick', label: 'Quicksort drawing' } };
  }
};

export const instanceOf = (puzzle: Puzzle): EvalPuzzleInstance => {
  const { values, fixed: locked } = puzzle;
  if (puzzle.template === 'bubble-exact-passes') {
    return { template: puzzle.template, values, fixed: locked, targetPasses: puzzle.targetPasses };
  }
  return { template: puzzle.template, values, fixed: locked };
};

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/** A try's score, or why it missed the puzzle's condition. */
export const tryScoreOf = (puzzle: Puzzle, evaluation: PuzzleEvaluation): TryScore => {
  if (evaluation.solved) return evaluation.score;
  if (evaluation.template === 'bubble-exact-passes') {
    const needed = puzzle.template === 'bubble-exact-passes' ? puzzle.targetPasses : 0;
    return {
      kind: 'unsolved',
      reason: `Took ${plural(evaluation.passes, 'pass', 'passes')} — needed ${needed}`,
    };
  }
  const { insertionComparisons, mergeComparisons } = evaluation;
  return {
    kind: 'unsolved',
    reason: `Insertion made ${plural(insertionComparisons, 'comparison', 'comparisons')} — merge made ${mergeComparisons}`,
  };
};
