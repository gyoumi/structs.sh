// @vitest-environment jsdom
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { scorePuzzle, type PuzzleInstance } from '@/Services/puzzles/puzzles';
import { CODE_CANVAS, CODE_CONTAINER, VISUALISER_CANVAS } from '@/visualiser-src/common/constants';
import GraphicalSortsElement from '../data-structure/GraphicalSortsElement';
import { quickSort } from './quick';

// Needs the puzzles wasm built first: `pnpm run wasm` (or `pnpm run puzzles`) from the repo root.

const QUICKSORT_TEMPLATE = 'quicksort-most-comparisons';

const DAILY_12: PuzzleInstance = {
  template: QUICKSORT_TEMPLATE,
  values: [8, 1, 6, 3, 2, 7, 4, 5],
  fixed: [1, 4, 6],
};

const DAILY_7: PuzzleInstance = {
  template: QUICKSORT_TEMPLATE,
  values: [4, 2, 6, 8, 1, 5, 3, 7],
  fixed: [2, 5],
};

type FixedParityCase = {
  label: string;
  puzzle: PuzzleInstance;
  arrangement: number[];
};

const freePuzzle = (values: number[]): PuzzleInstance => ({
  template: QUICKSORT_TEMPLATE,
  values,
  fixed: [],
});

const fixedCase = (label: string, values: number[]): FixedParityCase => ({
  label,
  puzzle: freePuzzle(values),
  arrangement: values,
});

const FIXED_CASES: FixedParityCase[] = [
  // Hand-counted puzzle arrangements from crates/structs-puzzles/tests/quicksort.rs
  { label: 'DAILY_12 start', puzzle: DAILY_12, arrangement: [8, 1, 6, 3, 2, 7, 4, 5] },
  { label: 'DAILY_12 par', puzzle: DAILY_12, arrangement: [8, 1, 5, 3, 2, 7, 4, 6] },
  { label: 'DAILY_12 bestFromStart', puzzle: DAILY_12, arrangement: [8, 1, 6, 3, 2, 5, 4, 7] },
  { label: 'DAILY_12 bestFromPar', puzzle: DAILY_12, arrangement: [8, 1, 5, 3, 2, 6, 4, 7] },
  { label: 'DAILY_12 lowFromPar', puzzle: DAILY_12, arrangement: [5, 1, 8, 3, 2, 7, 4, 6] },
  { label: 'DAILY_7 start', puzzle: DAILY_7, arrangement: [4, 2, 6, 8, 1, 5, 3, 7] },
  fixedCase('4-value right recursion [2, 4, 1, 3]', [2, 4, 1, 3]),
  fixedCase('4-value left recursion [3, 4, 1, 2]', [3, 4, 1, 2]),

  // Small and empty edge cases
  fixedCase('empty array []', []),
  fixedCase('single element [42]', [42]),
  fixedCase('length 2 sorted [1, 2]', [1, 2]),
  fixedCase('length 2 reversed [2, 1]', [2, 1]),
  fixedCase('length 2 equal [7, 7]', [7, 7]),

  // Sorted and reversed arrays
  fixedCase('length 5 sorted [1..5]', [1, 2, 3, 4, 5]),
  fixedCase('length 5 reversed [5..1]', [5, 4, 3, 2, 1]),
  fixedCase('length 8 sorted [1..8]', [1, 2, 3, 4, 5, 6, 7, 8]),
  fixedCase('length 8 reversed [8..1]', [8, 7, 6, 5, 4, 3, 2, 1]),

  // All-equal and duplicate-heavy arrays (stresses <= vs < and highlight-only a[j] > v)
  fixedCase('all equal length 5 [5, 5, 5, 5, 5]', [5, 5, 5, 5, 5]),
  fixedCase('all equal length 8 [3 x 8]', [3, 3, 3, 3, 3, 3, 3, 3]),
  fixedCase('alternating two values [2, 1, 2, 1, 2, 1]', [2, 1, 2, 1, 2, 1]),
  fixedCase('repeated pivot and duplicates [3, 3, 1, 2, 3, 1, 2]', [3, 3, 1, 2, 3, 1, 2]),
  fixedCase('pivot smaller than equal middle [1, 5, 5, 5, 2]', [1, 5, 5, 5, 2]),
  fixedCase('pivot equal to tail with smaller interior [5, 1, 1, 1, 5]', [5, 1, 1, 1, 5]),
  fixedCase('contains zeros and duplicates [0, 3, 1, 0, 2]', [0, 3, 1, 0, 2]),
];

// Park-Miller LCG (modulus 2^31 - 1, multiplier 48271) — deterministic and exact in IEEE-754.
const LCG_MODULUS = 2147483647;
const LCG_MULTIPLIER = 48271;

const createRng = (seed: number) => {
  let state = (((seed % (LCG_MODULUS - 1)) + (LCG_MODULUS - 1)) % (LCG_MODULUS - 1)) + 1;
  return {
    nextInt(maxExclusive: number): number {
      state = (state * LCG_MULTIPLIER) % LCG_MODULUS;
      return state % maxExclusive;
    },
  };
};

type RandomParityCase = {
  seed: number;
  kind: 'permutation' | 'duplicates';
  values: number[];
};

const RANDOM_SEED_START = 20260101;
const DISTINCT_CASE_COUNT = 40;
const DUPLICATE_CASE_COUNT = 20;

const generateRandomCases = (): RandomParityCase[] => {
  const cases: RandomParityCase[] = [];

  for (let index = 0; index < DISTINCT_CASE_COUNT; index += 1) {
    const seed = RANDOM_SEED_START + index;
    const rng = createRng(seed);
    const length = 3 + rng.nextInt(14); // 3..16
    const values = Array.from({ length }, (_, i) => i + 1);
    for (let i = values.length - 1; i > 0; i -= 1) {
      const swapIndex = rng.nextInt(i + 1);
      [values[i], values[swapIndex]] = [values[swapIndex], values[i]];
    }
    cases.push({ seed, kind: 'permutation', values });
  }

  for (let index = 0; index < DUPLICATE_CASE_COUNT; index += 1) {
    const seed = RANDOM_SEED_START + DISTINCT_CASE_COUNT + index;
    const rng = createRng(seed);
    const length = 3 + rng.nextInt(14); // 3..16
    const alphabet = 2 + rng.nextInt(4); // 2..5 distinct values
    const values = Array.from({ length }, () => 1 + rng.nextInt(alphabet));
    cases.push({ seed, kind: 'duplicates', values });
  }

  return cases;
};

const RANDOM_CASES = generateRandomCases();

const formatArray = (values: number[]) => `[${values.join(', ')}]`;

const resetCanvases = () => {
  const visualiserId = VISUALISER_CANVAS.replace(/^#/, '');
  const codeId = CODE_CANVAS.replace(/^#/, '');
  document.body.innerHTML = `<svg id="${visualiserId}"></svg><svg id="${codeId}"></svg><div id="${CODE_CONTAINER}"></div>`;
};

const runTypeScriptQuicksort = (values: number[]): number => {
  resetCanvases();
  const elements = values.map((value) => GraphicalSortsElement.from(value));
  const producer = quickSort(elements);
  return producer.comparisons;
};

const PUZZLES_WASM_PATH = resolve(__dirname, '../../../Services/puzzles/generated/puzzles.wasm');

let restoreFetch: (() => void) | null = null;

beforeAll(() => {
  (SVGElement.prototype as unknown as SVGGraphicsElement).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
  (SVGElement.prototype as unknown as SVGGraphicsElement).getCTM = () => null;

  // Under jsdom, Vite resolves `new URL('./generated/puzzles.wasm', import.meta.url)`
  // to an http: URL rather than file:, so puzzles.ts fetches it instead of using readFile.
  const originalFetch = globalThis.fetch;
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (href.endsWith('/puzzles.wasm')) {
      const bytes = await readFile(PUZZLES_WASM_PATH);
      return new Response(new Uint8Array(bytes), {
        status: 200,
        headers: { 'content-type': 'application/wasm' },
      });
    }
    return originalFetch(input, init);
  });
  restoreFetch = () => spy.mockRestore();
});

afterAll(() => {
  restoreFetch?.();
});

describe('quicksort comparison parity (TypeScript visualiser vs wasm scorer)', () => {
  describe('fixed inputs and edge cases', () => {
    it.each(FIXED_CASES)(
      'matches wasm count for $label',
      async ({ label, puzzle, arrangement }) => {
        const wasmCount = await scorePuzzle(puzzle, arrangement);
        const tsCount = runTypeScriptQuicksort(arrangement);

        expect(
          tsCount,
          `${label} on input ${formatArray(arrangement)}: TS quickSort reported ${tsCount} comparisons, wasm scorePuzzle reported ${wasmCount}`
        ).toBe(wasmCount);
      }
    );
  });

  describe('seeded random inputs', () => {
    it.each(RANDOM_CASES)(
      'matches wasm count for seed $seed ($kind, length $values.length)',
      async ({ seed, kind, values }) => {
        const wasmCount = await scorePuzzle(freePuzzle(values), values);
        const tsCount = runTypeScriptQuicksort(values);

        expect(
          tsCount,
          `seed ${seed} (${kind}) on input ${formatArray(values)}: TS quickSort reported ${tsCount} comparisons, wasm scorePuzzle reported ${wasmCount}`
        ).toBe(wasmCount);
      }
    );
  });
});
