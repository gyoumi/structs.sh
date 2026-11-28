import { describe, expect, it } from 'vitest';
import type { HeapOrder } from '@/Services/challenges/heapTypes';
import { HEAP_CAPACITY, isHeap, readHeapState, type HeapState } from './heapState';

/**
 * The contract is docs/heap.md, step 2a. A 0-indexed array: the parent of i is (i - 1) / 2.
 * "Better" is strictly greater for max and strictly smaller for min, so equal keys are a heap.
 */

/** JSON shows NaN and Infinity as null; keep them readable in failure messages. */
const fixNumbers = (v: unknown) =>
  typeof v === 'number' && !Number.isFinite(v) ? `<${String(v)}>` : v;

const show = (value: unknown) =>
  value === undefined ? 'undefined' : JSON.stringify(value, (_, v: unknown) => fixNumbers(v));

/** A valid max-heap of 15 keys, strictly decreasing in array order. */
const FULL_MAX = [99, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5];
/** A valid min-heap of 15 keys, strictly increasing in array order. */
const FULL_MIN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

const withKey = (items: number[], index: number, key: number) =>
  items.map((k, i) => (i === index ? key : k));

describe('HEAP_CAPACITY', () => {
  it('is 15, the engine DEFAULT_CAPACITY', () => {
    expect(HEAP_CAPACITY, `HEAP_CAPACITY should be 15, got ${show(HEAP_CAPACITY)}`).toBe(15);
  });
});

describe('isHeap', () => {
  const cases: { order: HeapOrder; items: number[]; expected: boolean; why: string }[] = [
    { order: 'max', items: [], expected: true, why: 'an empty heap is a heap' },
    { order: 'min', items: [], expected: true, why: 'an empty heap is a heap' },
    { order: 'max', items: [42], expected: true, why: 'one key is a heap' },
    { order: 'min', items: [42], expected: true, why: 'one key is a heap' },
    { order: 'max', items: [9, 4, 7, 1, 3], expected: true, why: 'every parent >= its children' },
    { order: 'min', items: [1, 3, 7, 4, 9], expected: true, why: 'every parent <= its children' },
    { order: 'max', items: [5, 5, 5], expected: true, why: 'equal keys are not better' },
    { order: 'min', items: [5, 5, 5], expected: true, why: 'equal keys are not better' },
    { order: 'max', items: [9, 9, 4, 9], expected: true, why: 'a child equal to its parent' },
    { order: 'min', items: [2, 2, 8, 2], expected: true, why: 'a child equal to its parent' },
    { order: 'max', items: FULL_MAX, expected: true, why: 'a full valid max-heap' },
    { order: 'min', items: FULL_MIN, expected: true, why: 'a full valid min-heap' },
    { order: 'max', items: [3, 9], expected: false, why: 'index 1 (9) > its parent index 0 (3)' },
    { order: 'min', items: [9, 3], expected: false, why: 'index 1 (3) < its parent index 0 (9)' },
    {
      order: 'max',
      items: [9, 4, 10],
      expected: false,
      why: 'right child index 2 (10) > its parent index 0 (9)',
    },
    {
      order: 'min',
      items: [1, 3, 0],
      expected: false,
      why: 'right child index 2 (0) < its parent index 0 (1)',
    },
    {
      order: 'max',
      items: withKey(FULL_MAX, 14, 45),
      expected: false,
      why: 'only the last index 14 (45) > its parent index 6 (40)',
    },
    {
      order: 'min',
      items: withKey(FULL_MIN, 14, 5),
      expected: false,
      why: 'only the last index 14 (5) < its parent index 6 (6)',
    },
    {
      order: 'max',
      items: withKey(FULL_MAX, 7, 75),
      expected: false,
      why: 'only index 7 (75) > its parent index 3 (70)',
    },
    {
      order: 'min',
      items: withKey(FULL_MIN, 9, 3),
      expected: false,
      why: 'only index 9 (3) < its parent index 4 (4)',
    },
    {
      order: 'min',
      items: [9, 4, 7, 1, 3],
      expected: false,
      why: 'a valid max-heap is not a min-heap',
    },
    {
      order: 'max',
      items: [1, 3, 7, 4, 9],
      expected: false,
      why: 'a valid min-heap is not a max-heap',
    },
  ];

  it.each(cases)('isHeap($order, $items) is $expected: $why', ({ order, items, expected, why }) => {
    const actual = isHeap(order, items);
    expect(
      actual,
      `isHeap(${show(order)}, ${show(items)}) should be ${expected} (${why}), got ${show(actual)}`
    ).toBe(expected);
  });

  it('does not change the array it checks', () => {
    const items = [9, 4, 7, 1, 3];
    isHeap('max', items);
    isHeap('min', items);
    expect(
      items,
      `isHeap('max' / 'min', [9, 4, 7, 1, 3]) must not modify its input, got ${show(items)}`
    ).toEqual([9, 4, 7, 1, 3]);
  });
});

describe('readHeapState accepts a valid heap', () => {
  const valid: { label: string; state: HeapState }[] = [
    { label: 'an empty max-heap', state: { order: 'max', items: [] } },
    { label: 'an empty min-heap', state: { order: 'min', items: [] } },
    { label: 'one key, max', state: { order: 'max', items: [7] } },
    { label: 'one key, min', state: { order: 'min', items: [7] } },
    { label: 'a max-heap', state: { order: 'max', items: [9, 4, 7, 1, 3] } },
    { label: 'a min-heap', state: { order: 'min', items: [1, 3, 7, 4, 9] } },
    { label: 'duplicate keys, max', state: { order: 'max', items: [5, 5, 5, 5] } },
    { label: 'duplicate keys, min', state: { order: 'min', items: [5, 5, 5, 5] } },
    { label: 'keys 0 and 99, max', state: { order: 'max', items: [99, 0] } },
    { label: 'keys 0 and 99, min', state: { order: 'min', items: [0, 99] } },
    { label: '15 keys (the capacity), max', state: { order: 'max', items: FULL_MAX } },
    { label: '15 keys (the capacity), min', state: { order: 'min', items: FULL_MIN } },
  ];

  it.each(valid)('returns $label unchanged', ({ state }) => {
    const input = JSON.parse(JSON.stringify(state)) as HeapState;
    const actual = readHeapState(input);
    expect(
      actual,
      `readHeapState(${show(input)}) is a valid heap of its order: should return ${show(state)}, got ${show(actual)}`
    ).toEqual(state);
  });

  it.each([
    { order: 'max' as const, items: [9, 4, 7, 1, 3] },
    { order: 'min' as const, items: [1, 3, 7, 4, 9] },
  ])('returns a fresh copy for $order: changing the input later does not change it', (state) => {
    const input = { order: state.order, items: [...state.items] };
    const actual = readHeapState(input);
    expect(actual, `readHeapState(${show(state)}) should accept the heap`).toBeDefined();
    expect(
      actual !== input,
      `readHeapState(${show(state)}) should return a new object, not the input object itself`
    ).toBe(true);
    expect(
      actual?.items !== input.items,
      `readHeapState(${show(state)}) should return a new items array, not the input's array`
    ).toBe(true);

    input.items.push(0);
    input.items[0] = 50;
    (input as { order: string }).order = state.order === 'max' ? 'min' : 'max';
    expect(
      actual,
      `readHeapState(${show(state)}), then the input was changed to ${show(input)}: the returned state should still be ${show(state)}, got ${show(actual)}`
    ).toEqual(state);
  });
});

describe('readHeapState rejects anything else', () => {
  const sixteen = [...FULL_MAX, 1];

  const invalid: { label: string; state: unknown }[] = [
    { label: 'undefined', state: undefined },
    { label: 'null', state: null },
    { label: 'a string', state: 'max' },
    { label: 'a number', state: 42 },
    { label: 'a boolean', state: true },
    { label: 'an array of keys (the default data snapshot)', state: [9, 4, 7] },
    { label: 'an empty object', state: {} },
    { label: 'no order', state: { items: [9, 4] } },
    { label: "order 'Max' (orders are lowercase)", state: { order: 'Max', items: [9, 4] } },
    { label: "order 'MIN'", state: { order: 'MIN', items: [1, 4] } },
    { label: "order 'mid'", state: { order: 'mid', items: [] } },
    { label: 'order 0', state: { order: 0, items: [] } },
    { label: 'order null', state: { order: null, items: [] } },
    { label: 'no items', state: { order: 'max' } },
    { label: 'items null', state: { order: 'max', items: null } },
    { label: 'items a string', state: { order: 'max', items: '9,4' } },
    { label: 'items a number', state: { order: 'min', items: 9 } },
    { label: 'items an array-like object', state: { order: 'max', items: { 0: 9, length: 1 } } },
    { label: 'a non-integer key 1.5', state: { order: 'max', items: [9, 1.5] } },
    { label: 'a NaN key', state: { order: 'max', items: [Number.NaN] } },
    { label: 'an Infinity key', state: { order: 'max', items: [Number.POSITIVE_INFINITY] } },
    { label: "a string key '5'", state: { order: 'max', items: ['5'] } },
    { label: 'a null key', state: { order: 'min', items: [null] } },
    { label: 'key -1', state: { order: 'max', items: [9, -1] } },
    { label: 'key 100', state: { order: 'max', items: [100, 9] } },
    { label: 'key -1 in a min-heap', state: { order: 'min', items: [-1, 9] } },
    { label: 'key 100 in a min-heap', state: { order: 'min', items: [9, 100] } },
    {
      label: '16 keys (more than 15), an otherwise valid max-heap',
      state: { order: 'max', items: sixteen },
    },
    {
      label: '16 keys (more than 15), an otherwise valid min-heap',
      state: { order: 'min', items: [...FULL_MIN, 15] },
    },
    { label: 'not a max-heap at index 1', state: { order: 'max', items: [3, 9] } },
    { label: 'not a min-heap at index 1', state: { order: 'min', items: [9, 3] } },
    {
      label: 'not a max-heap only at the last index 14',
      state: { order: 'max', items: withKey(FULL_MAX, 14, 45) },
    },
    {
      label: 'not a min-heap only at the last index 14',
      state: { order: 'min', items: withKey(FULL_MIN, 14, 5) },
    },
    { label: 'a max-heap labelled min', state: { order: 'min', items: [9, 4, 7, 1, 3] } },
    { label: 'a min-heap labelled max', state: { order: 'max', items: [1, 3, 7, 4, 9] } },
  ];

  it.each(invalid)('returns undefined for $label', ({ label, state }) => {
    let actual: HeapState | undefined;
    expect(
      () => {
        actual = readHeapState(state);
      },
      `readHeapState(${show(state)}) (${label}) must not throw`
    ).not.toThrow();
    expect(
      actual,
      `readHeapState(${show(state)}) (${label}) should be undefined, got ${show(actual)}`
    ).toBe(undefined);
  });
});
