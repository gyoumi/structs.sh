/**
 * Shapes of GET /api/daily, one per daily game template.
 * None has a `best` field: the solver's best score stays on the server and is never sent to players.
 * `fixed` holds 0-based indices of locked slots; `goal` is the goal the page shows and never computes.
 */

export interface QuicksortChallenge {
  number: number;
  template: 'quicksort-most-comparisons';
  values: number[];
  fixed: number[];
  goal: number;
}

/** Solved when bubble sort takes exactly `targetPasses` passes; then scored by swaps (higher wins). */
export interface BubbleChallenge {
  number: number;
  template: 'bubble-exact-passes';
  values: number[];
  fixed: number[];
  targetPasses: number;
  goal: number;
}

/** Solved when insertion sort compares strictly less than merge sort; then scored by out-of-order pairs (higher wins). */
export interface InsertionMergeChallenge {
  number: number;
  template: 'insertion-beats-merge';
  values: number[];
  fixed: number[];
  goal: number;
}

/** `values` is the insert order; scored by single AVL rotations, a double rotation counting 2 (higher wins). */
export interface AvlRotationsChallenge {
  number: number;
  template: 'avl-most-rotations';
  values: number[];
  fixed: number[];
  goal: number;
}

/**
 * Solved when inserting `values` in order into an empty BST rebuilds `targetTree` (given as preorder);
 * then scored by the longest contiguous strictly increasing run in the insert order (higher wins). No fixed slots.
 */
export interface ForcedOrderChallenge {
  number: number;
  template: 'bst-forced-order';
  values: number[];
  targetTree: number[];
  goal: number;
}

/** Solved when the plain BST passes fewer existing nodes than the AVL tree; then scored by the margin (higher wins). */
export interface UpsetChallenge {
  number: number;
  template: 'upset-bst-beats-avl';
  values: number[];
  fixed: number[];
  goal: number;
}

/** Solved when the operations turn `start` into `target`; then scored by operations + nodes walked (lower wins). */
export interface IndexDriftChallenge {
  number: number;
  template: 'linked-list-index-drift';
  start: number[];
  target: number[];
  goal: number;
}

export type DailyChallenge =
  | QuicksortChallenge
  | BubbleChallenge
  | InsertionMergeChallenge
  | AvlRotationsChallenge
  | ForcedOrderChallenge
  | UpsetChallenge
  | IndexDriftChallenge;
