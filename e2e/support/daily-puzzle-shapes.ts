/**
 * Shapes of GET /puzzles/today.json, one per daily game template.
 * None has a `best` field: the solver's best score stays on the server and is never sent to players.
 * `fixed` holds 0-based indices of locked slots; `par` is the goal the page shows and never computes.
 */

export interface QuicksortPuzzle {
  number: number;
  template: 'quicksort-most-comparisons';
  values: number[];
  fixed: number[];
  par: number;
}

/** Solved when bubble sort takes exactly `targetPasses` passes; then scored by swaps (higher wins). */
export interface BubblePuzzle {
  number: number;
  template: 'bubble-exact-passes';
  values: number[];
  fixed: number[];
  targetPasses: number;
  par: number;
}

/** Solved when insertion sort compares strictly less than merge sort; then scored by out-of-order pairs (higher wins). */
export interface InsertionMergePuzzle {
  number: number;
  template: 'insertion-beats-merge';
  values: number[];
  fixed: number[];
  par: number;
}

/** `values` is the insert order; scored by single AVL rotations, a double rotation counting 2 (higher wins). */
export interface AvlRotationsPuzzle {
  number: number;
  template: 'avl-most-rotations';
  values: number[];
  fixed: number[];
  par: number;
}

/**
 * Solved when inserting `values` in order into an empty BST rebuilds `targetTree` (given as preorder);
 * then scored by the longest contiguous strictly increasing run in the insert order (higher wins). No fixed slots.
 */
export interface ForcedOrderPuzzle {
  number: number;
  template: 'bst-forced-order';
  values: number[];
  targetTree: number[];
  par: number;
}

/** Solved when the plain BST passes fewer existing nodes than the AVL tree; then scored by the margin (higher wins). */
export interface UpsetPuzzle {
  number: number;
  template: 'upset-bst-beats-avl';
  values: number[];
  fixed: number[];
  par: number;
}

/** Solved when the operations turn `start` into `target`; then scored by operations + nodes walked (lower wins). */
export interface IndexDriftPuzzle {
  number: number;
  template: 'linked-list-index-drift';
  start: number[];
  target: number[];
  par: number;
}

export type DailyPuzzle =
  | QuicksortPuzzle
  | BubblePuzzle
  | InsertionMergePuzzle
  | AvlRotationsPuzzle
  | ForcedOrderPuzzle
  | UpsetPuzzle
  | IndexDriftPuzzle;
