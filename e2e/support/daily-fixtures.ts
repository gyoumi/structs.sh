/** Shape of GET /puzzles/today.json for the daily game. */
export interface DailyPuzzle {
  number: number;
  template: 'quicksort-most-comparisons';
  values: number[];
  fixed: number[];
  par: number;
  best: number;
}

/**
 * Named test puzzles with hand-worked and brute-forced quicksort comparison counts.
 *
 * Counts follow the C code shown beside the animation
 * (client/src/visualiser-src/sorting-visualiser/util/codeSnippets.ts):
 * each evaluation of `a[i] <= v` in the first while loop (including the check
 * that ends it), each evaluation of `v < a[j]` in the second (including the
 * check that ends it), and `a[i] < v` once after each partition.
 * `elements[j].data.value > v` in quick.ts is only for highlighting, is not in
 * the shown C code, and does not count. Index-only checks (`i < j`, `hi <= lo`)
 * do not count.
 *
 * Par is Math.round(median + 0.65 * (best - median)) over all permutations of the
 * free slots.
 */

/**
 * Puzzle #12: 8 values with 3 fixed slots [1, 4, 6] (values 1, 2, 4 locked).
 * Over all 5! = 120 free permutations: min 23, median 29, best 36, par 34.
 *
 * Hand-worked arrangements:
 * - start:         [8, 1, 6, 3, 2, 7, 4, 5] -> 30 comparisons (below par)
 * - par (2<->7):   [8, 1, 5, 3, 2, 7, 4, 6] -> 34 comparisons (reaches par, below best)
 * - bestFromStart (5<->7): [8, 1, 6, 3, 2, 5, 4, 7] -> 36 comparisons (reaches best)
 * - bestFromPar   (5<->7 from par): [8, 1, 5, 3, 2, 6, 4, 7] -> 36 comparisons (reaches best)
 * - lowFromPar    (0<->2 from par): [5, 1, 8, 3, 2, 7, 4, 6] -> 25 comparisons (below start and par)
 */
export const DAILY_12 = {
  name: 'DAILY_12 (#12, par 34, best 36)',
  puzzle: {
    number: 12,
    template: 'quicksort-most-comparisons',
    values: [8, 1, 6, 3, 2, 7, 4, 5],
    fixed: [1, 4, 6],
    par: 34,
    best: 36,
  } satisfies DailyPuzzle,
  start: { values: [8, 1, 6, 3, 2, 7, 4, 5], count: 30 },
  par: { swap: [2, 7] as const, values: [8, 1, 5, 3, 2, 7, 4, 6], count: 34 },
  bestFromStart: { swap: [5, 7] as const, values: [8, 1, 6, 3, 2, 5, 4, 7], count: 36 },
  bestFromPar: { swap: [5, 7] as const, values: [8, 1, 5, 3, 2, 6, 4, 7], count: 36 },
  lowFromPar: { swap: [0, 2] as const, values: [5, 1, 8, 3, 2, 7, 4, 6], count: 25 },
} as const;

/**
 * Puzzle #7: 8 values with 2 fixed slots [2, 5] (values 6, 5 locked).
 * Over all 6! = 720 free permutations: min 23, median 30, best 42, par 38.
 *
 * Hand-worked arrangement:
 * - start: [4, 2, 6, 8, 1, 5, 3, 7] -> 32 comparisons (below par)
 */
export const DAILY_7 = {
  name: 'DAILY_7 (#7, par 38, best 42)',
  puzzle: {
    number: 7,
    template: 'quicksort-most-comparisons',
    values: [4, 2, 6, 8, 1, 5, 3, 7],
    fixed: [2, 5],
    par: 38,
    best: 42,
  } satisfies DailyPuzzle,
  start: { values: [4, 2, 6, 8, 1, 5, 3, 7], count: 32 },
} as const;
