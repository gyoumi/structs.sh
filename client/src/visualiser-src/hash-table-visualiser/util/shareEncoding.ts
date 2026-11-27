import type { HashSlot } from '@/Services/challenges/challenges';

export const HASH_TABLE_CAPACITY = 11;

/** A shared hash table: either every bucket as it stands, or keys to insert in order. */
export type ParsedHashTableShare =
  | { kind: 'slots'; slots: HashSlot[] }
  | { kind: 'keys'; keys: number[] };

const EMPTY_SEGMENT = 'empty';
const EMPTY_TOKEN = '--';
const TOMBSTONE_TOKEN = 'xx';
const TWO_DIGITS = /^[0-9]{2}$/;
const KEY_LIST = /^(?:[0-9]{2})+$/;

const isShareableKey = (key: number): boolean => Number.isInteger(key) && key >= 0 && key <= 99;

const emptySlots = (): HashSlot[] =>
  Array.from({ length: HASH_TABLE_CAPACITY }, () => ({ kind: 'empty' }));

const encodeSlot = (slot: HashSlot): string => {
  if (slot.kind === 'empty') return EMPTY_TOKEN;
  if (slot.kind === 'tombstone') return TOMBSTONE_TOKEN;
  if (!isShareableKey(slot.key)) {
    throw new Error(`Hash table share encoding needs keys from 0 to 99, got ${String(slot.key)}.`);
  }
  return String(slot.key).padStart(2, '0');
};

/** Encodes all 11 buckets as one URL segment: `empty`, or `s` and a two-character token per bucket. */
export const encodeHashTableSlots = (slots: readonly HashSlot[]): string => {
  if (slots.length !== HASH_TABLE_CAPACITY) {
    throw new Error(
      `Hash table share encoding requires ${HASH_TABLE_CAPACITY} slots, got ${slots.length}.`
    );
  }
  const tokens = slots.map(encodeSlot);
  if (slots.every((slot) => slot.kind === 'empty')) return EMPTY_SEGMENT;
  return `s${tokens.join('')}`;
};

const decodeSlot = (chunk: string): HashSlot | undefined => {
  if (chunk === EMPTY_TOKEN) return { kind: 'empty' };
  if (chunk.toLowerCase() === TOMBSTONE_TOKEN) return { kind: 'tombstone' };
  if (TWO_DIGITS.test(chunk)) return { kind: 'occupied', key: Number(chunk) };
  return undefined;
};

const chunksOf = (text: string): string[] =>
  Array.from({ length: Math.ceil(text.length / 2) }, (_, i) => text.slice(i * 2, i * 2 + 2));

const decodeSlots = (segment: string): ParsedHashTableShare | undefined => {
  if (segment.length !== 1 + HASH_TABLE_CAPACITY * 2) return undefined;
  const slots = chunksOf(segment.slice(1)).map(decodeSlot);
  if (!slots.every((slot): slot is HashSlot => slot !== undefined)) return undefined;
  return { kind: 'slots', slots };
};

/** Reads a shared URL segment back, or undefined when it is missing or malformed. */
export const decodeHashTableShare = (
  segment: string | undefined
): ParsedHashTableShare | undefined => {
  if (!segment) return undefined;
  if (segment === EMPTY_SEGMENT) return { kind: 'slots', slots: emptySlots() };
  if (segment.startsWith('s') || segment.startsWith('S')) return decodeSlots(segment);
  if (KEY_LIST.test(segment)) return { kind: 'keys', keys: chunksOf(segment).map(Number) };
  return undefined;
};
