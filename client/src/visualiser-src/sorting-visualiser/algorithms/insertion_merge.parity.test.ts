/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { evaluateChallenge } from '@/Services/challenges/challenges';
import {
  finalCounter,
  firstDecrease,
  formatArray,
  freshElements,
  seededCases,
  setUpParityEnvironment,
} from '@/test/sortingParity';
import { insertionSort } from './insertion';
import { mergeSort } from './merge';

/** Needs the challenges wasm built first: `pnpm run challenges` from the repo root. */

type Counts = { insertionComparisons: number; mergeComparisons: number };

type FixedCase = { label: string; values: number[]; expected: Counts };

const counts = (insertionComparisons: number, mergeComparisons: number): Counts => ({
  insertionComparisons,
  mergeComparisons,
});

const FIXED_CASES: FixedCase[] = [
  { label: 'empty array', values: [], expected: counts(0, 0) },
  { label: 'single value', values: [42], expected: counts(0, 0) },
  { label: 'sorted', values: [1, 2, 3, 4, 5], expected: counts(4, 7) },
  { label: 'reversed', values: [5, 4, 3, 2, 1], expected: counts(10, 5) },
  { label: 'tie [2, 1]', values: [2, 1], expected: counts(1, 1) },
  { label: 'tie [3, 1, 2]', values: [3, 1, 2], expected: counts(3, 3) },
  { label: 'INSERTION_22 start', values: [5, 3, 8, 1, 7, 2, 6, 4], expected: counts(20, 17) },
  { label: 'INSERTION_22 tie', values: [5, 3, 1, 6, 7, 2, 8, 4], expected: counts(16, 16) },
  {
    label: 'INSERTION_22 solved upset',
    values: [5, 3, 2, 6, 7, 1, 4, 8],
    expected: counts(15, 16),
  },
  { label: 'equal values stop insertion', values: [1, 2, 2], expected: counts(2, 3) },
  { label: 'all equal', values: [7, 7, 7], expected: counts(2, 3) },
  { label: 'merge takes left on ties', values: [1, 2, 1], expected: counts(3, 3) },
  { label: 'duplicates mixed', values: [3, 1, 2, 3, 1], expected: counts(8, 8) },
  { label: 'duplicate pairs reversed', values: [2, 2, 1, 1], expected: counts(6, 4) },
];

const RANDOM_CASES = seededCases(20261124, 35, 15);

const wasmCounts = async (values: number[]): Promise<Counts> => {
  const sorted = [...values].sort((a, b) => a - b);
  const result = await evaluateChallenge(
    { template: 'insertion-beats-merge', values: sorted, fixed: [] },
    values
  );
  if (result.template !== 'insertion-beats-merge') {
    throw new Error(
      `evaluateChallenge(insertion-beats-merge, ${formatArray(values)}) answered for template ${result.template}`
    );
  }
  return counts(result.insertionComparisons, result.mergeComparisons);
};

type Producer = { comparisons: number; allRunners: readonly { counter?: number }[] };

const checkProducer = (context: string, sort: string, producer: Producer, wasm: number) => {
  expect(
    producer.comparisons,
    `${context}: TS ${sort} producer reported ${producer.comparisons} comparisons, wasm evaluateChallenge reported ${wasm}`
  ).toBe(wasm);
  const last = finalCounter(producer.allRunners) ?? 0;
  expect(
    last,
    `${context}: the last timeline step's ${sort} counter should end at the producer's final ${producer.comparisons} comparisons, got ${last}`
  ).toBe(producer.comparisons);
  const drop = firstDecrease(producer.allRunners, (runner) => runner.counter);
  expect(
    drop,
    `${context}: the ${sort} counter should never go down between timeline steps, but went ${drop?.from} -> ${drop?.to} at counted step #${drop?.step}`
  ).toBeNull();
};

const checkParity = async (context: string, values: number[]) => {
  const wasm = await wasmCounts(values);
  const where = `${context} on ${formatArray(values)}`;
  checkProducer(
    where,
    'insertionSort',
    insertionSort(freshElements(values)),
    wasm.insertionComparisons
  );
  checkProducer(where, 'mergeSort', mergeSort(freshElements(values)), wasm.mergeComparisons);
  return wasm;
};

setUpParityEnvironment();

describe('insertion and merge sort comparison parity (TypeScript visualiser vs wasm scorer)', () => {
  it.each(FIXED_CASES)('matches for $label', async ({ label, values, expected }) => {
    const wasm = await checkParity(label, values);
    expect(
      wasm,
      `${label} on ${formatArray(values)}: wasm should report hand-worked insertion ${expected.insertionComparisons} / merge ${expected.mergeComparisons} comparisons, got insertion ${wasm.insertionComparisons} / merge ${wasm.mergeComparisons}`
    ).toEqual(expected);
  });

  it.each(RANDOM_CASES)(
    'matches for seed $seed ($kind, length $values.length)',
    async ({ seed, kind, values }) => {
      const wasm = await checkParity(`seed ${seed} (${kind})`, values);
      const n = values.length;
      expect(
        wasm.insertionComparisons,
        `seed ${seed} (${kind}) on ${formatArray(values)}: insertion sort makes between n - 1 = ${n - 1} and n(n - 1)/2 = ${(n * (n - 1)) / 2} comparisons, got ${wasm.insertionComparisons}`
      ).toSatisfy((count: number) => count >= n - 1 && count <= (n * (n - 1)) / 2);
    }
  );
});
