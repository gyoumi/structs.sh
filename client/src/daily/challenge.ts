import type { DailyChallenge } from './api';
import { isI32 } from './i32';
import { reachesGoal } from './playMachine';

type ChallengeBase = {
  number: number;
  values: number[];
  fixed: number[];
  goal: number;
  /** The day the challenge is for, as the server sent it. */
  date?: string;
};

type QuicksortChallenge = ChallengeBase & { template: 'quicksort-most-comparisons' };

type BubbleChallenge = ChallengeBase & {
  template: 'bubble-exact-passes';
  targetPasses: number;
};

type InsertionMergeChallenge = ChallengeBase & { template: 'insertion-beats-merge' };

type AvlRotationsChallenge = ChallengeBase & { template: 'avl-most-rotations' };

/** No slot is locked, so `fixed` is always empty; the server leaves it out. */
type ForcedOrderChallenge = ChallengeBase & {
  template: 'bst-forced-order';
  fixed: [];
  /** The preorder of the tree the insert order has to build. */
  targetTree: number[];
};

type UpsetChallenge = ChallengeBase & { template: 'upset-bst-beats-avl' };

/** Turn `start` into `target` with inserts and deletes by index, at the lowest cost. It has no values to arrange. */
export type IndexDriftChallenge = {
  number: number;
  template: 'linked-list-index-drift';
  start: number[];
  target: number[];
  goal: number;
  date?: string;
  values?: never;
  fixed?: never;
};

export type Challenge =
  | QuicksortChallenge
  | BubbleChallenge
  | InsertionMergeChallenge
  | AvlRotationsChallenge
  | ForcedOrderChallenge
  | UpsetChallenge
  | IndexDriftChallenge;

/** Every challenge the player solves by arranging values, which is all but index drift. */
export type ArrayChallenge = Exclude<Challenge, IndexDriftChallenge>;

export type Template = Challenge['template'];

const TITLES: Record<DailyChallenge['template'], string> = {
  'quicksort-most-comparisons': 'Quicksort',
  'bubble-exact-passes': 'Bubble sort',
  'insertion-beats-merge': 'Insertion beats merge',
  'avl-most-rotations': 'AVL tree',
  'bst-forced-order': 'Forced order',
  'upset-bst-beats-avl': 'Upset',
  'linked-list-index-drift': 'Index drift',
};

export const isTemplate = (template: unknown): template is Template =>
  typeof template === 'string' && Object.hasOwn(TITLES, template);

const isNumbers = (value: unknown): value is number[] => Array.isArray(value) && value.every(isI32);

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

const formatError = () => new Error('The challenge from the server is not in the expected format.');

/** Whether the server must list fixed slots, or has none and may only leave `fixed` out or empty. */
type FixedRule = 'listed' | 'none';

const parseDate = (date: unknown): string | undefined => {
  if (date !== undefined && (typeof date !== 'string' || date.trim() === '')) {
    throw new Error('The challenge date is not in the expected format.');
  }
  return date?.trim();
};

const parseBase = (data: unknown, rule: FixedRule): ChallengeBase => {
  const raw = data as Partial<ChallengeBase> | null;
  const challenge =
    raw && rule === 'none' && (raw.fixed === undefined || isEmptyList(raw.fixed))
      ? { ...raw, fixed: [] }
      : raw;
  const length = Array.isArray(challenge?.values) ? challenge.values.length : 0;
  if (
    !challenge ||
    !Number.isFinite(challenge.number) ||
    !isNumbers(challenge.values) ||
    challenge.values.length === 0 ||
    !isNumbers(challenge.fixed) ||
    (rule === 'none' && challenge.fixed.length > 0) ||
    !challenge.fixed.every((index) => Number.isInteger(index) && index >= 0 && index < length) ||
    !Number.isFinite(challenge.goal)
  ) {
    throw formatError();
  }
  const date = parseDate((challenge as { date?: unknown }).date);
  const { number, values, fixed, goal } = challenge as ChallengeBase;
  return date === undefined
    ? { number, values, fixed, goal }
    : { number, values, fixed, goal, date };
};

const MAX_U32 = 0xffffffff;

const parseForcedOrder = (data: unknown): ForcedOrderChallenge => {
  const base = parseBase(data, 'none');
  const { targetTree } = data as { targetTree?: unknown };
  if (!isNumbers(targetTree) || !isValidTargetTree(base.values, targetTree)) throw formatError();
  return { template: 'bst-forced-order', ...base, fixed: [], targetTree };
};

const parseIndexDrift = (data: object): IndexDriftChallenge => {
  const { number, start, target, goal } = data as Partial<Record<string, unknown>>;
  if (
    Object.hasOwn(data, 'values') ||
    Object.hasOwn(data, 'fixed') ||
    !Number.isFinite(number) ||
    !isNumbers(start) ||
    !isNumbers(target) ||
    !Number.isFinite(goal)
  ) {
    throw formatError();
  }
  const date = parseDate((data as { date?: unknown }).date);
  const challenge: IndexDriftChallenge = {
    number: number as number,
    template: 'linked-list-index-drift',
    start,
    target,
    goal: goal as number,
  };
  return date === undefined ? challenge : { ...challenge, date };
};

export const parseChallenge = (data: unknown): Challenge => {
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
export const challengeTitle = (template: Template) => TITLES[template];

/** A try's score, or null when the try did not solve the challenge. */
export type SharedScore = number | null;

/** One line per try: its score, marked ⭐ at the goal, or ✗ when unsolved, then the streak when there is one. Never the try's input. */
export const shareText = (
  challenge: Pick<Challenge, 'number' | 'template' | 'goal'>,
  scores: SharedScore[],
  streak?: number
) =>
  [
    `structs.sh daily #${challenge.number} · ${challengeTitle(challenge.template)} · Goal ${challenge.goal}`,
    ...scores.map((score) => {
      if (score === null) return '✗';
      return `${score}${reachesGoal(challenge, score) ? ' ⭐' : ''}`;
    }),
    ...(streak !== undefined && streak > 0
      ? [`Streak: ${streak} ${streak === 1 ? 'day' : 'days'} 🔥`]
      : []),
    'structs.sh/daily',
  ].join('\n');
