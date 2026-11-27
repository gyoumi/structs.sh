import { describe, expect, test } from 'vitest';
import type { HashSlot } from '@/Services/challenges/challenges';
import { encodeHashTableSlots } from '@/visualiser-src/hash-table-visualiser/util/shareEncoding';
import {
  findTopic,
  parseSharedData,
  parseSharedInitial,
  shareLink,
  topics,
  type SharedInitial,
} from './topics';

/**
 * Step 3a (docs/hash-table.md, checkpoint 3): the hash table is a topic like the others, marked
 * `requiresWasm`, and its links carry the whole 11-bucket table (tombstones included) through
 * `encodeHashTableSlots` / `decodeHashTableShare`. Every other topic keeps its two-digit links.
 */

const ORIGIN = 'https://structs.sh';
const show = (value: unknown) => JSON.stringify(value);

const E: HashSlot = { kind: 'empty' };
const X: HashSlot = { kind: 'tombstone' };
const key = (k: number): HashSlot => ({ kind: 'occupied', key: k });
const emptyTable = (): HashSlot[] => Array.from({ length: 11 }, () => ({ kind: 'empty' }));

/** 12 and 23 both hash to 1; 23 probed past 12 to slot 2. 34 was deleted from slot 3. 10 sits in slot 10. */
const TABLE_WITH_TOMBSTONE: HashSlot[] = [E, key(12), key(23), X, E, E, E, E, E, E, key(10)];
const TABLE_SEGMENT = 's--1223xx------------10';

describe('the hash-tables topic', () => {
  test('is listed with its title, names, operations and requiresWasm', () => {
    const topic = topics.find((t) => t.slug === 'hash-tables');
    expect(
      topic,
      `topics should include slug 'hash-tables'; slugs listed: ${show(topics.map((t) => t.slug))}`
    ).toBeDefined();
    const { slug, title, name, noun, requiresWasm, operations } = topic!;
    expect(
      { slug, title, name, noun, requiresWasm },
      'topics["hash-tables"]: slug, title, name, noun and requiresWasm'
    ).toEqual({
      slug: 'hash-tables',
      title: 'Hash Tables',
      name: 'Hash table',
      noun: 'hash table',
      requiresWasm: true,
    });
    expect(
      operations,
      'topics["hash-tables"].operations: the label for each engine command'
    ).toEqual({
      insert: 'Insert',
      search: 'Search',
      delete: 'Delete',
    });
    expect(
      topic!.description.trim().length,
      `topics["hash-tables"].description should be a sentence for the landing page, got ${show(topic!.description)}`
    ).toBeGreaterThan(0);
  });

  test('findTopic finds it by slug, ignoring case as for old links', () => {
    expect(findTopic('hash-tables')?.title, "findTopic('hash-tables')").toBe('Hash Tables');
    expect(findTopic('Hash-Tables')?.title, "findTopic('Hash-Tables')").toBe('Hash Tables');
  });

  test('only the hash table needs the wasm build: the other topics leave requiresWasm unset or false', () => {
    const others = topics.filter((t) => t.slug !== 'hash-tables' && t.requiresWasm);
    expect(
      others.map((t) => t.slug),
      'topics other than hash-tables marked requiresWasm: true (they draw without challenges.wasm)'
    ).toEqual([]);
  });
});

describe('shareLink for hash-tables encodes all 11 buckets', () => {
  test('a table with keys and a tombstone becomes /visualiser/hash-tables/s<22 chars>', () => {
    const link = shareLink('hash-tables', TABLE_WITH_TOMBSTONE, ORIGIN);
    expect(
      link,
      `shareLink('hash-tables', ${show(TABLE_WITH_TOMBSTONE)}, '${ORIGIN}'): -- empty, xx tombstone, two digits per key`
    ).toBe(`${ORIGIN}/visualiser/hash-tables/${TABLE_SEGMENT}`);
    expect(
      link,
      'shareLink for hash-tables should use exactly encodeHashTableSlots(slots) as the last path segment'
    ).toBe(`${ORIGIN}/visualiser/hash-tables/${encodeHashTableSlots(TABLE_WITH_TOMBSTONE)}`);
  });

  test('keys below 10 are padded to two digits so every bucket is two characters', () => {
    const slots = [key(0), key(1), E, E, E, key(5), E, E, E, E, E];
    expect(
      shareLink('hash-tables', slots, ORIGIN),
      `shareLink('hash-tables', ${show(slots)})`
    ).toBe(`${ORIGIN}/visualiser/hash-tables/s0001------05----------`);
  });

  test('a table of only tombstones is still a slot link, not empty', () => {
    const slots = Array.from({ length: 11 }, () => X);
    expect(
      shareLink('hash-tables', slots, ORIGIN),
      'shareLink of 11 tombstones (nothing stored, but DEL marks matter for probing)'
    ).toBe(`${ORIGIN}/visualiser/hash-tables/s${'xx'.repeat(11)}`);
  });

  test('a table of 11 empty buckets links to /visualiser/hash-tables/empty', () => {
    expect(
      shareLink('hash-tables', emptyTable(), ORIGIN),
      "shareLink('hash-tables', 11 empty slots)"
    ).toBe(`${ORIGIN}/visualiser/hash-tables/empty`);
  });
});

describe('shareLink for the other topics is unchanged', () => {
  const cases: {
    slug: 'linked-lists' | 'binary-search-trees' | 'avl-trees' | 'sorting-algorithms';
    data: number[];
    segment: string;
  }[] = [
    { slug: 'linked-lists', data: [10, 20, 30], segment: '102030' },
    { slug: 'binary-search-trees', data: [20, 5, 30], segment: '200530' },
    { slug: 'avl-trees', data: [], segment: 'empty' },
    { slug: 'sorting-algorithms', data: [3, 99, 0], segment: '039900' },
  ];
  test.each(cases)('$slug $data links to /visualiser/$slug/$segment', ({ slug, data, segment }) => {
    expect(shareLink(slug, data, ORIGIN), `shareLink('${slug}', ${show(data)}, '${ORIGIN}')`).toBe(
      `${ORIGIN}/visualiser/${slug}/${segment}`
    );
  });
});

describe('parseSharedInitial for hash-tables', () => {
  const read = (segment: string | undefined): SharedInitial | undefined =>
    parseSharedInitial('hash-tables', segment);

  test('a slot link gives back the exact buckets, tombstones included', () => {
    expect(read(TABLE_SEGMENT), `parseSharedInitial('hash-tables', '${TABLE_SEGMENT}')`).toEqual({
      state: TABLE_WITH_TOMBSTONE,
    });
  });

  test('a slot link is read case-insensitively, as decodeHashTableShare reads it', () => {
    expect(
      read('S--1223XX------------10'),
      "parseSharedInitial('hash-tables', 'S--1223XX------------10')"
    ).toEqual({
      state: TABLE_WITH_TOMBSTONE,
    });
  });

  test('empty gives 11 empty buckets as state', () => {
    expect(read('empty'), "parseSharedInitial('hash-tables', 'empty')").toEqual({
      state: emptyTable(),
    });
  });

  test('a plain two-digit link gives the keys to insert in order', () => {
    expect(read('122334'), "parseSharedInitial('hash-tables', '122334'): keys, not slots").toEqual([
      12, 23, 34,
    ]);
  });

  test('a missing segment gives undefined, so the page generates a table', () => {
    expect(read(undefined), "parseSharedInitial('hash-tables', undefined)").toBeUndefined();
  });

  const malformed = [
    's--12',
    's--1223xx------------1',
    'sab--------------------',
    '1',
    'zz',
    'abcd',
  ];
  test.each(malformed)("a malformed segment '%s' gives undefined", (segment) => {
    expect(read(segment), `parseSharedInitial('hash-tables', '${segment}')`).toBeUndefined();
  });

  test('a link made by shareLink reads back to the same buckets', () => {
    const slots = [key(44), X, key(13), E, key(48), E, X, E, E, key(9), key(21)];
    const segment = shareLink('hash-tables', slots, ORIGIN).split('/').pop();
    expect(
      read(segment),
      `round trip of ${show(slots)} through shareLink then parseSharedInitial (segment '${segment}')`
    ).toEqual({
      state: slots,
    });
  });

  test('a wrap-around chain bridged by occupied slots or tombstones is accepted', () => {
    const wrapped = [key(21), key(32), E, E, E, E, E, E, E, E, X];
    const segment = shareLink('hash-tables', wrapped, ORIGIN).split('/').pop();
    expect(
      read(segment),
      `parseSharedInitial('hash-tables', '${segment}'): 21 and 32 hash to 10 (tombstone) and wrap to 0 and 1`
    ).toEqual({
      state: wrapped,
    });
  });

  const invalidTables = [
    {
      label: 'unreachable key 12 in slot 0 while home slot 1 is empty',
      segment: 's12--------------------',
    },
    {
      label: 'unreachable wrap-around key 21 in slot 0 while home slot 10 is empty',
      segment: 's21--------------------',
    },
    {
      label: 'unreachable key 34 in slot 3 with empty gap at slot 2',
      segment: 's--12--34--------------',
    },
    {
      label: 'duplicate key 12 in adjacent slots 1 and 2',
      segment: 's--1212----------------',
    },
    {
      label: 'duplicate key 12 separated by a tombstone',
      segment: 's--12xx12--------------',
    },
  ];
  test.each(invalidTables)('rejects impossible slot state: $label', ({ segment }) => {
    expect(
      read(segment),
      `parseSharedInitial('hash-tables', '${segment}') must reject an unreachable or duplicate slot state`
    ).toBeUndefined();
  });
});

describe('parseSharedInitial for the other topics matches parseSharedData', () => {
  const segments: (string | undefined)[] = [
    '102030',
    'empty',
    undefined,
    '05',
    'abc',
    TABLE_SEGMENT,
  ];
  const slugs = ['linked-lists', 'binary-search-trees', 'avl-trees', 'sorting-algorithms'] as const;
  const pairs = slugs.flatMap((slug) => segments.map((segment) => ({ slug, segment })));

  test.each(pairs)('$slug $segment', ({ slug, segment }) => {
    expect(
      parseSharedInitial(slug, segment),
      `parseSharedInitial('${slug}', ${show(segment)}) should equal parseSharedData(${show(segment)}) = ${show(parseSharedData(segment))}`
    ).toEqual(parseSharedData(segment));
  });

  test('linked-lists 102030 gives [10, 20, 30] and empty gives []', () => {
    expect(
      parseSharedInitial('linked-lists', '102030'),
      "parseSharedInitial('linked-lists', '102030')"
    ).toEqual([10, 20, 30]);
    expect(
      parseSharedInitial('linked-lists', 'empty'),
      "parseSharedInitial('linked-lists', 'empty')"
    ).toEqual([]);
  });
});
