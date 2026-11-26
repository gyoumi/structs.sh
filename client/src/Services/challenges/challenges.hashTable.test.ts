import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  isChallengesLoaded,
  loadChallenges,
  runHashTableStepLog,
  type HashOp,
  type HashRunResult,
  type HashSlot,
  type HashStep,
  type HashTableRequest,
} from './challenges';

/**
 * Needs the challenges wasm built first: `pnpm run challenges` from the repo root. Expected step logs
 * are worked by hand from the linear-probing contract in docs/hash-table.md (1a): h(key) =
 * key.rem_euclid(capacity), probe +1 mod capacity, insert reuses the first tombstone, search and delete
 * stop on an empty slot. Tables have capacity 11 unless a test says otherwise.
 */

const CAPACITY = 11;

const empty: HashSlot = { kind: 'empty' };
const tomb: HashSlot = { kind: 'tombstone' };
const occ = (key: number): HashSlot => ({ kind: 'occupied', key });

/** A capacity-11 table, empty apart from `filled` (index → slot). */
const table = (filled: Record<number, HashSlot> = {}): HashSlot[] =>
  Array.from({ length: CAPACITY }, (_, index) => filled[index] ?? empty);

const refill = (slots: HashSlot[], filled: Record<number, HashSlot>): HashSlot[] =>
  slots.map((slot, index) => filled[index] ?? slot);

const insert = (key: number): HashOp => ({ kind: 'insert', key });
const search = (key: number): HashOp => ({ kind: 'search', key });
const remove = (key: number): HashOp => ({ kind: 'delete', key });

const hash = (key: number, index: number): HashStep => ({
  kind: 'computeHash',
  key,
  capacity: CAPACITY,
  index,
});
const probe = (
  index: number,
  slot: HashSlot,
  probeNumber: number,
  firstTombstone: number | null = null
): HashStep => ({ kind: 'probe', index, slot, probeNumber, firstTombstone });

const result = (slots: HashSlot[], steps: HashStep[]): HashRunResult => ({
  slots,
  steps,
  probes: steps.filter((step) => step.kind === 'probe').length,
});

const slotText = (slot: HashSlot) =>
  slot.kind === 'occupied' ? String(slot.key) : slot.kind === 'tombstone' ? 'tomb' : '_';

/** `capacity 11, slots [_, tomb, 12, ...], insert(12)`: the request in one line. */
const describeRequest = (request: HashTableRequest) =>
  `runHashTableStepLog({capacity ${request.capacity}, slots [${request.slots.map(slotText).join(', ')}], ${request.op.kind}(${request.op.key})})`;

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

const BASELINE: HashTableRequest = { capacity: CAPACITY, slots: table(), op: insert(23) };

describe('runHashTableStepLog before loadChallenges', () => {
  it('reports not loaded and throws synchronously, naming loadChallenges', async () => {
    vi.resetModules();
    const fresh = await import('./challenges');
    expect(
      fresh.isChallengesLoaded(),
      'a freshly imported challenges module: isChallengesLoaded() should be false before loadChallenges() is called'
    ).toBe(false);
    const run = outcome(() => fresh.runHashTableStepLog(BASELINE));
    const message = run.threw && run.error instanceof Error ? run.error.message : '';
    expect(
      {
        threwError: run.threw && run.error instanceof Error,
        names: /loadChallenges|not loaded/i.test(message),
      },
      `${describeRequest(BASELINE)} before loadChallenges(): should throw an Error synchronously whose message mentions loadChallenges (or that the challenges wasm is not loaded); got ${shown(run)}`
    ).toEqual({ threwError: true, names: true });
  });

  it('reports loaded once loadChallenges resolves, and then runs', async () => {
    vi.resetModules();
    const fresh = await import('./challenges');
    await fresh.loadChallenges();
    expect(
      fresh.isChallengesLoaded(),
      'a freshly imported challenges module: isChallengesLoaded() should be true after await loadChallenges()'
    ).toBe(true);
    const run = outcome(() => fresh.runHashTableStepLog(BASELINE));
    expect(
      run.threw,
      `${describeRequest(BASELINE)} after await loadChallenges() on a fresh module should return, got ${shown(run)}`
    ).toBe(false);
  });
});

describe('runHashTableStepLog — hash-table-linear through the wasm build', () => {
  beforeAll(async () => {
    await loadChallenges();
  });

  it('isChallengesLoaded() is true after loadChallenges()', () => {
    expect(
      isChallengesLoaded(),
      'after await loadChallenges(), isChallengesLoaded() should be true'
    ).toBe(true);
  });

  it('returns the result synchronously, not a Promise', () => {
    const run = outcome(() => runHashTableStepLog(BASELINE));
    const value = run.threw ? undefined : run.value;
    expect(
      {
        threw: run.threw,
        isPromise: value instanceof Promise,
        thenType: typeof (value as { then?: unknown } | undefined)?.then,
      },
      `${describeRequest(BASELINE)} is synchronous, so it should return a plain HashRunResult (no .then); got ${shown(run)}`
    ).toEqual({ threw: false, isPromise: false, thenType: 'undefined' });
  });

  type Case = { label: string; request: HashTableRequest; expected: HashRunResult };

  const start = {
    wrap: table({ 10: occ(21), 0: occ(32) }),
    duplicate: table({ 1: tomb, 2: occ(12) }),
    reuse: table({ 1: tomb, 2: occ(23) }),
    full: Array.from({ length: CAPACITY }, (_, key) => occ(key)),
    searchHit: table({ 3: tomb, 4: occ(14) }),
    searchMiss: table({ 5: occ(5) }),
    deleteHit: table({ 7: occ(7) }),
  };

  const CASES: Case[] = [
    {
      label: 'insert(23) into an empty table hashes to 1 and places it in empty slot 1',
      request: { capacity: CAPACITY, slots: table(), op: insert(23) },
      expected: result(table({ 1: occ(23) }), [
        hash(23, 1),
        probe(1, empty, 1),
        { kind: 'place', key: 23, index: 1, replacedTombstone: false },
      ]),
    },
    {
      label: 'insert(43) hashes to 10, collides at 10 and 0 (wrapping), lands in empty slot 1',
      request: { capacity: CAPACITY, slots: start.wrap, op: insert(43) },
      expected: result(refill(start.wrap, { 1: occ(43) }), [
        hash(43, 10),
        probe(10, occ(21), 1),
        probe(0, occ(32), 2),
        probe(1, empty, 3),
        { kind: 'place', key: 43, index: 1, replacedTombstone: false },
      ]),
    },
    {
      label:
        'insert(12) passes the tombstone at 1 (firstTombstone 1), finds 12 at 2: alreadyPresent, table unchanged',
      request: { capacity: CAPACITY, slots: start.duplicate, op: insert(12) },
      expected: result(start.duplicate, [
        hash(12, 1),
        probe(1, tomb, 1, 1),
        probe(2, occ(12), 2, 1),
        { kind: 'alreadyPresent', key: 12, index: 2 },
      ]),
    },
    {
      label: 'insert(34) probes on to empty slot 3, then places 34 in the first tombstone (1)',
      request: { capacity: CAPACITY, slots: start.reuse, op: insert(34) },
      expected: result(refill(start.reuse, { 1: occ(34) }), [
        hash(34, 1),
        probe(1, tomb, 1, 1),
        probe(2, occ(23), 2, 1),
        probe(3, empty, 3, 1),
        { kind: 'place', key: 34, index: 1, replacedTombstone: true },
      ]),
    },
    {
      label: 'insert(11) into slots holding 0..10 probes all 11 slots: tableFull, table unchanged',
      request: { capacity: CAPACITY, slots: start.full, op: insert(11) },
      expected: result(start.full, [
        hash(11, 0),
        ...start.full.map((slot, index) => probe(index, slot, index + 1)),
        { kind: 'tableFull', key: 11 },
      ]),
    },
    {
      label: 'search(14) passes the tombstone at 3 (firstTombstone stays null), finds 14 at 4',
      request: { capacity: CAPACITY, slots: start.searchHit, op: search(14) },
      expected: result(start.searchHit, [
        hash(14, 3),
        probe(3, tomb, 1),
        probe(4, occ(14), 2),
        { kind: 'found', key: 14, index: 4 },
      ]),
    },
    {
      label: 'search(16) hashes to 5, passes 5, stops at empty slot 6: notFound',
      request: { capacity: CAPACITY, slots: start.searchMiss, op: search(16) },
      expected: result(start.searchMiss, [
        hash(16, 5),
        probe(5, occ(5), 1),
        probe(6, empty, 2),
        { kind: 'notFound', key: 16 },
      ]),
    },
    {
      label: 'delete(7) finds 7 at 7 and turns that slot into a tombstone',
      request: { capacity: CAPACITY, slots: start.deleteHit, op: remove(7) },
      expected: result(refill(start.deleteHit, { 7: tomb }), [
        hash(7, 7),
        probe(7, occ(7), 1),
        { kind: 'markTombstone', key: 7, index: 7 },
      ]),
    },
    {
      label: 'delete(9) on an empty table stops at empty slot 9: notFound, table unchanged',
      request: { capacity: CAPACITY, slots: table(), op: remove(9) },
      expected: result(table(), [hash(9, 9), probe(9, empty, 1), { kind: 'notFound', key: 9 }]),
    },
    {
      label: 'insert(-1): -1 rem_euclid 11 is 10, so it lands in slot 10',
      request: { capacity: CAPACITY, slots: table(), op: insert(-1) },
      expected: result(table({ 10: occ(-1) }), [
        hash(-1, 10),
        probe(10, empty, 1),
        { kind: 'place', key: -1, index: 10, replacedTombstone: false },
      ]),
    },
    {
      label: 'search(-2147483648) (i32 min): rem_euclid 11 is 9, an empty slot, so notFound',
      request: { capacity: CAPACITY, slots: table(), op: search(-2147483648) },
      expected: result(table(), [
        hash(-2147483648, 9),
        probe(9, empty, 1),
        { kind: 'notFound', key: -2147483648 },
      ]),
    },
  ];

  it.each(CASES)('$label', ({ label, request, expected }) => {
    const run = outcome(() => runHashTableStepLog(request));
    expect(
      run,
      `${label}: ${describeRequest(request)} should return ${JSON.stringify(expected)}; got ${shown(run)}`
    ).toEqual({ threw: false, value: expected });
  });

  it('chains result.slots across insert, insert, delete, search, insert', () => {
    const ops = [insert(23), insert(34), remove(23), search(34), insert(45)];
    const expectedTerminals: HashStep[] = [
      { kind: 'place', key: 23, index: 1, replacedTombstone: false },
      { kind: 'place', key: 34, index: 2, replacedTombstone: false },
      { kind: 'markTombstone', key: 23, index: 1 },
      { kind: 'found', key: 34, index: 2 },
      { kind: 'place', key: 45, index: 1, replacedTombstone: true },
    ];
    const expectedProbes = [1, 2, 1, 2, 3];
    let slots = table();
    ops.forEach((op, i) => {
      const request = { capacity: CAPACITY, slots, op };
      const run = outcome(() => runHashTableStepLog(request));
      const value = run.threw ? undefined : (run.value as HashRunResult);
      expect(
        { terminal: value?.steps.at(-1), probes: value?.probes },
        `chain step ${i + 1} of [insert(23), insert(34), delete(23), search(34), insert(45)]: ${describeRequest(request)} should end with ${JSON.stringify(expectedTerminals[i])} after ${expectedProbes[i]} probes; got ${shown(run)}`
      ).toEqual({ terminal: expectedTerminals[i], probes: expectedProbes[i] });
      slots = value?.slots ?? slots;
    });
    expect(
      slots,
      `after the chain, slot 1 should hold 45 (reused tombstone) and slot 2 should hold 34; got [${slots.map(slotText).join(', ')}]`
    ).toEqual(table({ 1: occ(45), 2: occ(34) }));
  });

  it('sends only capacity, slots and op, dropping extra properties on the request', () => {
    const extras = { ...BASELINE, id: 7, label: 'demo', history: [] } as HashTableRequest;
    const expected = result(table({ 1: occ(23) }), [
      hash(23, 1),
      probe(1, empty, 1),
      { kind: 'place', key: 23, index: 1, replacedTombstone: false },
    ]);
    const run = outcome(() => runHashTableStepLog(extras));
    expect(
      run,
      `${describeRequest(BASELINE)} with extra properties id, label and history: the wasm rejects unknown fields, so the bridge must drop them and return ${JSON.stringify(expected)}; got ${shown(run)}`
    ).toEqual({ threw: false, value: expected });
  });

  it('always asks for hash-table-linear, even if the request object carries its own algorithm', () => {
    const sneaky = { ...BASELINE, algorithm: 'bfs' } as HashTableRequest;
    const run = outcome(() => runHashTableStepLog(sneaky));
    expect(
      run.threw,
      `${describeRequest(BASELINE)} with an extra property algorithm: 'bfs': the bridge chooses the algorithm itself, so this should still return a result; got ${shown(run)}`
    ).toBe(false);
  });

  it('throws an Error naming capacity when capacity is 0', () => {
    const request: HashTableRequest = { capacity: 0, slots: [], op: insert(1) };
    const run = outcome(() => runHashTableStepLog(request));
    const message = run.threw && run.error instanceof Error ? run.error.message : '';
    expect(
      {
        threwError: run.threw && run.error instanceof Error,
        namesCapacity: /capacity/i.test(message),
      },
      `${describeRequest(request)}: capacity 0 is invalid, so this should throw an Error whose message mentions capacity; got ${shown(run)}`
    ).toEqual({ threwError: true, namesCapacity: true });
  });

  it('throws an Error naming both numbers when slots.length differs from capacity', () => {
    const request: HashTableRequest = {
      capacity: 7,
      slots: [empty, empty, empty, empty],
      op: insert(1),
    };
    const run = outcome(() => runHashTableStepLog(request));
    const message = run.threw && run.error instanceof Error ? run.error.message : '';
    expect(
      {
        threwError: run.threw && run.error instanceof Error,
        names7: message.includes('7'),
        names4: message.includes('4'),
      },
      `${describeRequest(request)}: capacity 7 with 4 slots is invalid, so this should throw an Error whose message names 7 and 4; got ${shown(run)}`
    ).toEqual({ threwError: true, names7: true, names4: true });
  });
});
