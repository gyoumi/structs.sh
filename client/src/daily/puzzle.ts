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

export type AvlRotationsPuzzle = PuzzleBase & { template: 'avl-most-rotations' };

/** No slot is locked, so `fixed` is always empty; the file leaves it out. */
export type ForcedOrderPuzzle = PuzzleBase & {
  template: 'bst-forced-order';
  fixed: [];
  /** The preorder of the tree the insert order has to build. */
  targetTree: number[];
};

export type UpsetPuzzle = PuzzleBase & { template: 'upset-bst-beats-avl' };

export type Puzzle =
  | QuicksortPuzzle
  | BubblePuzzle
  | InsertionMergePuzzle
  | AvlRotationsPuzzle
  | ForcedOrderPuzzle
  | UpsetPuzzle;

export type Template = Puzzle['template'];

const TITLES: Record<Template, string> = {
  'quicksort-most-comparisons': 'Quicksort',
  'bubble-exact-passes': 'Bubble sort',
  'insertion-beats-merge': 'Insertion beats merge',
  'avl-most-rotations': 'AVL tree',
  'bst-forced-order': 'Forced order',
  'upset-bst-beats-avl': 'Upset',
};

const isTemplate = (template: unknown): template is Template =>
  typeof template === 'string' && Object.hasOwn(TITLES, template);

const MIN_I32 = -0x80000000;
const MAX_I32 = 0x7fffffff;

const isNumbers = (value: unknown): value is number[] =>
  Array.isArray(value) &&
  value.every((item) => Number.isInteger(item) && item >= MIN_I32 && item <= MAX_I32);

const isEmptyList = (value: unknown) => Array.isArray(value) && value.length === 0;

type BstNode = { value: number; left: BstNode | null; right: BstNode | null };

const insertBst = (node: BstNode | null, value: number): BstNode => {
  if (node === null) return { value, left: null, right: null };
  if (value < node.value) return { ...node, left: insertBst(node.left, value) };
  if (value > node.value) return { ...node, right: insertBst(node.right, value) };
  return node;
};

const bstPreorder = (values: number[]): number[] => {
  const root = values.reduce<BstNode | null>((tree, value) => insertBst(tree, value), null);
  const out: number[] = [];
  const walk = (node: BstNode | null) => {
    if (node === null) return;
    out.push(node.value);
    walk(node.left);
    walk(node.right);
  };
  walk(root);
  return out;
};

const isValidTargetTree = (values: number[], targetTree: number[]) => {
  const rebuilt = bstPreorder(targetTree);
  if (rebuilt.length !== targetTree.length || !rebuilt.every((v, i) => v === targetTree[i])) {
    return false;
  }
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

const parseForcedOrder = (data: unknown): ForcedOrderPuzzle => {
  const base = parseBase(data, 'none');
  const { targetTree } = data as { targetTree?: unknown };
  if (!isNumbers(targetTree) || !isValidTargetTree(base.values, targetTree)) throw formatError();
  return { template: 'bst-forced-order', ...base, fixed: [], targetTree };
};

export const parsePuzzle = (data: unknown): Puzzle => {
  const { template, targetPasses } = (data ?? {}) as { template?: unknown; targetPasses?: unknown };
  if (!isTemplate(template)) throw formatError();
  if (template === 'bst-forced-order') return parseForcedOrder(data);
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
