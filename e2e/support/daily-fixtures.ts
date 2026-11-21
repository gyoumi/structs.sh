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
 * Counts follow client/src/visualiser-src/sorting-visualiser/algorithms/quick.ts:
 * every value comparison counts, including the check that ends each while loop,
 * `elements[j].data.value > v` when `i === j`, and `elements[i].data.value < v`
 * before the pivot swap. Index-only checks (`i < j`, `hi <= lo`) do not count.
 *
 * Par is Math.round(median + 0.65 * (best - median)) over all permutations of the
 * free slots.
 */

/**
 * Puzzle #12: 8 values with 3 fixed slots [1, 4, 6] (values 1, 2, 4 locked).
 * Over all 5! = 120 free permutations: min 27, median 33, best 42, par 39.
 *
 * Hand-worked arrangements:
 * - start:         [8, 1, 6, 3, 2, 7, 4, 5] -> 35 comparisons (below par)
 * - par (2<->7):   [8, 1, 5, 3, 2, 7, 4, 6] -> 39 comparisons (reaches par, below best)
 * - bestFromStart (5<->7): [8, 1, 6, 3, 2, 5, 4, 7] -> 42 comparisons (reaches best)
 * - bestFromPar   (5<->7 from par): [8, 1, 5, 3, 2, 6, 4, 7] -> 42 comparisons (reaches best)
 * - lowFromPar    (0<->2 from par): [5, 1, 8, 3, 2, 7, 4, 6] -> 29 comparisons (below start and par)
 */
export const DAILY_12 = {
  name: 'DAILY_12 (#12, par 39, best 42)',
  puzzle: {
    number: 12,
    template: 'quicksort-most-comparisons',
    values: [8, 1, 6, 3, 2, 7, 4, 5],
    fixed: [1, 4, 6],
    par: 39,
    best: 42,
  } satisfies DailyPuzzle,
  start: { values: [8, 1, 6, 3, 2, 7, 4, 5], count: 35 },
  par: { swap: [2, 7] as const, values: [8, 1, 5, 3, 2, 7, 4, 6], count: 39 },
  bestFromStart: { swap: [5, 7] as const, values: [8, 1, 6, 3, 2, 5, 4, 7], count: 42 },
  bestFromPar: { swap: [5, 7] as const, values: [8, 1, 5, 3, 2, 6, 4, 7], count: 42 },
  lowFromPar: { swap: [0, 2] as const, values: [5, 1, 8, 3, 2, 7, 4, 6], count: 29 },
} as const;

/**
 * Puzzle #7: 8 values with 2 fixed slots [2, 5] (values 6, 5 locked).
 * Over all 6! = 720 free permutations: min 27, median 35, best 49, par 44.
 *
 * Hand-worked arrangement:
 * - start: [4, 2, 6, 8, 1, 5, 3, 7] -> 38 comparisons (below par)
 */
export const DAILY_7 = {
  name: 'DAILY_7 (#7, par 44, best 49)',
  puzzle: {
    number: 7,
    template: 'quicksort-most-comparisons',
    values: [4, 2, 6, 8, 1, 5, 3, 7],
    fixed: [2, 5],
    par: 44,
    best: 49,
  } satisfies DailyPuzzle,
  start: { values: [4, 2, 6, 8, 1, 5, 3, 7], count: 38 },
} as const;
