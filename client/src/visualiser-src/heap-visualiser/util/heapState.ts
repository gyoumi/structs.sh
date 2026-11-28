import type { HeapOrder } from '@/Services/challenges/challenges';

/** The most keys a heap holds, the same as the engine's `DEFAULT_CAPACITY`. */
export const HEAP_CAPACITY = 15;

/** The whole heap: its order and its keys in array order. */
export type HeapState = { order: HeapOrder; items: number[] };

const isOrder = (value: unknown): value is HeapOrder => value === 'min' || value === 'max';

const isHeapKey = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 99;

const isBetter = (order: HeapOrder, a: number, b: number): boolean =>
  order === 'max' ? a > b : a < b;

/** True when no key is strictly better than its parent, so equal keys never break a heap. */
export const isHeap = (order: HeapOrder, items: readonly number[]): boolean =>
  items.every((key, i) => i === 0 || !isBetter(order, key, items[Math.floor((i - 1) / 2)]));

/** Reads a saved heap back as a fresh copy, or undefined when it isn't a valid heap of its order. */
export const readHeapState = (state: unknown): HeapState | undefined => {
  if (typeof state !== 'object' || state === null) return undefined;
  const { order, items } = state as { order?: unknown; items?: unknown };
  if (!isOrder(order) || !Array.isArray(items) || items.length > HEAP_CAPACITY) return undefined;
  if (!items.every(isHeapKey) || !isHeap(order, items)) return undefined;
  return { order, items: [...items] };
};
