// @vitest-environment jsdom
import { SVG } from '@svgdotjs/svg.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import AnimationProducer from '@/visualiser-src/common/AnimationProducer';
import { getCanvasTarget } from '@/visualiser-src/common/canvasTarget';
import { canvasTheme } from '@/visualiser-src/common/canvasTheme';
import { CODE_CANVAS, CODE_CONTAINER, VISUALISER_CANVAS } from '@/visualiser-src/common/constants';
import GraphicalDataStructure from '@/visualiser-src/common/GraphicalDataStructure';
import GraphicalDataStructureFactory from '@/visualiser-src/common/GraphicalDataStructureFactory';
import type { Documentation } from '@/visualiser-src/common/typedefs';
import VisualiserController from '@/visualiser-src/controller/VisualiserController';
import SortsAnimationProducer from '@/visualiser-src/sorting-visualiser/animation-producer/SortsAnimationProducer';
import { canvasThemes } from './canvasThemes';
import { VisualiserSession } from './session';
import { findTopic } from './topics';

const resetCanvases = () => {
  const visualiserId = VISUALISER_CANVAS.replace(/^#/, '');
  const codeId = CODE_CANVAS.replace(/^#/, '');
  document.body.innerHTML = `<svg id="${visualiserId}"></svg><svg id="${codeId}"></svg><div id="${CODE_CONTAINER}"></div>`;
};

beforeAll(() => {
  (SVGElement.prototype as unknown as SVGGraphicsElement).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
  (SVGElement.prototype as unknown as SVGGraphicsElement).getCTM = () => null;
});

beforeEach(() => {
  resetCanvases();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const show = (value: unknown) => JSON.stringify(value);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const LIGHT_ACCENT = canvasThemes.light.accent;
const DARK_ACCENT = canvasThemes.dark.accent;

type StateHooks = { snapshotState: () => unknown; restoreState: (state: unknown) => void };

describe('GraphicalDataStructure default state hooks', () => {
  it('Linked Lists (no override): snapshotState() returns data and restoreState(array) loads it', () => {
    const list = GraphicalDataStructureFactory.create('Linked Lists');
    const hooks = list as unknown as StateHooks;
    list.load([4, 8]);
    expect(
      typeof hooks.snapshotState,
      'GraphicalDataStructure should have a public snapshotState() method'
    ).toBe('function');
    expect(
      hooks.snapshotState(),
      `default snapshotState() on a Linked List holding [4, 8] should return data [4, 8], got ${show(hooks.snapshotState())}`
    ).toEqual([4, 8]);
    const fresh = GraphicalDataStructureFactory.create('Linked Lists');
    (fresh as unknown as StateHooks).restoreState([15, 16]);
    expect(
      fresh.data,
      `default restoreState([15, 16]) on a fresh Linked List should load([15, 16]), got data ${show(fresh.data)}`
    ).toEqual([15, 16]);
    const untouched = GraphicalDataStructureFactory.create('Linked Lists');
    const load = vi.spyOn(untouched, 'load');
    (untouched as unknown as StateHooks).restoreState({ kind: 'not-an-array' });
    expect(
      load.mock.calls,
      `default restoreState({kind:'not-an-array'}) must not call load; load calls were ${show(load.mock.calls)}`
    ).toEqual([]);
  });
});

describe('VisualiserController state hooks on an existing visualiser', () => {
  it('snapshotState() is [] before a topic is applied', () => {
    const controller = new VisualiserController();
    expect(
      controller.snapshotState(),
      'new VisualiserController() with no topic: snapshotState() should be []'
    ).toEqual([]);
  });

  it('Linked Lists: snapshotState() is data and restoreState() rebuilds from it', () => {
    const controller = new VisualiserController('Linked Lists');
    controller.loadData([4, 8, 15]);
    expect(
      controller.snapshotState(),
      `Linked Lists after loadData([4, 8, 15]): snapshotState() should equal data [4, 8, 15], got ${show(controller.snapshotState())}`
    ).toEqual([4, 8, 15]);
    controller.restoreState([16, 23]);
    expect(
      controller.data,
      `Linked Lists [4, 8, 15] then restoreState([16, 23]): structure should be reset then hold [16, 23], got ${show(controller.data)}`
    ).toEqual([16, 23]);
    controller.restoreState({ kind: 'not-an-array' });
    expect(
      controller.data,
      `Linked Lists [16, 23] then restoreState({kind:'not-an-array'}): reset leaves an empty list, got ${show(controller.data)}`
    ).toEqual([]);
  });
});

describe('VisualiserSession.retheme() on Sorting (default state)', () => {
  const sorting = findTopic('sorting-algorithms');
  if (!sorting) throw new Error('The sorting topic is missing.');
  const start = [8, 1, 6, 3, 2, 7, 4, 5];

  it('keeps the values when idle', () => {
    const session = new VisualiserSession();
    session.attach(sorting.title, canvasThemes.light, start, undefined, true);
    session.retheme(canvasThemes.dark);
    expect(
      session.data,
      `Sorting ${show(start)} idle retheme(dark): values should be unchanged, got ${show(session.data)}`
    ).toEqual(start);
    expect(session.getSnapshot().lastRun, 'idle retheme must not create a run').toBe(null);
    session.dispose();
  });

  it('rebuilds a paused quick sort at the same point', () => {
    const session = new VisualiserSession();
    session.attach(sorting.title, canvasThemes.light, start, undefined, true);
    expect(session.run('quick', []), 'Sorting run quick should succeed').toBe('');
    session.pause();
    const { stepTimes } = session.getSnapshot();
    session.seekToTime(stepTimes[Math.floor(stepTimes.length / 2)]);
    const before = session.getSnapshot();

    session.retheme(canvasThemes.dark);
    const after = session.getSnapshot();
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(
      session.data,
      `quick sort of ${show(start)} paused mid-run then retheme(dark): data should be the sorted result, got ${show(session.data)}`
    ).toEqual(sorted);
    expect(after.lastRun, 'mid-run retheme keeps the same lastRun (id, command, args)').toEqual(
      before.lastRun
    );
    expect(after.duration, `mid-run retheme keeps the duration ${before.duration}`).toBe(
      before.duration
    );
    expect(after.step, `mid-run retheme keeps the step ${before.step}`).toBe(before.step);
    expect(
      after.progress,
      `mid-run retheme keeps progress ${before.progress}, got ${after.progress}`
    ).toBeCloseTo(before.progress, 6);
    expect(after.playback, 'paused run stays paused after retheme').toBe('paused');
    session.finish();
    expect(session.data, 'finishing the rethemed quick sort leaves it sorted').toEqual(sorted);
    session.dispose();
  });
});

type FakeSlot = 'empty' | 'tombstone' | number;
const CAPACITY = 3;
const STEPS = 4;
const STEP_MS = 400;

/**
 * A structure whose state has tombstones, which `data` (only the keys) cannot represent.
 * Insert probes linearly from key % 3 and reuses the first empty or tombstone slot.
 */
class TombstoneTable extends GraphicalDataStructure {
  static instances: TombstoneTable[] = [];

  slots: FakeSlot[] = ['empty', 'empty', 'empty'];

  loadCalls: number[][] = [];

  restoreCalls: { state: unknown; accent: string }[] = [];

  insertCalls: { key: number; accent: string }[] = [];

  public constructor() {
    super();
    TombstoneTable.instances.push(this);
  }

  public get documentation(): Documentation {
    return { insert: { args: ['value'], description: 'Insert a key.' } };
  }

  public generate(): void {
    this.slots = ['empty', 'empty', 'empty'];
  }

  public get data(): number[] {
    return this.slots.filter((slot): slot is number => typeof slot === 'number');
  }

  public load(data: number[]): void {
    this.loadCalls.push([...data]);
    this.slots = ['empty', 'empty', 'empty'];
    data.forEach((key) => this.place(key));
  }

  public snapshotState(): unknown {
    return [...this.slots];
  }

  public restoreState(state: unknown): void {
    this.restoreCalls.push({ state: copy(state), accent: canvasTheme.accent });
    if (Array.isArray(state)) this.slots = [...(state as FakeSlot[])];
  }

  public insert(key: number): AnimationProducer {
    this.insertCalls.push({ key, accent: canvasTheme.accent });
    const producer = new SortsAnimationProducer();
    const { canvas } = getCanvasTarget();
    for (let i = 0; i < STEPS; i += 1) {
      const cell = SVG().rect(10, 10).fill(canvasTheme.nodeFill).addTo(canvas);
      producer.addSequenceAnimation(cell.animate(STEP_MS).attr({ fill: canvasTheme.accent }));
      producer.finishSequence();
    }
    this.place(key);
    return producer;
  }

  private place(key: number): void {
    for (let probe = 0; probe < CAPACITY; probe += 1) {
      const index = (key + probe) % CAPACITY;
      if (typeof this.slots[index] !== 'number') {
        this.slots[index] = key;
        return;
      }
    }
  }
}

const latest = () => TombstoneTable.instances[TombstoneTable.instances.length - 1];

describe('VisualiserSession.retheme() with state that data cannot hold', () => {
  const TITLE = 'Tombstone Table';
  const TOMBSTONED: FakeSlot[] = ['empty', 'tombstone', 23];

  const attachTable = () => {
    TombstoneTable.instances = [];
    vi.spyOn(GraphicalDataStructureFactory, 'create').mockImplementation(
      () => new TombstoneTable()
    );
    const session = new VisualiserSession();
    session.attach(TITLE, canvasThemes.light, [], undefined, true);
    latest().slots = [...TOMBSTONED];
    return session;
  };

  it('idle: restores the tombstone snapshot instead of loading data', () => {
    const session = attachTable();
    const original = latest();
    session.retheme(canvasThemes.dark);
    const rebuilt = latest();

    expect(
      rebuilt !== original,
      'idle retheme(dark) should rebuild the structure (a new instance from the factory)'
    ).toBe(true);
    expect(
      rebuilt.restoreCalls,
      `idle retheme(dark) on slots ${show(TOMBSTONED)} (data [23]): rebuilt structure should get restoreState(${show(TOMBSTONED)}) once in the dark theme; restoreState calls were ${show(rebuilt.restoreCalls)}`
    ).toEqual([{ state: TOMBSTONED, accent: DARK_ACCENT }]);
    expect(
      rebuilt.loadCalls,
      `idle retheme(dark) must not rebuild through load(data) (which loses the tombstone); load calls were ${show(rebuilt.loadCalls)}`
    ).toEqual([]);
    expect(
      rebuilt.slots,
      `after idle retheme(dark) the slots should still be ${show(TOMBSTONED)}, got ${show(rebuilt.slots)}`
    ).toEqual(TOMBSTONED);
    expect(session.data, `session.data after idle retheme should be [23]`).toEqual([23]);
    expect(session.getSnapshot().lastRun, 'idle retheme must not create a run').toBe(null);
    session.dispose();
  });

  it('mid-run: rebuilds from the pre-run snapshot, re-runs in the new theme and keeps position', () => {
    const session = attachTable();
    expect(
      session.run('insert', ['4']),
      `run insert 4 on slots ${show(TOMBSTONED)} should succeed`
    ).toBe('');
    const original = latest();
    expect(
      original.slots,
      'fake check: insert 4 (4 % 3 = 1) reuses the tombstone at slot 1'
    ).toEqual(['empty', 4, 23]);
    expect(original.insertCalls, 'fake check: the first run draws in the light theme').toEqual([
      { key: 4, accent: LIGHT_ACCENT },
    ]);

    session.pause();
    const { stepTimes } = session.getSnapshot();
    expect(
      stepTimes.length,
      `insert 4 should produce ${STEPS} timestamped steps; stepTimes were ${show(stepTimes)}`
    ).toBeGreaterThanOrEqual(STEPS);
    session.seekToTime(stepTimes[1]);
    const before = session.getSnapshot();
    expect(before.playback, 'fake check: run paused mid-way before retheme').toBe('paused');

    session.retheme(canvasThemes.dark);
    const rebuilt = latest();
    const after = session.getSnapshot();

    expect(
      rebuilt !== original,
      'mid-run retheme(dark) should rebuild the structure (a new instance)'
    ).toBe(true);
    expect(
      rebuilt.restoreCalls,
      `mid-run retheme(dark) of insert 4: restoreState should get the pre-run slots ${show(TOMBSTONED)} in the dark theme, not the post-run slots ["empty",4,23] nor data; restoreState calls were ${show(rebuilt.restoreCalls)}`
    ).toEqual([{ state: TOMBSTONED, accent: DARK_ACCENT }]);
    expect(
      rebuilt.loadCalls,
      `mid-run retheme(dark) must not rebuild through load(data); load calls were ${show(rebuilt.loadCalls)}`
    ).toEqual([]);
    expect(
      rebuilt.insertCalls,
      `mid-run retheme(dark) should re-run insert 4 once on the rebuilt structure in the dark theme; insert calls were ${show(rebuilt.insertCalls)}`
    ).toEqual([{ key: 4, accent: DARK_ACCENT }]);
    expect(
      rebuilt.slots,
      `re-running insert 4 on the restored pre-run slots should give ["empty",4,23], got ${show(rebuilt.slots)}`
    ).toEqual(['empty', 4, 23]);
    expect(after.lastRun, 'mid-run retheme keeps the same lastRun (id, command, args)').toEqual(
      before.lastRun
    );
    expect(after.duration, `mid-run retheme keeps the duration ${before.duration}`).toBe(
      before.duration
    );
    expect(after.step, `mid-run retheme keeps the step ${before.step}`).toBe(before.step);
    expect(
      after.progress,
      `mid-run retheme keeps progress ${before.progress} (seeked to ${stepTimes[1]}ms), got ${after.progress}`
    ).toBeCloseTo(before.progress, 6);
    expect(after.playback, 'paused run stays paused after retheme').toBe('paused');
    session.dispose();
  });

  it('mid-run: a second retheme still rebuilds from the same pre-run snapshot', () => {
    const session = attachTable();
    expect(session.run('insert', ['4']), 'run insert 4 should succeed').toBe('');
    session.pause();
    session.retheme(canvasThemes.dark);
    session.retheme(canvasThemes.light);
    const rebuilt = latest();
    expect(
      rebuilt.restoreCalls,
      `retheme(dark) then retheme(light) mid-run of insert 4: the second rebuild should also get the pre-run slots ${show(TOMBSTONED)} in the light theme; restoreState calls were ${show(rebuilt.restoreCalls)}`
    ).toEqual([{ state: TOMBSTONED, accent: LIGHT_ACCENT }]);
    expect(
      rebuilt.slots,
      `after two rethemes the re-run insert 4 should give ["empty",4,23], got ${show(rebuilt.slots)}`
    ).toEqual(['empty', 4, 23]);
    session.dispose();
  });
});
