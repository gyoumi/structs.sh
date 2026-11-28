import type { HeapOrder } from '@/Services/challenges/challenges';
import { HEAP_CAPACITY, type HeapState, isHeap, isHeapKey } from './heapState';

/** A shared heap: either the heap as it stands, or keys to insert in order into an empty heap. */
export type ParsedHeapShare =
  | { kind: 'heap'; state: HeapState }
  | { kind: 'keys'; order: HeapOrder; keys: number[] };

const KEY_LIST = /^(?:[0-9]{2})+$/;
const PREFIXED = /^(min|max)(?:-(.*))?$/i;

const parseKeys = (text: string): number[] | undefined => {
  if (!KEY_LIST.test(text) || text.length > HEAP_CAPACITY * 2) return undefined;
  return Array.from({ length: text.length / 2 }, (_, i) => Number(text.slice(i * 2, i * 2 + 2)));
};

/** Encodes a heap as one URL segment: the order, then a dash and two digits per key in array order. */
export const encodeHeapShare = (state: HeapState): string => {
  const { order } = state;
  const items = Array.from(state.items);
  if (items.length > HEAP_CAPACITY) {
    throw new Error(
      `Heap share encoding holds at most ${HEAP_CAPACITY} keys, got ${items.length}.`
    );
  }
  const bad = items.findIndex((key) => !isHeapKey(key));
  if (bad !== -1) {
    throw new Error(`Heap share encoding needs keys from 0 to 99, got ${String(items[bad])}.`);
  }
  if (!isHeap(order, items)) {
    throw new Error(`Heap share encoding needs a ${order}-heap, got [${items.join(', ')}].`);
  }
  if (items.length === 0) return order;
  return `${order}-${items.map((key) => String(key).padStart(2, '0')).join('')}`;
};

/** Reads a shared URL segment back, or undefined when it is missing or malformed. */
export const decodeHeapShare = (segment: string | undefined): ParsedHeapShare | undefined => {
  if (!segment) return undefined;
  const prefixed = PREFIXED.exec(segment);
  if (prefixed) {
    const order = prefixed[1].toLowerCase() as HeapOrder;
    if (prefixed[2] === undefined) return { kind: 'heap', state: { order, items: [] } };
    const keys = parseKeys(prefixed[2]);
    if (!keys) return undefined;
    return isHeap(order, keys)
      ? { kind: 'heap', state: { order, items: keys } }
      : { kind: 'keys', order, keys };
  }
  const keys = parseKeys(segment);
  return keys ? { kind: 'keys', order: 'max', keys } : undefined;
};
