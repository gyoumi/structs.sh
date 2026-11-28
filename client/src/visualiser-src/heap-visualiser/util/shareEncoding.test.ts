import { describe, expect, it } from 'vitest';
import type { HeapState } from './heapState';
import { decodeHeapShare, encodeHeapShare, type ParsedHeapShare } from './shareEncoding';

/**
 * The contract is docs/heap.md, step 2a: a share segment is the order, a dash, then each key as
 * two digits in array order (`max-340712`). An empty heap is the order alone. A plain key list
 * (`120734`) and a prefixed list that isn't a heap of its order both load by inserting the keys.
 */

const show = (value: unknown) => (value === undefined ? 'undefined' : JSON.stringify(value));

/** A valid max-heap of 15 keys, strictly decreasing in array order. */
const FULL_MAX = [99, 90, 80, 70, 60, 50, 40, 30, 20, 10, 9, 8, 7, 6, 5];
const FULL_MAX_ENCODED = 'max-999080706050403020100908070605';
/** A valid min-heap of 15 keys, strictly increasing in array order. */
const FULL_MIN = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const FULL_MIN_ENCODED = 'min-000102030405060708091011121314';

/** A sparse array of `length` slots with only `filled` (index to key) set; the rest are holes. */
const withHoles = (length: number, filled: Record<number, number>): number[] => {
  const items = new Array<number>(length);
  Object.entries(filled).forEach(([index, key]) => {
    items[Number(index)] = key;
  });
  return items;
};

const heap = (order: HeapState['order'], items: number[]): ParsedHeapShare => ({
  kind: 'heap',
  state: { order, items },
});
const keys = (order: HeapState['order'], list: number[]): ParsedHeapShare => ({
  kind: 'keys',
  order,
  keys: list,
});

/** The decoded value, failing with a clear message if decode throws (it never should). */
const decodeSafely = (segment: string | undefined) => {
  let actual: ParsedHeapShare | undefined;
  expect(
    () => {
      actual = decodeHeapShare(segment);
    },
    `decodeHeapShare(${show(segment)}) must never throw`
  ).not.toThrow();
  return actual;
};

describe('encodeHeapShare', () => {
  it.each([
    { state: { order: 'max', items: [] } as HeapState, expected: 'max' },
    { state: { order: 'min', items: [] } as HeapState, expected: 'min' },
    { state: { order: 'max', items: [34, 7, 12] } as HeapState, expected: 'max-340712' },
    { state: { order: 'min', items: [7, 12, 34] } as HeapState, expected: 'min-071234' },
    { state: { order: 'max', items: [42] } as HeapState, expected: 'max-42' },
    { state: { order: 'min', items: [0] } as HeapState, expected: 'min-00' },
    { state: { order: 'max', items: [99, 0] } as HeapState, expected: 'max-9900' },
    { state: { order: 'min', items: [0, 99] } as HeapState, expected: 'min-0099' },
    { state: { order: 'max', items: [5, 5, 5] } as HeapState, expected: 'max-050505' },
    { state: { order: 'min', items: [3, 3, 9, 3] } as HeapState, expected: 'min-03030903' },
    { state: { order: 'max', items: FULL_MAX } as HeapState, expected: FULL_MAX_ENCODED },
    { state: { order: 'min', items: FULL_MIN } as HeapState, expected: FULL_MIN_ENCODED },
  ])('encodes $state.order $state.items as $expected', ({ state, expected }) => {
    const actual = encodeHeapShare(state);
    expect(
      actual,
      `encodeHeapShare(${show(state)}) should be the order, a dash, then two digits per key in array order (keys under 10 padded, e.g. 7 as '07'; an empty heap is the order alone): expected ${show(expected)}, got ${show(actual)}`
    ).toBe(expected);
  });

  it('does not change the state it encodes', () => {
    const state: HeapState = { order: 'max', items: [34, 7, 12] };
    encodeHeapShare(state);
    expect(
      state,
      `encodeHeapShare({order 'max', items [34, 7, 12]}) must not modify its input, got ${show(state)}`
    ).toEqual({ order: 'max', items: [34, 7, 12] });
  });

  it.each([
    {
      reason: 'more than 15 keys (16, an otherwise valid max-heap)',
      state: { order: 'max', items: [...FULL_MAX, 1] } as HeapState,
    },
    {
      reason: 'more than 15 keys (16, an otherwise valid min-heap)',
      state: { order: 'min', items: [...FULL_MIN, 15] } as HeapState,
    },
    { reason: 'key 100 (above 99)', state: { order: 'max', items: [100, 9] } as HeapState },
    { reason: 'key -1 (below 0)', state: { order: 'max', items: [9, -1] } as HeapState },
    { reason: 'key 100 in a min-heap', state: { order: 'min', items: [9, 100] } as HeapState },
    { reason: 'key -1 in a min-heap', state: { order: 'min', items: [-1, 9] } as HeapState },
    {
      reason: 'not a max-heap: index 1 (9) > its parent (3)',
      state: { order: 'max', items: [3, 9] } as HeapState,
    },
    {
      reason: 'not a min-heap: index 1 (3) < its parent (9)',
      state: { order: 'min', items: [9, 3] } as HeapState,
    },
    {
      reason: "not a max-heap: [12, 7, 34], the keys of docs/heap.md's example 'max-120734'",
      state: { order: 'max', items: [12, 7, 34] } as HeapState,
    },
    {
      reason: 'not a max-heap only at the last index 14 (45 > its parent 40)',
      state: { order: 'max', items: FULL_MAX.map((k, i) => (i === 14 ? 45 : k)) } as HeapState,
    },
    {
      reason: 'a hole at index 1 of [9, <hole>, 3] (shown as null), which is no key',
      state: { order: 'max', items: withHoles(3, { 0: 9, 2: 3 }) } as HeapState,
    },
    {
      reason: 'a hole at index 1 of [1, <hole>, 3] (shown as null), which is no key',
      state: { order: 'min', items: withHoles(3, { 0: 1, 2: 3 }) } as HeapState,
    },
    {
      reason: 'only holes, [<hole>, <hole>] (shown as nulls), which are no keys',
      state: { order: 'max', items: withHoles(2, {}) } as HeapState,
    },
    {
      reason: 'a trailing hole in [1, 3, <hole>] (shown as null), which is no key',
      state: { order: 'min', items: withHoles(3, { 0: 1, 1: 3 }) } as HeapState,
    },
  ])('throws for $reason', ({ reason, state }) => {
    expect(
      () => encodeHeapShare(state),
      `encodeHeapShare(${show(state)}) must throw: ${reason} can't come from the visualiser`
    ).toThrow();
  });
});

describe('decodeHeapShare: an order alone is an empty heap', () => {
  it.each([
    { segment: 'max', expected: heap('max', []) },
    { segment: 'min', expected: heap('min', []) },
    { segment: 'MAX', expected: heap('max', []) },
    { segment: 'Min', expected: heap('min', []) },
  ])('decodes $segment', ({ segment, expected }) => {
    const actual = decodeSafely(segment);
    expect(
      actual,
      `decodeHeapShare(${show(segment)}) should be an empty 'heap' of that order (prefix not case-sensitive, order returned lowercase): expected ${show(expected)}, got ${show(actual)}`
    ).toEqual(expected);
  });
});

describe('decodeHeapShare: a prefixed key list', () => {
  it.each([
    { segment: 'max-340712', expected: heap('max', [34, 7, 12]) },
    { segment: 'min-071234', expected: heap('min', [7, 12, 34]) },
    { segment: 'max-42', expected: heap('max', [42]) },
    { segment: 'min-00', expected: heap('min', [0]) },
    { segment: 'max-9900', expected: heap('max', [99, 0]) },
    { segment: 'max-050505', expected: heap('max', [5, 5, 5]) },
    { segment: 'min-03030903', expected: heap('min', [3, 3, 9, 3]) },
    { segment: FULL_MAX_ENCODED, expected: heap('max', FULL_MAX) },
    { segment: FULL_MIN_ENCODED, expected: heap('min', FULL_MIN) },
    { segment: 'MAX-12', expected: heap('max', [12]) },
    { segment: 'Min-0712', expected: heap('min', [7, 12]) },
    { segment: 'mAx-340712', expected: heap('max', [34, 7, 12]) },
  ])("decodes $segment, a heap of its order, as 'heap'", ({ segment, expected }) => {
    const actual = decodeSafely(segment);
    expect(
      actual,
      `decodeHeapShare(${show(segment)}): the keys are a heap of the prefix's order (prefix not case-sensitive), so it loads as it stands: expected ${show(expected)}, got ${show(actual)}`
    ).toEqual(expected);
  });

  it.each([
    { segment: 'max-120734', expected: keys('max', [12, 7, 34]) },
    { segment: 'min-341207', expected: keys('min', [34, 12, 7]) },
    { segment: 'max-0399', expected: keys('max', [3, 99]) },
    { segment: 'min-9903', expected: keys('min', [99, 3]) },
    { segment: 'MIN-9903', expected: keys('min', [99, 3]) },
    { segment: 'MAX-120734', expected: keys('max', [12, 7, 34]) },
    { segment: 'min-999080706050403020100908070605', expected: keys('min', FULL_MAX) },
    { segment: 'max-000102030405060708091011121314', expected: keys('max', FULL_MIN) },
  ])(
    "decodes $segment, not a heap of its order, as 'keys' with that order",
    ({ segment, expected }) => {
      const actual = decodeSafely(segment);
      expect(
        actual,
        `decodeHeapShare(${show(segment)}): the keys aren't a heap of the prefix's order, so it loads by inserting them in order into that order: expected ${show(expected)}, got ${show(actual)}`
      ).toEqual(expected);
    }
  );
});

describe('decodeHeapShare: a plain key list', () => {
  it.each([
    { segment: '120734', expected: keys('max', [12, 7, 34]) },
    { segment: '340712', expected: keys('max', [34, 7, 12]) },
    { segment: '071234', expected: keys('max', [7, 12, 34]) },
    { segment: '00', expected: keys('max', [0]) },
    { segment: '0599', expected: keys('max', [5, 99]) },
    { segment: '050505', expected: keys('max', [5, 5, 5]) },
    { segment: '000102030405060708091011121314', expected: keys('max', FULL_MIN) },
  ])("decodes $segment as 'keys' into a max-heap", ({ segment, expected }) => {
    const actual = decodeSafely(segment);
    expect(
      actual,
      `decodeHeapShare(${show(segment)}): a key list with no prefix inserts the keys in order into a max-heap, even when they already form a heap: expected ${show(expected)}, got ${show(actual)}`
    ).toEqual(expected);
  });
});

describe('decodeHeapShare: malformed segments', () => {
  it.each([
    { label: 'a missing segment', segment: undefined },
    { label: 'an empty segment', segment: '' },
    { label: 'an unknown prefix alone', segment: 'mid' },
    { label: 'an unknown prefix with keys', segment: 'mid-12' },
    { label: 'a prefix that starts like max', segment: 'maxi-12' },
    { label: 'a shortened prefix', segment: 'm-12' },
    { label: "the hash table's empty segment", segment: 'empty' },
    { label: "the hash table's slots prefix", segment: 's1234' },
    { label: 'a prefix with no dash before the keys', segment: 'max12' },
    { label: 'a dash with no keys (max)', segment: 'max-' },
    { label: 'a dash with no keys (min)', segment: 'min-' },
    { label: 'a dash with no keys (uppercase)', segment: 'MAX-' },
    { label: 'a dash with no order', segment: '-12' },
    { label: 'two dashes', segment: 'max--12' },
    { label: 'a second dash between keys', segment: 'max-12-34' },
    { label: 'a trailing dash', segment: 'max-12-' },
    { label: 'a space instead of a dash', segment: 'max 12' },
    { label: 'a leading space', segment: ' max-12' },
    { label: 'a trailing space', segment: 'max-12 ' },
    { label: 'an odd number of digits after a prefix', segment: 'max-123' },
    { label: 'one digit after a prefix', segment: 'min-1' },
    { label: 'an odd number of plain digits', segment: '123' },
    { label: 'one plain digit', segment: '5' },
    { label: 'a letter among prefixed keys', segment: 'max-12a4' },
    { label: 'a letter among plain keys', segment: '12ab' },
    { label: 'only letters', segment: 'abcd' },
    { label: 'a sign among keys', segment: 'max-+1' },
    { label: 'a decimal point among keys', segment: 'max-1.' },
    { label: "the hash table's empty token", segment: 'max---' },
    { label: 'non-ASCII digits after a prefix', segment: 'max-١٢' },
    { label: 'non-ASCII digits with no prefix', segment: '١٢' },
    { label: '16 keys after a prefix', segment: `${FULL_MAX_ENCODED}01` },
    { label: '16 keys with no prefix', segment: '00'.repeat(16) },
  ])('returns undefined for $label ($segment)', ({ label, segment }) => {
    const actual = decodeSafely(segment);
    expect(
      actual,
      `decodeHeapShare(${show(segment)}) (${label}) is malformed and should be undefined, got ${show(actual)}`
    ).toBe(undefined);
  });

  it('accepts exactly 15 keys, with or without a prefix', () => {
    const prefixed = decodeSafely(FULL_MAX_ENCODED);
    const plain = decodeSafely('00'.repeat(15));
    expect(
      prefixed,
      `decodeHeapShare(${show(FULL_MAX_ENCODED)}) has 15 keys (the capacity) and should be accepted, got ${show(prefixed)}`
    ).toEqual(heap('max', FULL_MAX));
    expect(
      plain,
      `decodeHeapShare(${show('00'.repeat(15))}) has 15 keys (the capacity) and should be accepted, got ${show(plain)}`
    ).toEqual(
      keys(
        'max',
        Array.from({ length: 15 }, () => 0)
      )
    );
  });
});

describe('encode then decode round trip', () => {
  it.each([
    { label: 'an empty max-heap', state: { order: 'max', items: [] } as HeapState },
    { label: 'an empty min-heap', state: { order: 'min', items: [] } as HeapState },
    { label: 'one key, max', state: { order: 'max', items: [7] } as HeapState },
    { label: 'one key, min', state: { order: 'min', items: [7] } as HeapState },
    { label: 'key 0 alone, max', state: { order: 'max', items: [0] } as HeapState },
    { label: 'a max-heap', state: { order: 'max', items: [9, 4, 7, 1, 3] } as HeapState },
    { label: 'a min-heap', state: { order: 'min', items: [1, 3, 7, 4, 9] } as HeapState },
    { label: 'duplicates, max', state: { order: 'max', items: [8, 8, 2, 8, 8] } as HeapState },
    { label: 'duplicates, min', state: { order: 'min', items: [2, 2, 8, 2, 2] } as HeapState },
    { label: 'a full 15-key max-heap', state: { order: 'max', items: FULL_MAX } as HeapState },
    { label: 'a full 15-key min-heap', state: { order: 'min', items: FULL_MIN } as HeapState },
    {
      label: 'a full 15 equal keys, max',
      state: { order: 'max', items: Array.from({ length: 15 }, () => 99) } as HeapState,
    },
    {
      label: 'a full 15 equal keys, min',
      state: { order: 'min', items: Array.from({ length: 15 }, () => 0) } as HeapState,
    },
  ])('round-trips $label', ({ label, state }) => {
    const encoded = encodeHeapShare(state);
    const actual = decodeSafely(encoded);
    expect(
      actual,
      `decodeHeapShare(encodeHeapShare(${label} ${show(state)})) via ${show(encoded)} should give back the same heap: expected ${show({ kind: 'heap', state })}, got ${show(actual)}`
    ).toEqual({ kind: 'heap', state });
  });
});
