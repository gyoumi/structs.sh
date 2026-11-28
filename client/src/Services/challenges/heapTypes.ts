/** Which key sits at the root, as game-server/challenges/src/heap.rs serialises it. */
export type HeapOrder = 'min' | 'max';

/** One operation to run on the heap. */
export type HeapOp = { kind: 'insert'; key: number } | { kind: 'pop' } | { kind: 'rebuild' };

/** One recorded event while a heap operation runs. */
export type HeapStep =
  | { kind: 'append'; key: number; index: number }
  | { kind: 'compareParent'; index: number; parent: number; swap: boolean }
  | { kind: 'takeRoot'; key: number }
  | { kind: 'moveLastToRoot'; key: number; from: number }
  | {
      kind: 'compareChildren';
      index: number;
      left: number;
      right: number | null;
      best: number;
      swap: boolean;
    }
  | { kind: 'swap'; parent: number; child: number }
  | { kind: 'startRebuild'; order: HeapOrder }
  | { kind: 'reinserted'; key: number; index: number }
  | { kind: 'settled'; key: number; index: number }
  | { kind: 'poppedLast'; key: number }
  | { kind: 'empty' }
  | { kind: 'heapFull'; key: number }
  | { kind: 'rebuilt'; order: HeapOrder };

/** A heap of `order` with room for `capacity` keys holding `items`, and the operation to run on it. */
export type HeapRequest = { order: HeapOrder; capacity: number; items: number[]; op: HeapOp };

/** The heap and step log after one operation. */
export type HeapRunResult = {
  items: number[];
  steps: HeapStep[];
  comparisons: number;
  swaps: number;
  popped: number | null;
};
