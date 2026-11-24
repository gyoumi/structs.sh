import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, vi } from 'vitest';
import { CODE_CANVAS, CODE_CONTAINER, VISUALISER_CANVAS } from '@/visualiser-src/common/constants';
import GraphicalSortsElement from '@/visualiser-src/sorting-visualiser/data-structure/GraphicalSortsElement';

/** Shared setup for the sorting visualiser vs challenges wasm parity tests. Needs `pnpm run challenges` first. */

const PUZZLES_WASM_PATH = resolve(__dirname, '../Services/challenges/generated/challenges.wasm');

/** Stubs the SVG layout calls jsdom lacks, and serves challenges.wasm from disk (jsdom resolves it to http:). */
export const setUpParityEnvironment = () => {
  let restoreFetch: (() => void) | null = null;
  beforeAll(() => {
    (SVGElement.prototype as unknown as SVGGraphicsElement).getBBox = () =>
      ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
    (SVGElement.prototype as unknown as SVGGraphicsElement).getCTM = () => null;
    const originalFetch = globalThis.fetch;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const href =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (href.endsWith('/challenges.wasm')) {
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
  afterAll(() => restoreFetch?.());
};

/** Fresh canvases, then the values as sorting elements ready for a visualiser algorithm. */
export const freshElements = (values: number[]): GraphicalSortsElement[] => {
  const visualiserId = VISUALISER_CANVAS.replace(/^#/, '');
  const codeId = CODE_CANVAS.replace(/^#/, '');
  document.body.innerHTML = `<svg id="${visualiserId}"></svg><svg id="${codeId}"></svg><div id="${CODE_CONTAINER}"></div>`;
  return values.map((value) => GraphicalSortsElement.from(value));
};

export const formatArray = (values: readonly number[]) => `[${values.join(', ')}]`;

const LCG_MODULUS = 2147483647;
const LCG_MULTIPLIER = 48271;

/** Park-Miller LCG: deterministic and exact in IEEE-754. */
const createRng = (seed: number) => {
  let state = (((seed % (LCG_MODULUS - 1)) + (LCG_MODULUS - 1)) % (LCG_MODULUS - 1)) + 1;
  const next = (maxExclusive: number): number => {
    state = (state * LCG_MULTIPLIER) % LCG_MODULUS;
    return state % maxExclusive;
  };
  next(1);
  next(1);
  return next;
};

export type RandomCase = { seed: number; kind: 'permutation' | 'duplicates'; values: number[] };

/** `permutations` shuffled 1..n arrays then `duplicates` arrays over 2..5 distinct values, lengths 2..14. */
export const seededCases = (
  seedStart: number,
  permutations: number,
  duplicates: number
): RandomCase[] =>
  Array.from({ length: permutations + duplicates }, (_case, index) => {
    const seed = seedStart + index;
    const next = createRng(seed);
    const length = 2 + next(13);
    if (index >= permutations) {
      const alphabet = 2 + next(4);
      return { seed, kind: 'duplicates', values: Array.from({ length }, () => 1 + next(alphabet)) };
    }
    const values = Array.from({ length }, (_, i) => i + 1);
    for (let i = values.length - 1; i > 0; i -= 1) {
      const swapIndex = next(i + 1);
      [values[i], values[swapIndex]] = [values[swapIndex], values[i]];
    }
    return { seed, kind: 'permutation', values };
  });

type CountedRunner = { counter?: number; counters?: unknown };

/** The last `counter` any timeline step recorded, or undefined when no step recorded one. */
export const finalCounter = (runners: readonly CountedRunner[]) => {
  const counted = runners.filter((runner) => runner.counter !== undefined);
  return counted.length === 0 ? undefined : counted[counted.length - 1].counter;
};

/** The last `counters` any timeline step recorded, or undefined when no step recorded them. */
export const finalCounters = (runners: readonly CountedRunner[]) => {
  const counted = runners.filter((runner) => runner.counters !== undefined);
  return counted.length === 0 ? undefined : counted[counted.length - 1].counters;
};

/** The first step where `read` goes down, or null when it never does. */
export const firstDecrease = (
  runners: readonly CountedRunner[],
  read: (runner: CountedRunner) => number | undefined
) => {
  const seen = runners.map(read).filter((value): value is number => value !== undefined);
  const index = seen.findIndex((value, i) => i > 0 && value < seen[i - 1]);
  return index < 0 ? null : { step: index, from: seen[index - 1], to: seen[index] };
};
