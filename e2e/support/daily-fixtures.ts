import type { QuicksortChallenge } from './daily-challenge-shapes';

export type { DailyChallenge } from './daily-challenge-shapes';

/**
 * Named test challenges with hand-worked and brute-forced quicksort comparison counts.
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
 * Goal is Math.round(median + 0.65 * (best - median)) over all permutations of the
 * free slots. The solver's best is recorded here only to document the fixtures;
 * it is never served to the page.
 */

/**
 * Puzzle #12: 8 values with 3 fixed slots [1, 4, 6] (values 1, 2, 4 locked).
 * Over all 5! = 120 free permutations: min 23, median 29, best 36, goal 34.
 *
 * Hand-worked arrangements:
 * - start:         [8, 1, 6, 3, 2, 7, 4, 5] -> 30 comparisons (below goal)
 * - goal (2<->7):   [8, 1, 5, 3, 2, 7, 4, 6] -> 34 comparisons (reaches goal exactly)
 * - highFromStart (5<->7): [8, 1, 6, 3, 2, 5, 4, 7] -> 36 comparisons (beats goal; the solver's best)
 * - highFromGoal   (5<->7 from goal): [8, 1, 5, 3, 2, 6, 4, 7] -> 36 comparisons (beats goal; the solver's best)
 * - lowFromGoal    (0<->2 from goal): [5, 1, 8, 3, 2, 7, 4, 6] -> 25 comparisons (below start and goal)
 * - thirdFromLow  (0<->7 from lowFromGoal): [6, 1, 8, 3, 2, 7, 4, 5] -> 31 comparisons (below goal;
 *     partition(0,7) v=6 -> 13 comps [4,1,5,3,2,6,7,8]; partition(0,4) v=4 -> 8 comps [3,1,2,4,5];
 *     partition(0,2) v=3 -> 4 comps [2,1,3]; partition(0,1) v=2 -> 3 comps [1,2];
 *     partition(6,7) v=7 -> 3 comps [7,8]; total 13+8+4+3+3 = 31)
 */
export const DAILY_12 = {
  name: 'DAILY_12 (#12, goal 34)',
  challenge: {
    number: 12,
    template: 'quicksort-most-comparisons',
    values: [8, 1, 6, 3, 2, 7, 4, 5],
    fixed: [1, 4, 6],
    goal: 34,
  } satisfies QuicksortChallenge,
  start: { values: [8, 1, 6, 3, 2, 7, 4, 5], count: 30 },
  goal: { swap: [2, 7] as const, values: [8, 1, 5, 3, 2, 7, 4, 6], count: 34 },
  highFromStart: { swap: [5, 7] as const, values: [8, 1, 6, 3, 2, 5, 4, 7], count: 36 },
  highFromGoal: { swap: [5, 7] as const, values: [8, 1, 5, 3, 2, 6, 4, 7], count: 36 },
  lowFromGoal: { swap: [0, 2] as const, values: [5, 1, 8, 3, 2, 7, 4, 6], count: 25 },
  thirdFromLow: { swap: [0, 7] as const, values: [6, 1, 8, 3, 2, 7, 4, 5], count: 31 },
} as const;

/**
 * Puzzle #7: 8 values with 2 fixed slots [2, 5] (values 6, 5 locked).
 * Over all 6! = 720 free permutations: min 23, median 30, best 42, goal 38.
 *
 * Hand-worked arrangement:
 * - start: [4, 2, 6, 8, 1, 5, 3, 7] -> 32 comparisons (below goal)
 */
export const DAILY_7 = {
  name: 'DAILY_7 (#7, goal 38)',
  challenge: {
    number: 7,
    template: 'quicksort-most-comparisons',
    values: [4, 2, 6, 8, 1, 5, 3, 7],
    fixed: [2, 5],
    goal: 38,
  } satisfies QuicksortChallenge,
  start: { values: [4, 2, 6, 8, 1, 5, 3, 7], count: 32 },
} as const;
