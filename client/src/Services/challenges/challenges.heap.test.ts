import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  loadChallenges,
  runHashTableStepLog,
  runHeapStepLog,
  type HashTableRequest,
  type HeapOp,
  type HeapOrder,
  type HeapRequest,
  type HeapRunResult,
  type HeapStep,
} from './challenges';

/**
 * Needs the challenges wasm built first: `pnpm run challenges` from the repo root. Expected step logs
 * are worked by hand from the binary heap contract in docs/heap.md (1a, "Exact step order"): a
 * 0-indexed array, children of i at 2i + 1 and 2i + 2, "better" is strictly smaller (min) or strictly
 * greater (max), equal keys never swap, sift down picks the left child on a tie. `comparisons` counts
 * compareParent and compareChildren steps, `swaps` counts swap steps.
 */

const insert = (key: number): HeapOp => ({ kind: 'insert', key });
const pop: HeapOp = { kind: 'pop' };
const rebuild: HeapOp = { kind: 'rebuild' };

const append = (key: number, index: number): HeapStep => ({ kind: 'append', key, index });
const compareParent = (index: number, parent: number, swap: boolean): HeapStep => ({
  kind: 'compareParent',
  index,
  parent,
  swap,
});
const compareChildren = (
  index: number,
  left: number,
  right: number | null,
  best: number,
  swap: boolean
): HeapStep => ({ kind: 'compareChildren', index, left, right, best, swap });
const swap = (parent: number, child: number): HeapStep => ({ kind: 'swap', parent, child });
const settled = (key: number, index: number): HeapStep => ({ kind: 'settled', key, index });
const reinserted = (key: number, index: number): HeapStep => ({ kind: 'reinserted', key, index });

/** The whole result, with `comparisons` and `swaps` counted from the hand-written `steps`. */
const result = (
  items: number[],
  steps: HeapStep[],
  popped: number | null = null
): HeapRunResult => ({
  items,
  steps,
  comparisons: steps.filter((s) => s.kind === 'compareParent' || s.kind === 'compareChildren')
    .length,
  swaps: steps.filter((s) => s.kind === 'swap').length,
  popped,
});

const heapRequest = (
  order: HeapOrder,
  capacity: number,
  items: number[],
  op: HeapOp
): HeapRequest => ({
  order,
  capacity,
  items,
  op,
});

/** `runHeapStepLog({order max, capacity 15, items [9, 4, 7], op {"kind":"insert","key":8}})`. */
const describeRequest = (request: unknown) => {
  const r = request as Record<string, unknown>;
  const fields = ['order', 'capacity', 'items', 'op']
    .map((field) => (field in r ? `${field} ${JSON.stringify(r[field])}` : `no ${field}`))
    .join(', ');
  return `runHeapStepLog({${fields}})`;
};

const outcome = (run: () => unknown) => {
  try {
    const value = run();
    if (value instanceof Promise) value.catch(() => undefined);
    return { threw: false as const, value };
  } catch (error) {
    return { threw: true as const, error };
  }
};

const shown = (run: ReturnType<typeof outcome>) =>
  run.threw
    ? `a thrown ${run.error instanceof Error ? `Error(${JSON.stringify(run.error.message)})` : String(run.error)}`
    : `a returned ${run.value instanceof Promise ? 'Promise' : JSON.stringify(run.value)}`;

const thrownMessage = (run: ReturnType<typeof outcome>) =>
  run.threw && run.error instanceof Error ? run.error.message : '';

const BASELINE = heapRequest('max', 15, [9, 4, 7], insert(8));
const BASELINE_RESULT = result(
  [9, 8, 7, 4],
  [append(8, 3), compareParent(3, 1, true), swap(1, 3), compareParent(1, 0, false), settled(8, 1)]
);

describe('runHeapStepLog before loadChallenges', () => {
  it('throws synchronously, naming loadChallenges', async () => {
    vi.resetModules();
    const fresh = await import('./challenges');
    const run = outcome(() => fresh.runHeapStepLog(BASELINE));
    expect(
      {
        threwError: run.threw && run.error instanceof Error,
        names: /loadChallenges|not loaded/i.test(thrownMessage(run)),
      },
      `${describeRequest(BASELINE)} on a freshly imported module before loadChallenges(): should throw an Error synchronously whose message mentions loadChallenges (or that the challenges wasm is not loaded); got ${shown(run)}`
    ).toEqual({ threwError: true, names: true });
  });

  it('runs once loadChallenges resolves', async () => {
    vi.resetModules();
    const fresh = await import('./challenges');
    await fresh.loadChallenges();
    const run = outcome(() => fresh.runHeapStepLog(BASELINE));
    expect(
      run,
      `${describeRequest(BASELINE)} after await loadChallenges() on a fresh module should return ${JSON.stringify(BASELINE_RESULT)}; got ${shown(run)}`
    ).toEqual({ threw: false, value: BASELINE_RESULT });
  });
});

describe('runHeapStepLog — binary-heap through the wasm build', () => {
  beforeAll(async () => {
    await loadChallenges();
  });

  it('returns the result synchronously, not a Promise', () => {
    const run = outcome(() => runHeapStepLog(BASELINE));
    const value = run.threw ? undefined : run.value;
    expect(
      {
        threw: run.threw,
        isPromise: value instanceof Promise,
        thenType: typeof (value as { then?: unknown } | undefined)?.then,
      },
      `${describeRequest(BASELINE)} is synchronous, so it should return a plain HeapRunResult (no .then); got ${shown(run)}`
    ).toEqual({ threw: false, isPromise: false, thenType: 'undefined' });
  });

  type Case = { label: string; request: HeapRequest; expected: HeapRunResult };
  const full = Array.from({ length: 15 }, (_, key) => key);

  const CASES: Case[] = [
    {
      label: 'max insert(8) into [9, 4, 7] appends at 3, swaps past 4, stops below 9 at 1',
      request: BASELINE,
      expected: BASELINE_RESULT,
    },
    {
      label: 'min insert(1) into [2, 4, 3, 5] swaps past 4 then 2 and settles at the root',
      request: heapRequest('min', 15, [2, 4, 3, 5], insert(1)),
      expected: result(
        [1, 2, 3, 5, 4],
        [
          append(1, 4),
          compareParent(4, 1, true),
          swap(1, 4),
          compareParent(1, 0, true),
          swap(0, 1),
          settled(1, 0),
        ]
      ),
    },
    {
      label: 'min insert(2) under an equal parent 2 is not better, so it stays at 2',
      request: heapRequest('min', 15, [2, 4], insert(2)),
      expected: result([2, 4, 2], [append(2, 2), compareParent(2, 0, false), settled(2, 2)]),
    },
    ...(['min', 'max'] as const).map((order) => ({
      label: `${order} insert(5) into [] appends at 0 and settles there with no compare`,
      request: heapRequest(order, 15, [], insert(5)),
      expected: result([5], [append(5, 0), settled(5, 0)]),
    })),
    {
      label: 'min insert(3) into 15 items at capacity 15 is heapFull, items unchanged',
      request: heapRequest('min', 15, full, insert(3)),
      expected: result(full, [{ kind: 'heapFull', key: 3 }]),
    },
    {
      label: 'max insert(8) into [9, 4, 7] at capacity 3 is heapFull, items unchanged',
      request: heapRequest('max', 3, [9, 4, 7], insert(8)),
      expected: result([9, 4, 7], [{ kind: 'heapFull', key: 8 }]),
    },
    {
      label:
        'max pop of [10, 9, 8, 3, 5, 6, 7] moves 7 to the root, swaps with 9, stops above 3 and 5',
      request: heapRequest('max', 15, [10, 9, 8, 3, 5, 6, 7], pop),
      expected: result(
        [9, 7, 8, 3, 5, 6],
        [
          { kind: 'takeRoot', key: 10 },
          { kind: 'moveLastToRoot', key: 7, from: 6 },
          compareChildren(0, 1, 2, 1, true),
          swap(0, 1),
          compareChildren(1, 3, 4, 4, false),
          settled(7, 1),
        ],
        10
      ),
    },
    {
      label: 'min pop of [1, 2, 3, 4, 5] swaps 5 with 2, then with 4 (right: null), settles at 3',
      request: heapRequest('min', 15, [1, 2, 3, 4, 5], pop),
      expected: result(
        [2, 4, 3, 5],
        [
          { kind: 'takeRoot', key: 1 },
          { kind: 'moveLastToRoot', key: 5, from: 4 },
          compareChildren(0, 1, 2, 1, true),
          swap(0, 1),
          compareChildren(1, 3, null, 3, true),
          swap(1, 3),
          settled(5, 3),
        ],
        1
      ),
    },
    {
      label: 'max pop of [9, 5, 5, 1]: children 5 and 5 tie, so best is the left (1)',
      request: heapRequest('max', 15, [9, 5, 5, 1], pop),
      expected: result(
        [5, 1, 5],
        [
          { kind: 'takeRoot', key: 9 },
          { kind: 'moveLastToRoot', key: 1, from: 3 },
          compareChildren(0, 1, 2, 1, true),
          swap(0, 1),
          settled(1, 1),
        ],
        9
      ),
    },
    {
      label: 'max pop of [7] takes 7 and ends with poppedLast, popped 7, items []',
      request: heapRequest('max', 15, [7], pop),
      expected: result(
        [],
        [
          { kind: 'takeRoot', key: 7 },
          { kind: 'poppedLast', key: 7 },
        ],
        7
      ),
    },
    ...(['min', 'max'] as const).map((order) => ({
      label: `${order} pop of [] is empty, popped null`,
      request: heapRequest(order, 15, [], pop),
      expected: result([], [{ kind: 'empty' }]),
    })),
    {
      label: 'rebuild of the max heap [9, 4, 7] as min re-inserts 9, 4, 7 in array order',
      request: heapRequest('min', 15, [9, 4, 7], rebuild),
      expected: result(
        [4, 9, 7],
        [
          { kind: 'startRebuild', order: 'min' },
          append(9, 0),
          reinserted(9, 0),
          append(4, 1),
          compareParent(1, 0, true),
          swap(0, 1),
          reinserted(4, 0),
          append(7, 2),
          compareParent(2, 0, false),
          reinserted(7, 2),
          { kind: 'rebuilt', order: 'min' },
        ]
      ),
    },
    {
      label: 'rebuild of the min heap [1, 3, 2, 5] as max re-inserts 1, 3, 2, 5 in array order',
      request: heapRequest('max', 15, [1, 3, 2, 5], rebuild),
      expected: result(
        [5, 3, 2, 1],
        [
          { kind: 'startRebuild', order: 'max' },
          append(1, 0),
          reinserted(1, 0),
          append(3, 1),
          compareParent(1, 0, true),
          swap(0, 1),
          reinserted(3, 0),
          append(2, 2),
          compareParent(2, 0, false),
          reinserted(2, 2),
          append(5, 3),
          compareParent(3, 1, true),
          swap(1, 3),
          compareParent(1, 0, true),
          swap(0, 1),
          reinserted(5, 0),
          { kind: 'rebuilt', order: 'max' },
        ]
      ),
    },
    ...(['min', 'max'] as const).map((order) => ({
      label: `${order} rebuild of [] is startRebuild then rebuilt`,
      request: heapRequest(order, 15, [], rebuild),
      expected: result(
        [],
        [
          { kind: 'startRebuild', order },
          { kind: 'rebuilt', order },
        ]
      ),
    })),
  ];

  it.each(CASES)('$label', ({ label, request, expected }) => {
    const run = outcome(() => runHeapStepLog(request));
    expect(
      run,
      `${label}: ${describeRequest(request)} should return ${JSON.stringify(expected)}; got ${shown(run)}`
    ).toEqual({ threw: false, value: expected });
  });

  it('sends only order, capacity, items and op, dropping extra properties on the request', () => {
    const extras = { ...BASELINE, id: 7, slots: [], algorithm: 'bfs' } as HeapRequest;
    const run = outcome(() => runHeapStepLog(extras));
    expect(
      run,
      `${describeRequest(BASELINE)} with extra properties id, slots and algorithm 'bfs': like runHashTableStepLog, the bridge picks the four fields and the algorithm itself, so it should return ${JSON.stringify(BASELINE_RESULT)}; got ${shown(run)}`
    ).toEqual({ threw: false, value: BASELINE_RESULT });
  });

  type Rejection = { label: string; request: unknown; named: RegExp[]; notNamed?: RegExp[] };
  const swapped = (field: string, value: unknown) => ({ ...BASELINE, [field]: value });
  const missing = (field: string) =>
    Object.fromEntries(Object.entries(BASELINE).filter(([key]) => key !== field));

  const REJECTIONS: Rejection[] = [
    ...['order', 'capacity', 'items', 'op'].map((field) => ({
      label: `a request with no ${field} names ${field}`,
      request: missing(field),
      named: [new RegExp(`\\b${field}\\b`)],
    })),
    ...(
      [
        ['order', 1, 'an order that is a number'],
        ['order', 'Min', 'a capitalised order "Min"'],
        ['order', 'MAX', 'an upper-case order "MAX"'],
        ['order', null, 'a null order'],
        ['capacity', '15', 'a capacity that is a string'],
        ['capacity', -1, 'a negative capacity'],
        ['capacity', 1.5, 'a fractional capacity'],
        ['items', '9,4,7', 'items that are a string'],
        ['items', [9, 4.5, 7], 'a fractional item'],
        ['items', [9, '4', 7], 'an item that is a string'],
        ['items', [2147483648], 'an item past i32 max'],
        ['op', 'insert 8', 'an op that is a string'],
        ['op', { kind: 'insert' }, 'an insert with no key'],
        ['op', { kind: 'push', key: 8 }, 'an unknown op kind'],
        ['op', { kind: 'insert', key: 8, extra: 1 }, 'an insert with an unknown field extra'],
      ] as const
    ).map(([field, value, what]) => ({
      label: `${what} names \`${field}\``,
      request: swapped(field, value),
      named: [new RegExp(`\`${field}\``)],
    })),
    {
      label: 'capacity 0 names capacity',
      request: heapRequest('max', 0, [], insert(1)),
      named: [/capacity/i],
    },
    {
      label: '3 items at capacity 2 names both numbers',
      request: heapRequest('max', 2, [9, 4, 7], pop),
      named: [/\b2\b/, /\b3\b/],
    },
    {
      label:
        'max items [20, 10, 15, 5, 11, 12, 16] name the first bad index 4 and its parent 1, not the later index 6',
      request: heapRequest('max', 15, [20, 10, 15, 5, 11, 12, 16], insert(1)),
      named: [/\b4\b/, /\b1\b/],
      notNamed: [/\b6\b/],
    },
    {
      label: 'min items [1, 5, 3, 2] name bad index 3 and its parent 1',
      request: heapRequest('min', 15, [1, 5, 3, 2], pop),
      named: [/\b3\b/, /\b1\b/],
    },
    {
      label: 'max rebuild of [1, 3, 2, 5, 0], not a min heap, names index 4 and its parent 1',
      request: heapRequest('max', 15, [1, 3, 2, 5, 0], rebuild),
      named: [/\b4\b/, /\b1\b/],
    },
    {
      label: 'min rebuild of [9, 4, 7, 3, 8], not a max heap, names index 4 and its parent 1',
      request: heapRequest('min', 15, [9, 4, 7, 3, 8], rebuild),
      named: [/\b4\b/, /\b1\b/],
    },
    {
      label:
        'min rebuild of the min heap [1, 3, 2], not a max heap, names index 1 and its parent 0',
      request: heapRequest('min', 15, [1, 3, 2], rebuild),
      named: [/\b1\b/, /\b0\b/],
    },
  ];

  it.each(REJECTIONS)('throws an Error: $label', ({ label, request, named, notNamed = [] }) => {
    const run = outcome(() => runHeapStepLog(request as HeapRequest));
    const message = thrownMessage(run);
    expect(
      {
        threwError: run.threw && run.error instanceof Error,
        named: named.map((pattern) => pattern.test(message)),
        notNamed: notNamed.map((pattern) => pattern.test(message)),
      },
      `${describeRequest(request)}: ${label}, so it should throw an Error whose message matches ${named.join(' and ')}${notNamed.length ? ` but not ${notNamed.join(' or ')}` : ''}; got ${shown(run)}`
    ).toEqual({
      threwError: true,
      named: named.map(() => true),
      notNamed: notNamed.map(() => false),
    });
  });

  it('leaves the hash-table-linear request working', () => {
    const empty = { kind: 'empty' } as const;
    const slots = Array.from({ length: 11 }, () => empty);
    const hashRequest: HashTableRequest = { capacity: 11, slots, op: { kind: 'insert', key: 23 } };
    const expected = {
      slots: slots.map((slot, index) => (index === 1 ? { kind: 'occupied', key: 23 } : slot)),
      steps: [
        { kind: 'computeHash', key: 23, capacity: 11, index: 1 },
        { kind: 'probe', index: 1, slot: empty, probeNumber: 1, firstTombstone: null },
        { kind: 'place', key: 23, index: 1, replacedTombstone: false },
      ],
      probes: 1,
    };
    const run = outcome(() => runHashTableStepLog(hashRequest));
    expect(
      run,
      `runHashTableStepLog({capacity 11, 11 empty slots, insert(23)}) alongside the heap: should still hash 23 to slot 1 and return ${JSON.stringify(expected)}; got ${shown(run)}`
    ).toEqual({ threw: false, value: expected });
  });
});
