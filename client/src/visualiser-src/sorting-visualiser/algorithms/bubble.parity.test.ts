/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { evaluateChallenge } from '@/Services/challenges/challenges';
import {
  finalCounters,
  firstDecrease,
  formatArray,
  freshElements,
  seededCases,
  setUpParityEnvironment,
} from '@/test/sortingParity';
import { bubbleSort } from './bubble';

/** Needs the challenges wasm built first: `pnpm run challenges` from the repo root. */

type Counts = { passes: number; swaps: number };

type FixedCase = { label: string; values: number[]; expected: Counts };

const FIXED_CASES: FixedCase[] = [
  { label: 'empty array', values: [], expected: { passes: 0, swaps: 0 } },
  { label: 'single value', values: [42], expected: { passes: 0, swaps: 0 } },
  { label: 'two values reversed', values: [2, 1], expected: { passes: 1, swaps: 1 } },
  { label: 'already sorted', values: [1, 2, 3, 4, 5], expected: { passes: 1, swaps: 0 } },
  { label: 'three values [3, 1, 2]', values: [3, 1, 2], expected: { passes: 2, swaps: 2 } },
  {
    label: '8 reversed: n - 1 = 7 passes, the empty 8th outer iteration is not a pass',
    values: [8, 7, 6, 5, 4, 3, 2, 1],
    expected: { passes: 7, swaps: 28 },
  },
  { label: 'all equal', values: [7, 7, 7], expected: { passes: 1, swaps: 0 } },
  { label: 'duplicate pairs', values: [2, 2, 1, 1], expected: { passes: 3, swaps: 4 } },
  { label: 'duplicates mixed', values: [3, 1, 2, 3, 1], expected: { passes: 4, swaps: 5 } },
  {
    label: 'BUBBLE_21 start',
    values: [6, 2, 8, 1, 5, 3, 7, 4],
    expected: { passes: 5, swaps: 14 },
  },
  {
    label: 'BUBBLE_21 solved',
    values: [4, 2, 8, 1, 5, 3, 7, 6],
    expected: { passes: 4, swaps: 11 },
  },
  {
    label: 'BUBBLE_21 most passes',
    values: [8, 2, 6, 4, 5, 3, 7, 1],
    expected: { passes: 7, swaps: 18 },
  },
];

const RANDOM_CASES = seededCases(20261123, 35, 15);

const wasmCounts = async (values: number[]): Promise<Counts> => {
  const sorted = [...values].sort((a, b) => a - b);
  const result = await evaluateChallenge(
    { template: 'bubble-exact-passes', values: sorted, fixed: [], targetPasses: 1 },
    values
  );
  if (result.template !== 'bubble-exact-passes') {
    throw new Error(
      `evaluateChallenge(bubble-exact-passes, ${formatArray(values)}) answered for template ${result.template}`
    );
  }
  return { passes: result.passes, swaps: result.swaps };
};

const readCounter = (key: keyof Counts) => (runner: { counters?: unknown }) =>
  (runner.counters as Partial<Counts> | undefined)?.[key];

const checkParity = async (context: string, values: number[]) => {
  const wasm = await wasmCounts(values);
  const producer = bubbleSort(freshElements(values));
  const ts: Counts = { passes: producer.passes, swaps: producer.swaps };
  expect(
    ts,
    `${context} on ${formatArray(values)}: TS bubbleSort producer reported passes ${ts.passes} / swaps ${ts.swaps}, wasm evaluateChallenge reported passes ${wasm.passes} / swaps ${wasm.swaps}`
  ).toEqual(wasm);
  const last = finalCounters(producer.allRunners) ?? { passes: 0, swaps: 0 };
  expect(
    last,
    `${context} on ${formatArray(values)}: the last timeline step's counters should end at the producer's final { passes: ${ts.passes}, swaps: ${ts.swaps} }, got ${JSON.stringify(last)}`
  ).toEqual(ts);
  (['passes', 'swaps'] as const).forEach((key) => {
    const drop = firstDecrease(producer.allRunners, readCounter(key));
    expect(
      drop,
      `${context} on ${formatArray(values)}: counters.${key} should never go down between timeline steps, but went ${drop?.from} -> ${drop?.to} at counted step #${drop?.step}`
    ).toBeNull();
  });
  return wasm;
};

setUpParityEnvironment();

describe('bubble sort pass and swap parity (TypeScript visualiser vs wasm scorer)', () => {
  it.each(FIXED_CASES)('matches for $label', async ({ label, values, expected }) => {
    const wasm = await checkParity(label, values);
    expect(
      wasm,
      `${label} on ${formatArray(values)}: wasm should report hand-worked passes ${expected.passes} / swaps ${expected.swaps}, got passes ${wasm.passes} / swaps ${wasm.swaps}`
    ).toEqual(expected);
  });

  it.each(RANDOM_CASES)(
    'matches for seed $seed ($kind, length $values.length)',
    async ({ seed, kind, values }) => {
      const wasm = await checkParity(`seed ${seed} (${kind})`, values);
      expect(
        wasm.passes,
        `seed ${seed} (${kind}) on ${formatArray(values)}: passes must be at most n - 1 = ${Math.max(values.length - 1, 0)}, got ${wasm.passes}`
      ).toBeLessThanOrEqual(Math.max(values.length - 1, 0));
    }
  );
});
