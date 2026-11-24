import type { BubbleChallenge, InsertionMergeChallenge } from './daily-challenge-shapes';

/**
 * Sorting test challenges for checkpoint 2 (step 2a-1), counted with the sorting visualiser's own rules
 * (client/src/visualiser-src/sorting-visualiser/algorithms/) and brute-forced over every fill of the free slots.
 * Goal is Math.round(median + 0.65 * (best - median)) over the solved fills; the best is recorded only
 * to document the fixture and is never served to the page.
 */

/**
 * Puzzle #21, `bubble-exact-passes`: 8 values, fixed slots [1, 4, 6] (values 2, 5, 7), target 4 passes.
 * A pass is one run of bubble.ts's outer loop that makes at least one comparison, counting the final pass that
 * makes no swaps; at most n - 1 = 7. When all 7 passes swap, bubble.ts still runs an 8th outer iteration
 * (i = 7, so `j < len - i` is `1 < 1`) that compares nothing: it is not a pass.
 * Of the 5! = 120 fills, 20 take exactly 4 passes: swaps median 8, best 12, so goal 11.
 *
 * Pass by pass (swaps in that pass, then the array after it):
 * - start [6, 2, 8, 1, 5, 3, 7, 4]: 6 [2,6,1,5,3,7,4,8]; 4 [2,1,5,3,6,4,7,8]; 3 [1,2,3,5,4,6,7,8];
 *     1 [1..8]; 0 -> 5 passes, 14 swaps. Unsolved (5 != 4) even though 14 swaps beats the goal of 11.
 * - solved (swap slots 0 and 7) [4, 2, 8, 1, 5, 3, 7, 6]: 6 [2,4,1,5,3,7,6,8]; 3 [2,1,4,3,5,6,7,8];
 *     2 [1..8]; 0 -> 4 passes, 11 swaps. Solved, and 11 swaps reaches the goal of 11.
 * - mostPasses [8, 2, 6, 4, 5, 3, 7, 1]: 7 [2,6,4,5,3,7,1,8]; 4 [2,4,5,3,6,1,7,8]; 2 [2,4,3,5,1,6,7,8];
 *     2 [2,3,4,1,5,6,7,8]; 1 [2,3,1,4..8]; 1 [2,1,3..8]; 1 [1..8] -> 7 passes (n - 1, every one swapping), 18 swaps.
 *     Then the empty 8th outer iteration, which must not count: 8 would be wrong. Unsolved, with more swaps than the solved try.
 */
export const BUBBLE_21 = {
  name: 'BUBBLE_21 (#21, bubble sort, exactly 4 passes, goal 11 swaps)',
  challenge: {
    number: 21,
    template: 'bubble-exact-passes',
    values: [6, 2, 8, 1, 5, 3, 7, 4],
    fixed: [1, 4, 6],
    targetPasses: 4,
    goal: 11,
  } satisfies BubbleChallenge,
  start: { values: [6, 2, 8, 1, 5, 3, 7, 4], passes: 5, swaps: 14 },
  solved: { values: [4, 2, 8, 1, 5, 3, 7, 6], passes: 4, swaps: 11 },
  mostPasses: { values: [8, 2, 6, 4, 5, 3, 7, 1], passes: 7, swaps: 18 },
} as const;

/**
 * Puzzle #22, `insertion-beats-merge`: 8 values, fixed slots [1, 4] (values 3, 7).
 * Insertion comparisons: each evaluation of `val >= a[j - 1]` in insertion.ts, so each value costs
 * 1 + the number of values it shifts past, unless it reaches slot 0. Merge comparisons: each
 * `a[left] <= a[right]` in merge.ts, which splits at floor((lo + hi) / 2) and takes left on ties.
 * Solved only when insertion compares strictly less than merge; a tie is unsolved.
 * Of the 6! = 720 fills, 108 are solved: out-of-order pairs median 7, best 11, so goal 10.
 *
 * - start [5, 3, 8, 1, 7, 2, 6, 4]: insertion 1+1+3+2+5+3+5 = 20; merge [0..1] 1, [2..3] 1, [0..3] 3,
 *     [4..5] 1, [6..7] 1, [4..7] 3, [0..7] 7 = 17; 15 out-of-order pairs. Unsolved (20 >= 17).
 * - tie [5, 3, 1, 6, 7, 2, 8, 4]: insertion 1+2+1+1+5+1+5 = 16; merge 1+1+3+1+1+3+6 = 16;
 *     11 out-of-order pairs. Unsolved, because 16 is not less than 16.
 * - solved [5, 3, 2, 6, 7, 1, 4, 8]: insertion 1+2+1+1+5+4+1 = 15; merge 1+1+3+1+1+3+6 = 16;
 *     11 out-of-order pairs (5>3,5>2,5>1,5>4,3>2,3>1,2>1,6>1,6>4,7>1,7>4). Solved, and 11 beats the goal of 10.
 */
export const INSERTION_22 = {
  name: 'INSERTION_22 (#22, insertion beats merge, goal 10 out-of-order pairs)',
  challenge: {
    number: 22,
    template: 'insertion-beats-merge',
    values: [5, 3, 8, 1, 7, 2, 6, 4],
    fixed: [1, 4],
    goal: 10,
  } satisfies InsertionMergeChallenge,
  start: { values: [5, 3, 8, 1, 7, 2, 6, 4], insertion: 20, merge: 17, pairs: 15 },
  tie: { values: [5, 3, 1, 6, 7, 2, 8, 4], insertion: 16, merge: 16, pairs: 11 },
  solved: { values: [5, 3, 2, 6, 7, 1, 4, 8], insertion: 15, merge: 16, pairs: 11 },
} as const;
