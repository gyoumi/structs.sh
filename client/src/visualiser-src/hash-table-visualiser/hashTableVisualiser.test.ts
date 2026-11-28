// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { HashSlot } from '@/Services/challenges/challenges';
import { setCanvasTheme } from '@/visualiser-src/common/canvasTheme';
import { canvasThemes } from '@/visualiser/canvasThemes';
import {
  CAPACITY,
  K,
  T,
  allShownValues,
  canvasMarkup,
  expectedValues,
  isDashed,
  isShown,
  pictureOf,
  positionOf,
  resetCanvases,
  setUpHashTableEnvironment,
  show,
  slotElement,
  slotElements,
  table,
  wasmLoad,
  wasmRun,
  wrapShown,
} from '@/test/hashTableVisualiser';
import GraphicalHashTable from './data-structure/GraphicalHashTable';
import { deleteCodeSnippet, insertCodeSnippet, searchCodeSnippet } from './util/codeSnippets';

/** GraphicalHashTable's state API and its static drawing. Needs `pnpm run challenges` first. */

setUpHashTableEnvironment();

beforeEach(() => {
  setCanvasTheme(canvasThemes.light);
  resetCanvases();
});

afterEach(() => setCanvasTheme());

const MIXED = table({ 0: K(22), 3: T, 4: K(14), 5: T, 7: K(7), 10: K(10) });

const expectDrawn = (slots: readonly HashSlot[], label: string) => {
  const indices = slotElements().map((el) => el.getAttribute('data-hash-slot'));
  expect(
    [...indices].sort((a, b) => Number(a) - Number(b)),
    `${label}: canvas should hold exactly one [data-hash-slot] per bucket "0".."10"; found ${show(indices)}`
  ).toEqual(Array.from({ length: CAPACITY }, (_, i) => String(i)));
  expect(
    allShownValues(),
    `${label}: shown [data-hash-value] text per bucket should be blank / key / "DEL" for ${pictureOf(slots)}`
  ).toEqual(slots.map(expectedValues));
};

describe('GraphicalHashTable state API', () => {
  it('documentation lists insert, search and delete, each taking one value', () => {
    const { documentation } = new GraphicalHashTable();
    const ids = ['insert', 'search', 'delete'].map((command) => {
      const usage = documentation[command];
      expect(
        usage,
        `documentation.${command} should exist; commands were ${show(Object.keys(documentation))}`
      ).toBeDefined();
      expect(usage.args, `documentation.${command}.args`).toEqual(['value']);
      expect(
        typeof usage.description === 'string' && usage.description.trim().length > 0,
        `documentation.${command}.description should be non-empty, got ${show(usage.description)}`
      ).toBe(true);
      expect(
        typeof usage.id,
        `documentation.${command}.id should be a number, got ${show(usage.id)}`
      ).toBe('number');
      return usage.id;
    });
    expect(new Set(ids).size, `insert/search/delete ids should differ, got ${show(ids)}`).toBe(3);
  });

  it('a new table has 11 empty slots and no data', () => {
    const hashTable = new GraphicalHashTable();
    expect(hashTable.slots, 'new GraphicalHashTable().slots').toEqual(table());
    expect(hashTable.data, 'new GraphicalHashTable().data').toEqual([]);
  });

  it.each([
    { keys: [1, 12, 23], note: 'collisions at 1 probe on to 2 and 3' },
    { keys: [10, 21, 32, 5], note: 'collisions at 10 wrap to 0 and 1' },
    { keys: [5, 5, 16], note: 'a repeated key is stored once' },
  ])('load($keys) inserts in order with linear probing ($note)', ({ keys }) => {
    const hashTable = new GraphicalHashTable();
    hashTable.load(keys);
    const expected = wasmLoad(keys);
    expect(
      hashTable.slots,
      `load(${show(keys)}) slots: expected ${pictureOf(expected)}, got ${pictureOf(hashTable.slots)}`
    ).toEqual(expected);
    const occupied = expected.flatMap((s) => (s.kind === 'occupied' ? [s.key] : []));
    expect(
      hashTable.data,
      `load(${show(keys)}).data should list keys in bucket order 0..10`
    ).toEqual(occupied);
    expectDrawn(expected, `load(${show(keys)})`);
  });

  it('load(values) on a used table starts again from 11 empty slots', () => {
    const hashTable = new GraphicalHashTable();
    hashTable.loadSlots(MIXED);
    hashTable.load([3]);
    expect(hashTable.slots, `loadSlots(${pictureOf(MIXED)}) then load([3])`).toEqual(
      table({ 3: K(3) })
    );
    expectDrawn(table({ 3: K(3) }), 'loadSlots(MIXED) then load([3])');
  });

  it('hand check: load([10, 21, 32]) puts 10 at slot 10 and wraps 21 to 0 and 32 to 1', () => {
    const hashTable = new GraphicalHashTable();
    hashTable.load([10, 21, 32]);
    expect(hashTable.data, 'load([10, 21, 32]).data in bucket order').toEqual([21, 32, 10]);
    expect(hashTable.slots[10], 'load([10, 21, 32]) slot 10').toEqual(K(10));
  });

  it('loadSlots keeps tombstones exactly and draws them', () => {
    const hashTable = new GraphicalHashTable();
    hashTable.loadSlots(MIXED);
    expect(hashTable.slots, `loadSlots(${pictureOf(MIXED)}).slots`).toEqual(MIXED);
    expect(hashTable.data, `loadSlots(${pictureOf(MIXED)}).data`).toEqual([22, 14, 7, 10]);
    expectDrawn(MIXED, `loadSlots(${pictureOf(MIXED)})`);
  });

  it.each([0, 10, 12])('loadSlots with %i slots throws an Error', (length) => {
    const hashTable = new GraphicalHashTable();
    const slots = Array.from({ length }, (): HashSlot => ({ kind: 'empty' }));
    expect(
      () => hashTable.loadSlots(slots),
      `loadSlots(${length} slots) should throw (needs 11)`
    ).toThrow(Error);
  });

  it('slots and snapshotState return copies that callers cannot use to change the table', () => {
    const hashTable = new GraphicalHashTable();
    hashTable.loadSlots(MIXED);
    const { slots } = hashTable;
    slots[1] = K(99);
    slots.push(K(98));
    expect(
      hashTable.slots,
      'after editing the array from .slots, the table should be unchanged'
    ).toEqual(MIXED);
    const snapshot = hashTable.snapshotState();
    expect(snapshot, `snapshotState() of ${pictureOf(MIXED)} keeps tombstones`).toEqual(MIXED);
    snapshot[2] = K(97);
    expect(
      hashTable.slots,
      'after editing the snapshotState() array, the table should be unchanged'
    ).toEqual(MIXED);
  });

  it('restoreState(snapshot) rebuilds tombstones, and later operations leave the snapshot alone', () => {
    const source = new GraphicalHashTable();
    source.loadSlots(MIXED);
    const snapshot = source.snapshotState();
    resetCanvases();
    const restored = new GraphicalHashTable();
    restored.restoreState(snapshot);
    expect(restored.slots, `restoreState(snapshot of ${pictureOf(MIXED)})`).toEqual(MIXED);
    expectDrawn(MIXED, 'restoreState(snapshot)');
    restored.insert(25);
    expect(
      snapshot,
      'insert(25) after restoreState(snapshot) must not change the snapshot array (a retheme may restore it again)'
    ).toEqual(MIXED);
  });

  it('restoreState(number[]) loads the keys like load()', () => {
    const hashTable = new GraphicalHashTable();
    hashTable.restoreState([1, 12]);
    expect(hashTable.slots, 'restoreState([1, 12])').toEqual(wasmLoad([1, 12]));
  });

  it('restoreState([]) on a used table starts again from 11 empty slots', () => {
    const hashTable = new GraphicalHashTable();
    hashTable.loadSlots(MIXED);
    expect(
      () => hashTable.restoreState([]),
      `loadSlots(${pictureOf(MIXED)}) then restoreState([]) should not throw`
    ).not.toThrow();
    expect(hashTable.slots, `loadSlots(${pictureOf(MIXED)}) then restoreState([])`).toEqual(
      table()
    );
    expect(hashTable.data, 'restoreState([]).data').toEqual([]);
    expectDrawn(table(), 'loadSlots(MIXED) then restoreState([])');
  });

  it('generate() fills 5–6 distinct keys 0..99 with at least one collision (20 runs)', () => {
    for (let run = 1; run <= 20; run += 1) {
      resetCanvases();
      const hashTable = new GraphicalHashTable();
      hashTable.generate();
      const { slots } = hashTable;
      const label = `generate() run ${run} gave ${pictureOf(slots)}`;
      expect(slots.length, `${label}: slot count`).toBe(CAPACITY);
      expect(
        slots.some((s) => s.kind === 'tombstone'),
        `${label}: no tombstones`
      ).toBe(false);
      const keys = slots.flatMap((s) => (s.kind === 'occupied' ? [s.key] : []));
      expect(
        keys.length >= 5 && keys.length <= 6,
        `${label}: 5 or 6 keys, got ${keys.length}`
      ).toBe(true);
      expect(new Set(keys).size, `${label}: keys distinct`).toBe(keys.length);
      expect(
        keys.every((k) => Number.isInteger(k) && k >= 0 && k <= 99),
        `${label}: keys in 0..99`
      ).toBe(true);
      const homes = keys.map((k) => k % CAPACITY);
      expect(
        new Set(homes).size < homes.length,
        `${label}: two keys should share key % 11; homes ${show(homes)}`
      ).toBe(true);
      keys.forEach((key) => {
        const result = wasmRun(slots, { kind: 'search', key });
        expect(
          result.steps.at(-1)?.kind,
          `${label}: search(${key}) on the generated table should be found (a real linear-probing layout)`
        ).toBe('found');
      });
      expect(hashTable.data, `${label}: data`).toEqual(keys);
      expectDrawn(slots, label);
    }
  });
});

describe('GraphicalHashTable static drawing', () => {
  it('draws the 11 buckets left to right on one row, each labelled with its index', () => {
    new GraphicalHashTable().loadSlots(MIXED);
    const points = Array.from({ length: CAPACITY }, (_, i) => {
      const slot = slotElement(i);
      if (!slot) throw new Error(`loadSlots(MIXED): no [data-hash-slot="${i}"] in the canvas`);
      const index = slot.querySelector('[data-hash-index]');
      expect(
        isShown(index) ? index?.textContent?.trim() : '<hidden or missing>',
        `[data-hash-slot="${i}"] should hold a shown [data-hash-index] reading "${i}"`
      ).toBe(String(i));
      return positionOf(slot);
    });
    points.slice(1).forEach((point, i) => {
      expect(
        point.x > points[i].x,
        `slot ${i + 1} x (${point.x}) should be right of slot ${i} x (${points[i].x}); positions ${show(points)}`
      ).toBe(true);
      expect(
        Math.abs(point.y - points[0].y) < 0.5,
        `slot ${i + 1} y (${point.y}) should equal slot 0 y (${points[0].y}): one horizontal row`
      ).toBe(true);
    });
  });

  it('draws tombstones dashed and labelled DEL, other buckets solid', () => {
    new GraphicalHashTable().loadSlots(MIXED);
    MIXED.forEach((slot, i) => {
      expect(
        isDashed(i),
        `loadSlots(${pictureOf(MIXED)}): slot ${i} (${slot.kind}) ${slot.kind === 'tombstone' ? 'should' : 'should not'} have a shown element with stroke-dasharray`
      ).toBe(slot.kind === 'tombstone');
    });
  });

  it('keeps the canvas free of operation banners and hides the wrap cue when idle', () => {
    new GraphicalHashTable().load([1, 12]);
    expect(
      document.querySelector('[data-hash-banner]'),
      'load([1, 12]): operation status belongs in CodePanel, not on the SVG canvas'
    ).toBeNull();
    expect(
      wrapShown(),
      'load([1, 12]): [data-hash-wrap] should be absent or hidden before any probe'
    ).toBe(false);
  });

  it.each([
    { name: 'light', other: 'dark' },
    { name: 'dark', other: 'light' },
  ] as const)('draws in the $name canvas theme colours only', ({ name, other }) => {
    setCanvasTheme(canvasThemes[name]);
    new GraphicalHashTable().loadSlots(MIXED);
    const markup = canvasMarkup();
    const { nodeFill, ink } = canvasThemes[name];
    const others = canvasThemes[other];
    expect(
      markup.includes(String(nodeFill).toLowerCase()),
      `${name} theme: some fill should be nodeFill ${nodeFill}`
    ).toBe(true);
    expect(
      markup.includes(String(ink).toLowerCase()),
      `${name} theme: some stroke or text should be ink ${ink}`
    ).toBe(true);
    [others.ink, others.nodeFill].forEach((colour) => {
      expect(
        markup.includes(String(colour).toLowerCase()),
        `${name} theme: the ${other} theme colour ${colour} must not appear in the canvas`
      ).toBe(false);
    });
  });
});

describe('COMP2521 C snippets', () => {
  it.each([
    { name: 'insertCodeSnippet', code: insertCodeSnippet, needsDeleted: true },
    { name: 'searchCodeSnippet', code: searchCodeSnippet, needsDeleted: false },
    { name: 'deleteCodeSnippet', code: deleteCodeSnippet, needsDeleted: true },
  ])('$name is a multi-line C function', ({ name, code, needsDeleted }) => {
    expect(typeof code, `${name} should be a string`).toBe('string');
    expect(
      code.split('\n').length >= 3,
      `${name} should span at least 3 lines, got ${show(code)}`
    ).toBe(true);
    expect(code.includes('{') && code.includes('}'), `${name} should be a braced C function`).toBe(
      true
    );
    if (needsDeleted) {
      expect(code.includes('DELETED'), `${name} should use the DELETED tombstone state`).toBe(true);
    }
  });

  it('the three snippets differ', () => {
    expect(
      new Set([insertCodeSnippet, searchCodeSnippet, deleteCodeSnippet]).size,
      'distinct snippets'
    ).toBe(3);
  });
});
