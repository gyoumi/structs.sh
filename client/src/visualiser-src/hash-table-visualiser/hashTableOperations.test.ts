// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HashOp, HashRunResult, HashSlot } from '@/Services/challenges/challenges';
import type { DrawingBounds } from '@/visualiser-src/common/AnimationProducer';
import { canvasTheme, setCanvasTheme } from '@/visualiser-src/common/canvasTheme';
import GraphicalDataStructureFactory from '@/visualiser-src/common/GraphicalDataStructureFactory';
import { canvasThemes } from '@/visualiser/canvasThemes';
import { VisualiserSession } from '@/visualiser/session';
import {
  K,
  T,
  allShownValues,
  bannerText,
  canvasMarkup,
  expectedValues,
  highlightCoversDash,
  isDashed,
  pictureOf,
  play,
  positionOf,
  resetCanvases,
  setUpHashTableEnvironment,
  show,
  slotElement,
  slotLook,
  stepBothWaysProblems,
  stopProblems,
  table,
  validBox,
  wasmRun,
  withFrameClock,
  wrapStepIndices,
} from '@/test/hashTableVisualiser';
import HashTableAnimationProducer from './animation-producer/HashTableAnimationProducer';
import GraphicalHashTable from './data-structure/GraphicalHashTable';
import { deleteCodeSnippet, insertCodeSnippet, searchCodeSnippet } from './util/codeSnippets';

/** GraphicalHashTable operations played through VisualiserController. Needs `pnpm run challenges` first. */

setUpHashTableEnvironment();

beforeEach(() => {
  setCanvasTheme(canvasThemes.light);
  resetCanvases();
});

afterEach(() => {
  vi.restoreAllMocks();
  setCanvasTheme();
});

type Case = {
  label: string;
  start: HashSlot[];
  op: HashOp;
  terminal: string;
  outcome: RegExp;
  wraps: boolean;
};

const ins = (key: number): HashOp => ({ kind: 'insert', key });
const find = (key: number): HashOp => ({ kind: 'search', key });
const del = (key: number): HashOp => ({ kind: 'delete', key });
const FULL = Array.from({ length: 11 }, (_, i) => K(i));

const CASES: Case[] = [
  {
    label: 'insert 23 into an empty table (direct)',
    start: table(),
    op: ins(23),
    terminal: 'place',
    outcome: /placed/i,
    wraps: false,
  },
  {
    label: 'insert 32 past 10@10 and 21@0 (wraps 10 → 0)',
    start: table({ 0: K(21), 10: K(10) }),
    op: ins(32),
    terminal: 'place',
    outcome: /placed/i,
    wraps: true,
  },
  {
    label: 'insert 14 already at 4, past the tombstone at 3',
    start: table({ 3: T, 4: K(14) }),
    op: ins(14),
    terminal: 'alreadyPresent',
    outcome: /already present/i,
    wraps: false,
  },
  {
    label: 'insert 25 reuses the first tombstone (3, not 5)',
    start: table({ 3: T, 4: K(14), 5: T }),
    op: ins(25),
    terminal: 'place',
    outcome: /placed/i,
    wraps: false,
  },
  {
    label: 'insert 13 into a full table (wraps 10 → 0)',
    start: FULL,
    op: ins(13),
    terminal: 'tableFull',
    outcome: /table is full/i,
    wraps: true,
  },
  {
    label: 'search 14 past the tombstone at 3',
    start: table({ 3: T, 4: K(14) }),
    op: find(14),
    terminal: 'found',
    outcome: /(?<!not )found/i,
    wraps: false,
  },
  {
    label: 'search 14 misses at the empty slot 4',
    start: table({ 3: K(3) }),
    op: find(14),
    terminal: 'notFound',
    outcome: /not found/i,
    wraps: false,
  },
  {
    label: 'delete 14 at slot 4 marks DEL',
    start: table({ 3: K(3), 4: K(14) }),
    op: del(14),
    terminal: 'markTombstone',
    outcome: /deleted/i,
    wraps: false,
  },
  {
    label: 'delete 7 misses in an empty table',
    start: table(),
    op: del(7),
    terminal: 'notFound',
    outcome: /not found/i,
    wraps: false,
  },
  {
    label: 'search 13 misses across a full table (wraps 10 → 0)',
    start: FULL,
    op: find(13),
    terminal: 'notFound',
    outcome: /not found/i,
    wraps: true,
  },
  {
    label: 'delete 13 misses across a full table (wraps 10 → 0)',
    start: FULL,
    op: del(13),
    terminal: 'notFound',
    outcome: /not found/i,
    wraps: true,
  },
];

const SNIPPETS = {
  insert: insertCodeSnippet,
  search: searchCodeSnippet,
  delete: deleteCodeSnippet,
};

const describeOp = ({ kind, key }: HashOp) => `${kind}(${key})`;

const runCase = (c: Case) => {
  const hashTable = new GraphicalHashTable();
  hashTable.loadSlots(c.start);
  const wasm = wasmRun(c.start, c.op);
  expect(wasm.steps.at(-1)?.kind, `fixture check: wasm ${c.label} ends with ${c.terminal}`).toBe(
    c.terminal
  );
  const producer = hashTable[c.op.kind](c.op.key);
  return { hashTable, wasm, producer };
};

describe.each(CASES)('$label', (c) => {
  const name = `${pictureOf(c.start)} ${describeOp(c.op)}`;

  it('updates slots to the wasm result and returns a HashTableAnimationProducer', () => {
    const { hashTable, wasm, producer } = runCase(c);
    expect(
      producer instanceof HashTableAnimationProducer,
      `${name}: returns a HashTableAnimationProducer`
    ).toBe(true);
    expect(
      hashTable.slots,
      `${name}: slots after the call should be the wasm's ${pictureOf(wasm.slots)}`
    ).toEqual(wasm.slots);
  });

  it('shows the C snippet, valid code lines, and bounds and focus on every step', () => {
    const { wasm, producer } = runCase(c);
    expect(producer.code, `${name}: producer.code should be the ${c.op.kind} snippet`).toBe(
      SNIPPETS[c.op.kind]
    );
    const lineCount = producer.code.split('\n').length;
    const runners = producer.allRunners;
    expect(
      runners.length >= wasm.steps.length,
      `${name}: ${runners.length} RunnerInfo steps, want at least one per wasm step (${wasm.steps.length}: ${show(wasm.steps.map((s) => s.kind))})`
    ).toBe(true);
    const lines = runners.map((r) => r.line);
    expect(
      lines.every(
        (line) => Number.isInteger(line) && (line as number) >= 1 && (line as number) <= lineCount
      ),
      `${name}: every RunnerInfo.line should be 1..${lineCount}; got ${show(lines)}`
    ).toBe(true);
    expect(
      new Set(lines).size >= 2,
      `${name}: steps should highlight at least 2 different lines; got ${show(lines)}`
    ).toBe(true);
    runners.forEach((r, i) => {
      expect(
        validBox(r.bounds),
        `${name}: RunnerInfo ${i} bounds should have positive size, got ${show(r.bounds)}`
      ).toBe(true);
      expect(
        validBox(r.focus),
        `${name}: RunnerInfo ${i} focus should have positive size, got ${show(r.focus)}`
      ).toBe(true);
    });
    const left = positionOf(slotElement(0) as Element).x;
    const right = positionOf(slotElement(10) as Element).x;
    runners.forEach((r, i) => {
      const box = r.bounds as DrawingBounds;
      expect(
        box.x <= left && box.x + box.width >= right,
        `${name}: RunnerInfo ${i} bounds ${show(box)} should span the strip from slot 0 x=${left} to slot 10 x=${right}`
      ).toBe(true);
    });
  });

  it('plays on VisualiserController with a live probe count', () => {
    const { wasm, producer } = runCase(c);
    const controller = play(producer);
    const { duration, stepTimes } = controller;
    expect(duration > 0, `${name}: controller.duration should be > 0, got ${duration}`).toBe(true);
    expect(
      stepTimes.length >= wasm.steps.length,
      `${name}: ${stepTimes.length} stepTimes, want at least ${wasm.steps.length} (one per wasm step)`
    ).toBe(true);
    const counts = [0, ...stepTimes].map((t) => controller.counterAt(t));
    expect(counts[0], `${name}: counterAt(0) before any probe`).toBe(0);
    expect(
      controller.counterAt(duration),
      `${name}: counterAt(duration) should equal wasm probes`
    ).toBe(wasm.probes);
    expect(
      counts.every((n, i) => i === 0 || n >= counts[i - 1]),
      `${name}: probe count should never go down; counts at 0 and each stepTime ${show(counts)}`
    ).toBe(true);
    const seen = Array.from({ length: wasm.probes }, (_, i) => i + 1).filter(
      (n) => !counts.includes(n)
    );
    expect(
      seen,
      `${name}: the live count should pass through every value 1..${wasm.probes}; missing ${show(seen)} in ${show(counts)}`
    ).toEqual([]);
  });

  it('stepForwards() stops at each next stop and stepBackwards() returns to the stop before', () => {
    withFrameClock(() => {
      const { producer } = runCase(c);
      const controller = play(producer);
      expect(
        stepBothWaysProblems(controller, 2),
        `${name}: from 0, two stepForwards() presses then two stepBackwards(); stepTimes ${show(controller.stepTimes)}`
      ).toEqual([]);
    });
  });

  it('ends showing the result in the buckets and banner, and seekTime(0) shows the start again', () => {
    const { wasm, producer } = runCase(c);
    const controller = play(producer);
    controller.finish();
    expect(
      allShownValues(),
      `${name}: after finish() buckets should show ${pictureOf(wasm.slots)}`
    ).toEqual(wasm.slots.map(expectedValues));
    wasm.slots.forEach((slot, i) => {
      if (slot.kind === 'tombstone')
        expect(isDashed(i), `${name}: after finish() tombstone slot ${i} dashed`).toBe(true);
    });
    const banner = bannerText();
    const formula = `${c.op.key} % 11`;
    expect(
      banner.includes(formula),
      `${name}: final banner should show "${formula}"; banner was "${banner}"`
    ).toBe(true);
    expect(
      new RegExp(`probes?\\D{0,3}${wasm.probes}\\b`, 'i').test(banner),
      `${name}: final banner should show the probe count ${wasm.probes} (e.g. "Probes: ${wasm.probes}"); banner was "${banner}"`
    ).toBe(true);
    expect(
      c.outcome.test(banner),
      `${name}: final banner should report ${c.outcome}; banner was "${banner}"`
    ).toBe(true);
    controller.seekTime(0);
    expect(
      allShownValues(),
      `${name}: after finish() then seekTime(0) buckets should show the start ${pictureOf(c.start)}`
    ).toEqual(c.start.map(expectedValues));
  });

  it('each stop pairs with its wasm step: C statement, one active bucket, wrap cue only on the 10 → 0 probe', () => {
    const { wasm, producer } = runCase(c);
    expect(
      wrapStepIndices(wasm.steps).length > 0,
      `fixture check: wasm ${name} ${c.wraps ? 'probes' : 'never probes'} 10 then 0`
    ).toBe(c.wraps);
    const controller = play(producer);
    expect(
      controller.stepTimes.length,
      `${name}: one stepTimes stop per wasm step ${show(wasm.steps.map((s) => s.kind))}; stepTimes ${show(controller.stepTimes)}`
    ).toBe(wasm.steps.length);
    expect(
      stopProblems(controller, wasm.steps),
      `${name}: at each controller.stepTimes[i], what the canvas and code panel show for wasm.steps[i]`
    ).toEqual([]);
  });
});

it.each([
  { what: 'delete 14 at slot 4, after finish()', c: CASES[7], slot: 4 },
  { what: 'search 14, at the stop probing the DEL at slot 3', c: CASES[5], slot: 3 },
])('the highlight sits inside the dashed tombstone border ($what)', ({ c, slot }) => {
  const { wasm, producer } = runCase(c);
  const controller = play(producer);
  const stop = wasm.steps.findIndex((s) => s.kind === 'probe' && s.index === slot);
  if (c.op.kind === 'delete') controller.finish();
  else controller.seekTime(controller.stepTimes[stop]);
  expect(
    highlightCoversDash(slot),
    `${pictureOf(c.start)} ${describeOp(c.op)}: dashed border and [data-hash-highlight] on slot ${slot}`
  ).toBe('');
});

it('insert 25 over DEL at 3: finish() shows 25 solid, stepBackwards() across Place brings DEL and its dashes back', () => {
  const c = CASES[3];
  const name = `${pictureOf(c.start)} ${describeOp(c.op)}`;
  const { wasm, producer } = runCase(c);
  expect(wasm.steps.at(-1), `fixture check: wasm ${name} ends placing 25 over DEL at 3`).toEqual({
    kind: 'place',
    key: 25,
    index: 3,
    replacedTombstone: true,
  });
  const controller = play(producer);
  controller.finish();
  const end = controller.time;
  expect(slotLook(3), `${name}: after finish(), slot 3`).toEqual({ values: ['25'], dashed: false });
  controller.stepBackwards();
  const before = controller.stepTimes.at(-2) as number;
  expect(
    controller.time < end && Math.abs(controller.time - before) <= 1,
    `${name}: stepBackwards() from the end (${end}) should go to the stop before Place, stepTimes.at(-2) = ${before}; went to ${controller.time}`
  ).toBe(true);
  expect(slotLook(3), `${name}: after stepBackwards() across Place, slot 3`).toEqual({
    values: ['DEL'],
    dashed: true,
  });
});

const finalLine = (start: HashSlot[], op: HashOp) => {
  resetCanvases();
  const hashTable = new GraphicalHashTable();
  hashTable.loadSlots(start);
  return hashTable[op.kind](op.key).allRunners.at(-1)?.line;
};

it.each([
  { a: CASES[0], b: CASES[2], what: 'insert: placed vs already present' },
  { a: CASES[5], b: CASES[6], what: 'search: found vs not found' },
  { a: CASES[7], b: CASES[8], what: 'delete: marked DEL vs not found' },
])('different outcomes end on different C lines ($what)', ({ a, b, what }) => {
  const lineA = finalLine(a.start, a.op);
  const lineB = finalLine(b.start, b.op);
  expect(
    lineA !== lineB,
    `${what}: last highlighted line of "${a.label}" (${lineA}) and "${b.label}" (${lineB}) should differ`
  ).toBe(true);
});

describe('VisualiserSession.retheme() on a hash table with tombstones', () => {
  const TOMBSTONED = table({ 0: K(22), 3: T, 4: K(14), 5: T });
  type Seen = { slots: HashSlot[]; ink: string };
  let instances: { table: GraphicalHashTable; inserts: Seen[] }[] = [];
  const latest = () => instances[instances.length - 1];

  const attach = () => {
    instances = [];
    vi.spyOn(GraphicalDataStructureFactory, 'create').mockImplementation(() => {
      const hashTable = new GraphicalHashTable();
      const entry = { table: hashTable, inserts: [] as Seen[] };
      const insert = hashTable.insert.bind(hashTable);
      hashTable.insert = (value: number) => {
        entry.inserts.push({ slots: hashTable.slots, ink: canvasTheme.ink });
        return insert(value);
      };
      instances.push(entry);
      return hashTable;
    });
    const session = new VisualiserSession();
    session.attach('Hash Tables', canvasThemes.light, [], undefined, true);
    latest().table.loadSlots(TOMBSTONED);
    return session;
  };

  const expectDark = (label: string) => {
    const markup = canvasMarkup();
    const { dark, light } = canvasThemes;
    expect(
      markup.includes(String(dark.ink).toLowerCase()),
      `${label}: canvas should use dark ink ${dark.ink}`
    ).toBe(true);
    expect(
      markup.includes(String(dark.nodeFill).toLowerCase()),
      `${label}: canvas should use dark nodeFill ${dark.nodeFill}`
    ).toBe(true);
    expect(
      markup.includes(String(light.ink).toLowerCase()),
      `${label}: light ink ${light.ink} must be gone`
    ).toBe(false);
  };

  it('idle: redraws the same tombstones in the dark theme', () => {
    const session = attach();
    session.retheme(canvasThemes.dark);
    expect(latest().table.slots, `idle retheme(dark) of ${pictureOf(TOMBSTONED)}`).toEqual(
      TOMBSTONED
    );
    expect(allShownValues(), 'idle retheme(dark): buckets drawn').toEqual(
      TOMBSTONED.map(expectedValues)
    );
    expectDark('idle retheme(dark)');
    session.dispose();
  });

  it('mid-run insert 25 over a tombstone: rebuilds from the pre-run slots, stays paused at the same step, redraws dark', () => {
    const session = attach();
    const after: HashRunResult = wasmRun(TOMBSTONED, ins(25));
    expect(session.run('insert', ['25']), `run insert 25 on ${pictureOf(TOMBSTONED)}`).toBe('');
    const original = latest();
    expect(
      original.table.slots,
      `insert 25 on ${pictureOf(TOMBSTONED)} should give ${pictureOf(after.slots)}`
    ).toEqual(after.slots);
    session.pause();
    const { stepTimes } = session.getSnapshot();
    expect(
      stepTimes.length >= 3,
      `insert 25 should have several steps; stepTimes ${show(stepTimes)}`
    ).toBe(true);
    session.seekToTime(stepTimes[1]);
    const before = session.getSnapshot();

    session.retheme(canvasThemes.dark);
    const rebuilt = latest();
    const now = session.getSnapshot();
    expect(
      rebuilt !== original,
      'mid-run retheme(dark) should build a new GraphicalHashTable'
    ).toBe(true);
    expect(
      rebuilt.inserts,
      `mid-run retheme(dark): the rebuilt table should replay insert(25) once, in dark ink, starting from the pre-run slots ${pictureOf(TOMBSTONED)}; saw ${show(rebuilt.inserts)}`
    ).toEqual([{ slots: TOMBSTONED, ink: canvasThemes.dark.ink }]);
    expect(rebuilt.table.slots, 'rebuilt table after replaying insert 25').toEqual(after.slots);
    expect(now.lastRun, 'retheme keeps lastRun').toEqual(before.lastRun);
    expect(now.step, `retheme keeps step ${before.step}`).toBe(before.step);
    expect(now.progress, `retheme keeps progress ${before.progress}`).toBeCloseTo(
      before.progress,
      6
    );
    expect(now.playback, 'paused run stays paused after retheme').toBe('paused');
    expectDark('mid-run retheme(dark)');

    session.retheme(canvasThemes.light);
    expect(
      latest().inserts[0]?.slots,
      `second retheme(light) should also start from the pre-run slots ${pictureOf(TOMBSTONED)}`
    ).toEqual(TOMBSTONED);
    session.finish();
    expect(
      allShownValues(),
      `finishing the rethemed insert 25 shows ${pictureOf(after.slots)}`
    ).toEqual(after.slots.map(expectedValues));
    session.dispose();
  });
});
