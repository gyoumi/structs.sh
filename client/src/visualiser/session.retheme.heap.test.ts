// @vitest-environment jsdom
/**
 * Re-theming keeps a heap's order and items (docs/heap.md, step 2a).
 *
 * `StandInHeap` below stands in for `GraphicalHeap`, which doesn't exist until step 2c. It keeps a
 * `HeapState`, snapshots it as `{order, items}` and restores it through `readHeapState`, as 2c's
 * `GraphicalHeap` will. Its operations run the real engine (`runHeapStepLog` on challenges.wasm,
 * built by `pnpm run challenges`) and animate one step per engine step, so a run can be paused
 * partway. Replace these tests with ones on `GraphicalHeap` once it exists.
 */
import { SVG } from '@svgdotjs/svg.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  loadChallenges,
  runHeapStepLog,
  type HeapOp,
  type HeapOrder,
} from '@/Services/challenges/challenges';
import AnimationProducer from '@/visualiser-src/common/AnimationProducer';
import { getCanvasTarget } from '@/visualiser-src/common/canvasTarget';
import { canvasTheme } from '@/visualiser-src/common/canvasTheme';
import { CODE_CANVAS, CODE_CONTAINER, VISUALISER_CANVAS } from '@/visualiser-src/common/constants';
import GraphicalDataStructure from '@/visualiser-src/common/GraphicalDataStructure';
import GraphicalDataStructureFactory from '@/visualiser-src/common/GraphicalDataStructureFactory';
import type { Documentation } from '@/visualiser-src/common/typedefs';
import SortsAnimationProducer from '@/visualiser-src/sorting-visualiser/animation-producer/SortsAnimationProducer';
import { setUpParityEnvironment } from '@/test/sortingParity';
import {
  HEAP_CAPACITY,
  readHeapState,
  type HeapState,
} from '@/visualiser-src/heap-visualiser/util/heapState';
import { canvasThemes } from './canvasThemes';
import { VisualiserSession } from './session';

setUpParityEnvironment();

beforeAll(async () => {
  await loadChallenges();
});

beforeEach(() => {
  const visualiserId = VISUALISER_CANVAS.replace(/^#/, '');
  const codeId = CODE_CANVAS.replace(/^#/, '');
  document.body.innerHTML = `<svg id="${visualiserId}"></svg><svg id="${codeId}"></svg><div id="${CODE_CONTAINER}"></div>`;
});

afterEach(() => {
  vi.restoreAllMocks();
});

const show = (value: unknown) => JSON.stringify(value);
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const LIGHT_ACCENT = canvasThemes.light.accent;
const DARK_ACCENT = canvasThemes.dark.accent;
const STEP_MS = 400;

const otherOrder = (order: HeapOrder): HeapOrder => (order === 'max' ? 'min' : 'max');

type OperationCall = { operation: string; from: HeapState; accent: string };

class StandInHeap extends GraphicalDataStructure {
  static instances: StandInHeap[] = [];

  order: HeapOrder = 'max';

  items: number[] = [];

  loadCalls: number[][] = [];

  restoreCalls: { state: unknown; accent: string }[] = [];

  operationCalls: OperationCall[] = [];

  public constructor() {
    super();
    StandInHeap.instances.push(this);
  }

  public get documentation(): Documentation {
    return {
      insert: { args: ['value'], description: 'Insert a key.' },
      pop: { args: [], description: 'Pop the root.' },
      switchOrder: { args: [], description: 'Rebuild in the other order.' },
    };
  }

  public generate(): void {
    this.order = 'max';
    this.items = [];
  }

  public get data(): number[] {
    return [...this.items];
  }

  public load(data: number[]): void {
    this.loadCalls.push([...data]);
    this.order = 'max';
    this.items = [];
    data.forEach((key) => {
      this.items = this.engine(this.order, { kind: 'insert', key }).items;
    });
  }

  public snapshotState(): HeapState {
    return { order: this.order, items: [...this.items] };
  }

  public restoreState(state: unknown): void {
    this.restoreCalls.push({ state: copy(state), accent: canvasTheme.accent });
    const read = readHeapState(state);
    if (read) {
      this.order = read.order;
      this.items = read.items;
    }
  }

  public insert(key: number): AnimationProducer {
    return this.animate('insert', this.order, { kind: 'insert', key });
  }

  public pop(): AnimationProducer {
    return this.animate('pop', this.order, { kind: 'pop' });
  }

  public switchOrder(): AnimationProducer {
    return this.animate('switchOrder', otherOrder(this.order), { kind: 'rebuild' });
  }

  private engine(order: HeapOrder, op: HeapOp) {
    return runHeapStepLog({ order, capacity: HEAP_CAPACITY, items: this.items, op });
  }

  private animate(operation: string, order: HeapOrder, op: HeapOp): AnimationProducer {
    this.operationCalls.push({ operation, from: this.snapshotState(), accent: canvasTheme.accent });
    const result = this.engine(order, op);
    const producer = new SortsAnimationProducer();
    const { canvas } = getCanvasTarget();
    result.steps.forEach(() => {
      const cell = SVG().rect(10, 10).fill(canvasTheme.nodeFill).addTo(canvas);
      producer.addSequenceAnimation(cell.animate(STEP_MS).attr({ fill: canvasTheme.accent }));
      producer.finishSequence();
    });
    this.order = order;
    this.items = result.items;
    return producer;
  }
}

const latest = () => StandInHeap.instances[StandInHeap.instances.length - 1];

const TITLE = 'Stand-in Heap';

/** A session on a StandInHeap holding `state`, drawn in the light theme. */
const attachHeap = (state: HeapState) => {
  StandInHeap.instances = [];
  vi.spyOn(GraphicalDataStructureFactory, 'create').mockImplementation(() => new StandInHeap());
  const session = new VisualiserSession();
  session.attach(TITLE, canvasThemes.light, [], undefined, true);
  latest().order = state.order;
  latest().items = [...state.items];
  return session;
};

const stateOf = (heap: StandInHeap): HeapState => ({ order: heap.order, items: [...heap.items] });

const MAX_HEAP: HeapState = { order: 'max', items: [9, 4, 7, 1, 3] };
const MIN_HEAP: HeapState = { order: 'min', items: [1, 3, 7, 4, 9] };

describe('VisualiserSession.retheme() on a heap, idle', () => {
  it.each([
    { label: 'a max-heap', start: MAX_HEAP },
    { label: 'a min-heap', start: MIN_HEAP },
    { label: 'an empty min-heap', start: { order: 'min', items: [] } as HeapState },
  ])('keeps the order and items of $label', ({ start }) => {
    const session = attachHeap(start);
    const original = latest();
    session.retheme(canvasThemes.dark);
    const rebuilt = latest();

    expect(
      rebuilt !== original,
      `idle retheme(dark) on ${show(start)} should rebuild the structure (a new instance from the factory)`
    ).toBe(true);
    expect(
      rebuilt.restoreCalls,
      `idle retheme(dark) on ${show(start)}: the rebuilt heap should get restoreState({order, items}) once, in the dark theme; restoreState calls were ${show(rebuilt.restoreCalls)}`
    ).toEqual([{ state: start, accent: DARK_ACCENT }]);
    expect(
      rebuilt.loadCalls,
      `idle retheme(dark) on ${show(start)} must not rebuild through load(data), which would lose the order; load calls were ${show(rebuilt.loadCalls)}`
    ).toEqual([]);
    expect(
      stateOf(rebuilt),
      `after idle retheme(dark) the heap should still be ${show(start)}, got ${show(stateOf(rebuilt))}`
    ).toEqual(start);
    expect(
      session.data,
      `session.data after idle retheme(dark) on ${show(start)} should be the items ${show(start.items)}, got ${show(session.data)}`
    ).toEqual(start.items);
    expect(session.getSnapshot().lastRun, 'idle retheme must not create a run').toBe(null);
    session.dispose();
  });
});

/**
 * Each run's end state is worked by hand from the engine rules (docs/heap.md, 1a): insert sifts up,
 * pop moves the last key to the root and sifts down (left child on a tie), and a switch re-inserts
 * the keys in array order under the new order.
 */
const RUNS: {
  label: string;
  start: HeapState;
  command: string;
  args: string[];
  end: HeapState;
}[] = [
  {
    label: 'insert 8 into a max-heap',
    start: MAX_HEAP,
    command: 'insert',
    args: ['8'],
    end: { order: 'max', items: [9, 4, 8, 1, 3, 7] },
  },
  {
    label: 'insert 2 into a min-heap',
    start: MIN_HEAP,
    command: 'insert',
    args: ['2'],
    end: { order: 'min', items: [1, 3, 2, 4, 9, 7] },
  },
  {
    label: 'pop a max-heap',
    start: MAX_HEAP,
    command: 'pop',
    args: [],
    end: { order: 'max', items: [7, 4, 3, 1] },
  },
  {
    label: 'pop a min-heap',
    start: MIN_HEAP,
    command: 'pop',
    args: [],
    end: { order: 'min', items: [3, 4, 7, 9] },
  },
  {
    label: 'switch a max-heap to min',
    start: MAX_HEAP,
    command: 'switchOrder',
    args: [],
    end: { order: 'min', items: [1, 3, 7, 9, 4] },
  },
  {
    label: 'switch a min-heap to max',
    start: MIN_HEAP,
    command: 'switchOrder',
    args: [],
    end: { order: 'max', items: [9, 7, 3, 1, 4] },
  },
];

const describeRun = (run: (typeof RUNS)[number]) =>
  `${run.command}(${run.args.join(', ')}) on ${show(run.start)}`;

/** Starts `run`, pauses it at a step in the middle, and returns the session and that position. */
const pauseMidRun = (run: (typeof RUNS)[number]) => {
  const session = attachHeap(run.start);
  expect(
    session.run(run.command, run.args),
    `session.run for ${describeRun(run)} should succeed (return '')`
  ).toBe('');
  const original = latest();
  expect(
    stateOf(original),
    `stand-in check: ${describeRun(run)} should end at ${show(run.end)}, got ${show(stateOf(original))}`
  ).toEqual(run.end);
  session.pause();
  const { stepTimes } = session.getSnapshot();
  expect(
    stepTimes.length,
    `stand-in check: ${describeRun(run)} should have at least 3 timed steps to pause between; stepTimes were ${show(stepTimes)}`
  ).toBeGreaterThanOrEqual(3);
  session.seekToTime(stepTimes[Math.floor(stepTimes.length / 2)]);
  const before = session.getSnapshot();
  expect(before.playback, `stand-in check: ${describeRun(run)} paused mid-way`).toBe('paused');
  return { session, original, before };
};

describe('VisualiserSession.retheme() on a heap, mid-run', () => {
  it.each(RUNS)(
    '$label: rebuilds from the pre-run heap, re-runs in the new theme and keeps position',
    (run) => {
      const { session, original, before } = pauseMidRun(run);
      session.retheme(canvasThemes.dark);
      const rebuilt = latest();
      const after = session.getSnapshot();
      const what = `retheme(dark) paused mid-way through ${describeRun(run)}`;

      expect(rebuilt !== original, `${what} should rebuild the structure (a new instance)`).toBe(
        true
      );
      expect(
        rebuilt.restoreCalls,
        `${what}: restoreState should get the pre-run heap ${show(run.start)} in the dark theme, not the post-run heap ${show(run.end)}; restoreState calls were ${show(rebuilt.restoreCalls)}`
      ).toEqual([{ state: run.start, accent: DARK_ACCENT }]);
      expect(
        rebuilt.loadCalls,
        `${what} must not rebuild through load(data), which would lose the order; load calls were ${show(rebuilt.loadCalls)}`
      ).toEqual([]);
      expect(
        rebuilt.operationCalls,
        `${what} should re-run ${run.command} once, from the pre-run heap, in the dark theme; calls were ${show(rebuilt.operationCalls)}`
      ).toEqual([{ operation: run.command, from: run.start, accent: DARK_ACCENT }]);
      expect(
        stateOf(rebuilt),
        `${what}: the re-run should end at ${show(run.end)}, got ${show(stateOf(rebuilt))}`
      ).toEqual(run.end);
      expect(after.lastRun, `${what} keeps the same lastRun (id, command, args)`).toEqual(
        before.lastRun
      );
      expect(
        after.duration,
        `${what} keeps the duration ${before.duration}, got ${after.duration}`
      ).toBe(before.duration);
      expect(after.step, `${what} keeps the step ${before.step}, got ${after.step}`).toBe(
        before.step
      );
      expect(
        after.progress,
        `${what} keeps progress ${before.progress}, got ${after.progress}`
      ).toBeCloseTo(before.progress, 6);
      expect(after.playback, `${what}: a paused run stays paused`).toBe('paused');

      session.finish();
      expect(
        session.data,
        `finishing the rethemed ${describeRun(run)} should leave the items ${show(run.end.items)}, got ${show(session.data)}`
      ).toEqual(run.end.items);
      expect(
        latest().order,
        `finishing the rethemed ${describeRun(run)} should leave the order ${run.end.order}`
      ).toBe(run.end.order);
      session.dispose();
    }
  );

  it('switching order: a second retheme still rebuilds from the same pre-run heap', () => {
    const run = RUNS.find((r) => r.label === 'switch a max-heap to min');
    if (!run) throw new Error('The max-to-min switch run is missing.');
    const { session } = pauseMidRun(run);
    session.retheme(canvasThemes.dark);
    session.retheme(canvasThemes.light);
    const rebuilt = latest();
    const what = `retheme(dark) then retheme(light) mid-way through ${describeRun(run)}`;

    expect(
      rebuilt.restoreCalls,
      `${what}: the second rebuild should also get the pre-run max-heap ${show(run.start)}, in the light theme, not the min-heap the first re-run ended on; restoreState calls were ${show(rebuilt.restoreCalls)}`
    ).toEqual([{ state: run.start, accent: LIGHT_ACCENT }]);
    expect(
      rebuilt.operationCalls,
      `${what} should re-run switchOrder once from the max-heap in the light theme; calls were ${show(rebuilt.operationCalls)}`
    ).toEqual([{ operation: 'switchOrder', from: run.start, accent: LIGHT_ACCENT }]);
    expect(
      stateOf(rebuilt),
      `${what} should end in the new order at ${show(run.end)}, got ${show(stateOf(rebuilt))}`
    ).toEqual(run.end);
    session.dispose();
  });
});

describe('VisualiserSession.retheme() on a heap after a run has finished', () => {
  it.each(RUNS.filter((run) => run.command === 'switchOrder'))(
    '$label, finished: keeps the new order and stays complete',
    (run) => {
      const session = attachHeap(run.start);
      expect(session.run(run.command, run.args), `session.run for ${describeRun(run)}`).toBe('');
      session.finish();
      const before = session.getSnapshot();
      session.retheme(canvasThemes.dark);
      const after = session.getSnapshot();
      const rebuilt = latest();
      const what = `retheme(dark) after ${describeRun(run)} finished`;

      expect(
        stateOf(rebuilt),
        `${what} should show the switched heap ${show(run.end)}, got ${show(stateOf(rebuilt))}`
      ).toEqual(run.end);
      expect(
        after.playback,
        `${what}: the run was ${before.playback} and should stay so, got ${after.playback}`
      ).toBe(before.playback);
      expect(
        after.progress,
        `${what} keeps progress ${before.progress}, got ${after.progress}`
      ).toBeCloseTo(before.progress, 6);
      session.dispose();
    }
  );
});
