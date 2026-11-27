import { describe, expect, it } from 'vitest';
import type { HashSlot } from '@/Services/challenges/hashTableTypes';
import {
  HASH_TABLE_CAPACITY,
  decodeHashTableShare,
  encodeHashTableSlots,
  type ParsedHashTableShare,
} from './shareEncoding';

const EMPTY: HashSlot = { kind: 'empty' };
const TOMB: HashSlot = { kind: 'tombstone' };
const key = (k: number): HashSlot => ({ kind: 'occupied', key: k });

const emptySlots = (n = 11): HashSlot[] => Array.from({ length: n }, () => ({ kind: 'empty' }));

/** Slot 0 empty, slot 1 occupied 5, slot 2 tombstone, slot 3 occupied 23, slots 4..10 empty. */
const mixedSlots = (): HashSlot[] => [EMPTY, key(5), TOMB, key(23), ...emptySlots(7)];
const MIXED_ENCODED = 's--05xx23--------------';

const show = (value: unknown) => JSON.stringify(value);

describe('HASH_TABLE_CAPACITY', () => {
  it('is 11', () => {
    expect(HASH_TABLE_CAPACITY, 'HASH_TABLE_CAPACITY should be the fixed table size 11').toBe(11);
  });
});

describe('encodeHashTableSlots', () => {
  it("encodes 11 empty slots as 'empty'", () => {
    const actual = encodeHashTableSlots(emptySlots());
    expect(
      actual,
      `encodeHashTableSlots(11 empty slots) should be 'empty', got ${show(actual)}`
    ).toBe('empty');
  });

  it("encodes a mixed table as 's' followed by one two-character token per slot", () => {
    const actual = encodeHashTableSlots(mixedSlots());
    expect(
      actual,
      `encodeHashTableSlots([empty, 5, tombstone, 23, 7×empty]) should be ${show(MIXED_ENCODED)}, got ${show(actual)}`
    ).toBe(MIXED_ENCODED);
    expect(
      actual.length,
      `encoded mixed table should be 23 chars ('s' + 11×2), got ${actual.length}`
    ).toBe(23);
  });

  it('zero-pads single-digit keys to two digits', () => {
    const slots = [key(0), key(7), ...emptySlots(9)];
    const expected = `s0007${'--'.repeat(9)}`;
    const actual = encodeHashTableSlots(slots);
    expect(
      actual,
      `encodeHashTableSlots([0, 7, 9×empty]) should zero-pad keys to ${show(expected)}, got ${show(actual)}`
    ).toBe(expected);
  });

  it("encodes keys 10 and 99 as '10' and '99'", () => {
    const slots = [key(10), key(99), ...emptySlots(9)];
    const expected = `s1099${'--'.repeat(9)}`;
    const actual = encodeHashTableSlots(slots);
    expect(
      actual,
      `encodeHashTableSlots([10, 99, 9×empty]) should be ${show(expected)}, got ${show(actual)}`
    ).toBe(expected);
  });

  it("encodes an all-tombstone table with 'xx' tokens, not as 'empty'", () => {
    const slots: HashSlot[] = Array.from({ length: 11 }, () => ({ kind: 'tombstone' }));
    const expected = `s${'xx'.repeat(11)}`;
    const actual = encodeHashTableSlots(slots);
    expect(
      actual,
      `encodeHashTableSlots(11 tombstones) has no keys but is not empty: expected ${show(expected)}, got ${show(actual)}`
    ).toBe(expected);
  });

  it('encodes a full table of occupied keys', () => {
    const slots = Array.from({ length: 11 }, (_, i) => key(i * 9));
    const expected = 's0009182736455463728190';
    const actual = encodeHashTableSlots(slots);
    expect(
      actual,
      `encodeHashTableSlots(keys 0,9,18,...,90) should be ${show(expected)}, got ${show(actual)}`
    ).toBe(expected);
  });

  it.each([
    { label: '[] (0 slots)', slots: emptySlots(0), length: 0 },
    { label: '5 empty slots', slots: emptySlots(5), length: 5 },
    { label: '12 empty slots', slots: emptySlots(12), length: 12 },
    { label: '10 mixed slots', slots: mixedSlots().slice(0, 10), length: 10 },
  ])('throws for $label, naming 11 and the actual length', ({ label, slots, length }) => {
    expect(
      () => encodeHashTableSlots(slots),
      `encodeHashTableSlots(${label}) must throw (wrong length, even if every slot is empty) with a message containing '11'`
    ).toThrow(/11/);
    expect(
      () => encodeHashTableSlots(slots),
      `encodeHashTableSlots(${label}) must throw with a message naming the actual length ${length}`
    ).toThrow(new RegExp(`\\b${length}\\b`));
  });

  it.each([
    { bad: -1, pattern: /-1/ },
    { bad: 100, pattern: /100/ },
    { bad: 1.5, pattern: /1\.5/ },
    { bad: Number.NaN, pattern: /NaN/ },
  ])('throws for occupied key $bad, naming the key', ({ bad, pattern }) => {
    const slots = [key(5), key(bad), ...emptySlots(9)];
    expect(
      () => encodeHashTableSlots(slots),
      `encodeHashTableSlots([5, ${bad}, 9×empty]) must throw: keys must be integers 0..99, and the message should name ${bad}`
    ).toThrow(pattern);
  });
});

describe('decodeHashTableShare', () => {
  it.each([
    { label: 'undefined', segment: undefined },
    { label: "''", segment: '' },
  ])('returns undefined for $label', ({ segment }) => {
    const actual = decodeHashTableShare(segment);
    expect(
      actual,
      `decodeHashTableShare(${show(segment)}) should be undefined, got ${show(actual)}`
    ).toBe(undefined);
  });

  it("decodes 'empty' as 11 empty slots", () => {
    const actual = decodeHashTableShare('empty');
    expect(
      actual,
      `decodeHashTableShare('empty') should be { kind: 'slots', slots: 11×empty }, got ${show(actual)}`
    ).toEqual({ kind: 'slots', slots: emptySlots() });
  });

  it("decodes a lowercase 's' segment into slots", () => {
    const actual = decodeHashTableShare(MIXED_ENCODED);
    expect(
      actual,
      `decodeHashTableShare(${show(MIXED_ENCODED)}) should be slots [empty, 5, tombstone, 23, 7×empty], got ${show(actual)}`
    ).toEqual({ kind: 'slots', slots: mixedSlots() });
  });

  it("decodes an uppercase 'S' segment with 'XX' tombstones", () => {
    const segment = 'S--05XX23--------------';
    const actual = decodeHashTableShare(segment);
    expect(
      actual,
      `decodeHashTableShare(${show(segment)}) should accept uppercase S/XX and give [empty, 5, tombstone, 23, 7×empty], got ${show(actual)}`
    ).toEqual({ kind: 'slots', slots: mixedSlots() });
  });

  it("decodes '00' tokens as key 0 and '07' as key 7", () => {
    const segment = `s0007${'--'.repeat(9)}`;
    const actual = decodeHashTableShare(segment);
    expect(
      actual,
      `decodeHashTableShare(${show(segment)}) should give [0, 7, 9×empty], got ${show(actual)}`
    ).toEqual({ kind: 'slots', slots: [key(0), key(7), ...emptySlots(9)] });
  });

  it.each([
    { label: "'s' alone", segment: 's' },
    { label: "'s--' (1 token)", segment: 's--' },
    { label: "'s' + 10 tokens (21 chars)", segment: `s${'--'.repeat(10)}` },
    { label: "'s' + 12 tokens (25 chars)", segment: `s${'--'.repeat(12)}` },
    { label: "'s' + 11 tokens + 1 extra char (24 chars)", segment: `s${'--'.repeat(11)}5` },
    { label: "token 'ab'", segment: `sab${'--'.repeat(10)}` },
    { label: "token '-x'", segment: `s-x${'--'.repeat(10)}` },
    { label: "token '5-'", segment: `s5-${'--'.repeat(10)}` },
    { label: "token 'x5'", segment: `sx5${'--'.repeat(10)}` },
    { label: "token ' 5'", segment: `s 5${'--'.repeat(10)}` },
    { label: "non-ASCII digits '١٢'", segment: `s١٢${'--'.repeat(10)}` },
    { label: "prefix 't' instead of 's'", segment: `t${'--'.repeat(11)}` },
  ])('returns undefined for a malformed slots segment: $label', ({ segment }) => {
    let actual: ParsedHashTableShare | undefined;
    expect(
      () => {
        actual = decodeHashTableShare(segment);
      },
      `decodeHashTableShare(${show(segment)}) must never throw`
    ).not.toThrow();
    expect(
      actual,
      `decodeHashTableShare(${show(segment)}) should be undefined, got ${show(actual)}`
    ).toBe(undefined);
  });

  it.each([
    { segment: '122334', keys: [12, 23, 34] },
    { segment: '00', keys: [0] },
    { segment: '0599', keys: [5, 99] },
  ])('decodes the plain key list $segment as keys', ({ segment, keys }) => {
    const actual = decodeHashTableShare(segment);
    expect(
      actual,
      `decodeHashTableShare(${show(segment)}) should fall back to { kind: 'keys', keys: ${show(keys)} }, got ${show(actual)}`
    ).toEqual({ kind: 'keys', keys });
  });

  it.each([
    { label: 'odd digit count', segment: '123' },
    { label: 'single digit', segment: '5' },
    { label: 'letters', segment: 'abc' },
    { label: 'digits then letters', segment: '12ab' },
    { label: 'dashes only', segment: '--' },
    { label: 'non-ASCII digits', segment: '١٢' },
    { label: 'negative number', segment: '-12' },
  ])('returns undefined for a malformed segment: $label ($segment)', ({ segment }) => {
    let actual: ParsedHashTableShare | undefined;
    expect(
      () => {
        actual = decodeHashTableShare(segment);
      },
      `decodeHashTableShare(${show(segment)}) must never throw`
    ).not.toThrow();
    expect(
      actual,
      `decodeHashTableShare(${show(segment)}) should be undefined, got ${show(actual)}`
    ).toBe(undefined);
  });
});

describe('encode then decode round trip', () => {
  it.each([
    { label: 'empty table', slots: emptySlots() },
    { label: 'mixed empty/occupied/tombstone', slots: mixedSlots() },
    {
      label: 'single-digit keys 0 and 7',
      slots: [key(0), ...emptySlots(5), key(7), ...emptySlots(4)],
    },
    {
      label: 'all tombstones',
      slots: Array.from({ length: 11 }, (): HashSlot => ({ kind: 'tombstone' })),
    },
    { label: 'full table', slots: Array.from({ length: 11 }, (_, i) => key(99 - i * 7)) },
  ])('round-trips $label', ({ label, slots }) => {
    const encoded = encodeHashTableSlots(slots);
    const actual = decodeHashTableShare(encoded);
    expect(
      actual,
      `decodeHashTableShare(encodeHashTableSlots(${label})) via ${show(encoded)} should give back the same slots ${show(slots)}, got ${show(actual)}`
    ).toEqual({ kind: 'slots', slots });
  });
});
