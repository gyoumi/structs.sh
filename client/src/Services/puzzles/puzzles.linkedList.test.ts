import { describe, expect, it } from 'vitest';
import {
  evaluatePuzzle,
  scorePuzzle,
  type EvalPuzzleInstance,
  type ListOperation,
} from './puzzles';

/**
 * Needs the puzzles wasm built first: `pnpm run puzzles` from the repo root. Counts are worked by
 * hand in e2e/support/daily-list-fixtures.ts (DRIFT_26): insert(v, i) walks min(i, length before),
 * delete(i) walks i + 1, cost = operations + nodes walked.
 */

const DRIFT_26: EvalPuzzleInstance = {
  template: 'linked-list-index-drift',
  start: [8, 3, 6, 1],
  target: [3, 6, 5, 1],
};

const ins = (value: number, index: number): ListOperation => ({ kind: 'insert', value, index });
const del = (index: number): ListOperation => ({ kind: 'delete', index });

const listed = (operations: readonly ListOperation[]) =>
  `[${operations
    .map((op) =>
      op.kind === 'insert' ? `insert(${op.value}, ${op.index})` : `delete(${op.index})`
    )
    .join(', ')}]`;

const describeCall = (puzzle: object, operations: readonly ListOperation[]) =>
  `evaluatePuzzle(${JSON.stringify(puzzle)}, ${listed(operations)})`;

const evaluate = (puzzle: EvalPuzzleInstance, operations: readonly ListOperation[]) =>
  evaluatePuzzle(puzzle, [...operations]);

const settle = <T>(promise: Promise<T>) =>
  promise.then(
    (result) => ({ rejected: false as const, result }),
    (error: unknown) => ({ rejected: true as const, error })
  );

const drift = (solved: boolean, operations: number, nodesWalked: number) => ({
  template: 'linked-list-index-drift',
  solved,
  score: solved ? operations + nodesWalked : null,
  operations,
  nodesWalked,
  cost: operations + nodesWalked,
});

type Case = {
  label: string;
  puzzle: EvalPuzzleInstance;
  operations: ListOperation[];
  expected: ReturnType<typeof drift>;
};

const CASES: Case[] = [
  {
    label: 'index drift #26 cheap: delete(0) walks 1, insert(5, 2) walks 2, solved with cost 5',
    puzzle: DRIFT_26,
    operations: [del(0), ins(5, 2)],
    expected: drift(true, 2, 3),
  },
  {
    label: 'index drift #26 costly: walks 4 + 1 + 2 + 3 = 10, solved with cost 14',
    puzzle: DRIFT_26,
    operations: [del(3), del(0), ins(5, 2), ins(1, 3)],
    expected: drift(true, 4, 10),
  },
  {
    label:
      'index drift #26 unsolved: insert(5, 0) walks 0, final [5, 8, 3, 6, 1] is not the target',
    puzzle: DRIFT_26,
    operations: [ins(5, 0)],
    expected: drift(false, 1, 0),
  },
  {
    label: 'insert(9, 10) on [1, 2] walks min(10, 2) = 2 and appends',
    puzzle: { template: 'linked-list-index-drift', start: [1, 2], target: [1, 2, 9] },
    operations: [ins(9, 10)],
    expected: drift(true, 1, 2),
  },
  {
    label: 'no operations on a start that already is the target: solved with cost 0',
    puzzle: { template: 'linked-list-index-drift', start: [1, 2], target: [1, 2] },
    operations: [],
    expected: drift(true, 0, 0),
  },
  {
    label: 'negative values: delete(1) walks 2, insert(-1, 1) walks 1',
    puzzle: { template: 'linked-list-index-drift', start: [-7, 0, 7], target: [-7, -1, 7] },
    operations: [del(1), ins(-1, 1)],
    expected: drift(true, 2, 3),
  },
];

describe('evaluatePuzzle — linked-list-index-drift through the wasm build', () => {
  it.each(CASES)('$label', async ({ label, puzzle, operations, expected }) => {
    const result = await evaluate(puzzle, operations);
    expect(
      result,
      `${label}: ${describeCall(puzzle, operations)} should resolve to ${JSON.stringify(expected)}, got ${JSON.stringify(result)}`
    ).toEqual(expected);
  });

  it('ignores daily metadata (number, par, date) on a full index drift puzzle', async () => {
    const daily = { ...DRIFT_26, number: 26, par: 6, date: '2026-11-26' };
    const operations = [del(0), ins(5, 2)];
    const expected = drift(true, 2, 3);
    const outcome = await settle(evaluate(daily, operations));
    const got = outcome.rejected
      ? `a rejection: ${String((outcome.error as Error).message)}`
      : JSON.stringify(outcome.result);
    expect(
      outcome,
      `${describeCall(daily, operations)}: number, par and date must not reach the wasm request (it rejects unknown fields), so this should resolve to ${JSON.stringify(expected)}; got ${got}`
    ).toEqual({ rejected: false, result: expected });
  });
});

describe('evaluatePuzzle — invalid index drift operations', () => {
  it.each([
    { label: 'delete(4) on the 4-node #26 start', operations: [del(4)] },
    { label: 'delete(3) after delete(0) left 3 nodes', operations: [del(0), del(3)] },
  ])('rejects $label with a message naming the delete', async ({ label, operations }) => {
    const call = describeCall(DRIFT_26, operations);
    const outcome = await settle(evaluate(DRIFT_26, operations));
    const message = outcome.rejected ? String((outcome.error as Error).message) : '';
    expect(
      { rejected: outcome.rejected, namesDelete: /delete/i.test(message) },
      `${label}: ${call} is past the end of the list, so it should reject with an Error whose message mentions "delete"; got ${outcome.rejected ? JSON.stringify(message) : `a resolved ${JSON.stringify(outcome.result)}`}`
    ).toEqual({ rejected: true, namesDelete: true });
  });

  it.each([
    { label: 'a negative index', operations: [del(-1)] },
    { label: 'a fractional index', operations: [ins(5, 1.5)] },
  ])('rejects $label', async ({ label, operations }) => {
    const cheap = [del(0), ins(5, 2)];
    const baseline = await settle(evaluate(DRIFT_26, cheap));
    expect(
      baseline.rejected,
      `baseline: ${describeCall(DRIFT_26, cheap)} should resolve, so the next rejection comes from ${label}; got ${baseline.rejected ? String((baseline.error as Error).message) : 'a result'}`
    ).toBe(false);
    const outcome = await settle(evaluate(DRIFT_26, operations));
    expect(
      outcome.rejected,
      `${label}: ${describeCall(DRIFT_26, operations)} should reject (indices are whole numbers from 0), but resolved with ${outcome.rejected ? '' : JSON.stringify(outcome.result)}`
    ).toBe(true);
  });

  it('scorePuzzle rejects linked-list-index-drift and points to evaluatePuzzle', async () => {
    const puzzle = { template: 'linked-list-index-drift', values: [8, 3, 6, 1], fixed: [] };
    const outcome = await settle(scorePuzzle(puzzle, puzzle.values));
    const message = outcome.rejected ? String((outcome.error as Error).message) : '';
    expect(
      { rejected: outcome.rejected, namesEvaluatePuzzle: /evaluatePuzzle/i.test(message) },
      `scorePuzzle(${JSON.stringify(puzzle)}, [8, 3, 6, 1]): index drift has more than a score, so this should reject naming evaluatePuzzle; got ${outcome.rejected ? JSON.stringify(message) : `a resolved ${JSON.stringify(outcome.result)}`}`
    ).toEqual({ rejected: true, namesEvaluatePuzzle: true });
  });
});
