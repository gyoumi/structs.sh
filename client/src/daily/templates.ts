import {
  evaluateChallenge,
  type ArrayEvalChallengeInstance,
  type EvalChallengeInstance,
  type ListEvalChallengeInstance,
  type ChallengeEvaluation,
} from '@/Services/challenges/challenges';
import { CanvasTarget, namedCanvasTarget } from '@/visualiser-src/common/canvasTarget';
import type { TopicSlug } from '@/visualiser/topics';
import type { PlayInput, TryScore } from './playMachine';
import type { IndexDriftChallenge, Challenge } from './challenge';

/** A running count one stage's animation keeps. */
export type CounterSource = {
  stage: 0 | 1;
  key:
    | 'comparisons'
    | 'passes'
    | 'swaps'
    | 'rotations'
    | 'nodesPassed'
    | 'operations'
    | 'nodesWalked'
    | 'cost';
};

export type ReadoutValue =
  | { kind: 'live'; source: CounterSource }
  | { kind: 'gap'; from: CounterSource; minus: CounterSource }
  | { kind: 'fixed'; value: number };

export type Readout = { key: string; label: string; value: ReadoutValue };

/** The scored readout shown large beside the goal, then the rest. */
export type Readouts = { primary: Readout; others: Readout[] };

/** `sort` draws the arrangement and sorts it; `tree-build` starts empty and inserts the arrangement in order; `list-ops` draws the start list and runs the player's operations on it. */
export type StageMode = 'sort' | 'tree-build' | 'list-ops';

export type StageSpec = { command: string; label: string; topic: TopicSlug };

export type DualStageSpec = StageSpec & { region: string; target: CanvasTarget };

export type StagePlan =
  | { kind: 'single'; mode: StageMode; stage: StageSpec }
  | { kind: 'dual'; mode: StageMode; stages: [DualStageSpec, DualStageSpec] };

/** Pairs `i < j` with `values[i] > values[j]`. */
export const outOfOrderPairs = (values: number[]) =>
  values.reduce(
    (pairs, value, i) => pairs + values.slice(i + 1).filter((later) => value > later).length,
    0
  );

/** The longest run of neighbouring values that strictly increases. */
export const longestIncreasingRun = (values: number[]) => {
  let longest = 0;
  let run = 0;
  values.forEach((value, i) => {
    run = i > 0 && values[i - 1] < value ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return longest;
};

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

export const readoutsFor = (challenge: Challenge, values: number[]): Readouts => {
  switch (challenge.template) {
    case 'bubble-exact-passes':
      return {
        primary: live('swaps', 'Swaps', { stage: 0, key: 'swaps' }),
        others: [
          live('passes', 'Passes', { stage: 0, key: 'passes' }),
          fixed('target-passes', 'Target passes', challenge.targetPasses),
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
    case 'avl-most-rotations':
      return {
        primary: live('rotations', 'Rotations', { stage: 0, key: 'rotations' }),
        others: [],
      };
    case 'bst-forced-order':
      return {
        primary: fixed('increasing-run', 'Increasing run', longestIncreasingRun(values)),
        others: [],
      };
    case 'linked-list-index-drift':
      return {
        primary: live('cost', 'Cost', { stage: 0, key: 'cost' }),
        others: [
          live('operations', 'Operations', { stage: 0, key: 'operations' }),
          live('nodes-walked', 'Nodes walked', { stage: 0, key: 'nodesWalked' }),
        ],
      };
    case 'upset-bst-beats-avl': {
      const bst: CounterSource = { stage: 0, key: 'nodesPassed' };
      const avl: CounterSource = { stage: 1, key: 'nodesPassed' };
      return {
        primary: { key: 'margin', label: 'Margin', value: { kind: 'gap', from: avl, minus: bst } },
        others: [
          live('bst-passed', 'BST nodes passed', bst),
          live('avl-passed', 'AVL nodes passed', avl),
        ],
      };
    }
    default:
      return {
        primary: live('comparisons', 'Comparisons', { stage: 0, key: 'comparisons' }),
        others: [],
      };
  }
};

const treeStage = (topic: 'BST' | 'AVL'): StageSpec =>
  topic === 'BST'
    ? { command: 'insertAll', label: 'BST drawing', topic: 'binary-search-trees' }
    : { command: 'insertAll', label: 'AVL tree drawing', topic: 'avl-trees' };

const sortStage = (command: string, label: string): StageSpec => ({
  command,
  label,
  topic: 'sorting-algorithms',
});

export const stagePlanFor = (challenge: Challenge): StagePlan => {
  switch (challenge.template) {
    case 'bubble-exact-passes':
      return { kind: 'single', mode: 'sort', stage: sortStage('bubble', 'Bubble sort drawing') };
    case 'insertion-beats-merge':
      return {
        kind: 'dual',
        mode: 'sort',
        stages: [
          {
            ...sortStage('insertion', 'Insertion sort drawing'),
            region: 'Insertion sort',
            target: namedCanvasTarget('daily-insertion'),
          },
          {
            ...sortStage('merge', 'Merge sort drawing'),
            region: 'Merge sort',
            target: namedCanvasTarget('daily-merge'),
          },
        ],
      };
    case 'avl-most-rotations':
      return { kind: 'single', mode: 'tree-build', stage: treeStage('AVL') };
    case 'linked-list-index-drift':
      return {
        kind: 'single',
        mode: 'list-ops',
        stage: { command: 'runOperations', label: 'Linked list drawing', topic: 'linked-lists' },
      };
    case 'bst-forced-order':
      return { kind: 'single', mode: 'tree-build', stage: treeStage('BST') };
    case 'upset-bst-beats-avl':
      return {
        kind: 'dual',
        mode: 'tree-build',
        stages: [
          { ...treeStage('BST'), region: 'BST', target: namedCanvasTarget('daily-bst') },
          { ...treeStage('AVL'), region: 'AVL tree', target: namedCanvasTarget('daily-avl') },
        ],
      };
    default:
      return { kind: 'single', mode: 'sort', stage: sortStage('quick', 'Quicksort drawing') };
  }
};

export function instanceOf(challenge: IndexDriftChallenge): ListEvalChallengeInstance;
export function instanceOf(
  challenge: Exclude<Challenge, IndexDriftChallenge>
): ArrayEvalChallengeInstance;
export function instanceOf(challenge: Challenge): EvalChallengeInstance;
export function instanceOf(challenge: Challenge): EvalChallengeInstance {
  switch (challenge.template) {
    case 'linked-list-index-drift':
      return { template: challenge.template, start: challenge.start, target: challenge.target };
    case 'bubble-exact-passes':
      return {
        template: challenge.template,
        values: challenge.values,
        fixed: challenge.fixed,
        targetPasses: challenge.targetPasses,
      };
    case 'bst-forced-order':
      return {
        template: challenge.template,
        values: challenge.values,
        targetTree: challenge.targetTree,
      };
    default:
      return { template: challenge.template, values: challenge.values, fixed: challenge.fixed };
  }
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const missReason = (
  challenge: Challenge,
  evaluation: ChallengeEvaluation & { solved: false }
): string => {
  switch (evaluation.template) {
    case 'bubble-exact-passes': {
      const needed = challenge.template === 'bubble-exact-passes' ? challenge.targetPasses : 0;
      return `Took ${plural(evaluation.passes, 'pass', 'passes')} — needed ${needed}`;
    }
    case 'insertion-beats-merge':
      return `Insertion made ${plural(evaluation.insertionComparisons, 'comparison', 'comparisons')} — merge made ${evaluation.mergeComparisons}`;
    case 'bst-forced-order':
      return 'That order builds a different tree from the target.';
    case 'linked-list-index-drift':
      return 'That sequence leaves a different list from the target.';
    default:
      return `BST passed ${plural(evaluation.bstNodesPassed, 'node', 'nodes')} — AVL passed ${evaluation.avlNodesPassed}`;
  }
};

/** A try's score, or why it missed the challenge's condition. */
export const tryScoreOf = (challenge: Challenge, evaluation: ChallengeEvaluation): TryScore =>
  evaluation.solved
    ? evaluation.score
    : { kind: 'unsolved', reason: missReason(challenge, evaluation) };

/** The array values to draw on the stage for `challenge` and `input`. */
export const valuesForInput = (challenge: Challenge, input: PlayInput): number[] =>
  challenge.template === 'linked-list-index-drift'
    ? challenge.start
    : input.kind === 'arrangement'
      ? input.arrangement
      : challenge.values;

/** Evaluates `input` against `challenge` through the challenge engine. */
export const scoreRun = (challenge: Challenge, input: PlayInput) => {
  if (challenge.template === 'linked-list-index-drift') {
    if (input.kind !== 'operations') {
      return Promise.reject(new Error('Expected list operations for linked-list-index-drift.'));
    }
    return evaluateChallenge(instanceOf(challenge), input.operations);
  }
  if (input.kind !== 'arrangement') {
    return Promise.reject(new Error(`Expected an arrangement for ${challenge.template}.`));
  }
  return evaluateChallenge(instanceOf(challenge), input.arrangement);
};
