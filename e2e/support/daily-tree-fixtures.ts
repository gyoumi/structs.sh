import type { AvlRotationsChallenge, ForcedOrderChallenge, UpsetChallenge } from './daily-challenge-shapes';

/**
 * Tree test challenges for checkpoint 2 (step 2a-2), counted with the visualisers' own insert code
 * (GraphicalBST.ts and GraphicalAVL.ts) and brute-forced over every fill of the free slots.
 * Goal is Math.round(median + 0.65 * (best - median)) over the solved fills; the best is recorded only
 * to document the fixture and is never served to the page.
 */

/**
 * Puzzle #23, `avl-most-rotations`: insert 8 keys in order, fixed slots [0, 5] (keys 5, 7).
 * LL and RR count 1 rotation each; LR and RL are double rotations and count 2.
 * Over all 6! = 720 fills: rotations median 3, best 7, so goal 6.
 *
 * - start [5, 1, 3, 8, 6, 7, 2, 4]: 5, 1, 3 -> LR at 5 (2), root 3; 8, 6 -> RL at 5 (2), 6(5, 8);
 *     7 -> RR at 3 (1), root 6; 2, 4 -> no rotation. Total 5, below the goal of 6.
 * - doubles (swap slots 2 and 6) [5, 1, 2, 8, 6, 7, 3, 4]: 5, 1, 2 -> LR at 5 (2), root 2; 8, 6 -> RL at 5 (2);
 *     7 -> RR at 2 (1), root 6; 3 -> none; 4 -> LR at 5 (2), 4(3, 5). Total 7, beating the goal of 6.
 */
export const AVL_23 = {
  name: 'AVL_23 (#23, AVL most rotations, goal 6)',
  challenge: {
    number: 23,
    template: 'avl-most-rotations',
    values: [5, 1, 3, 8, 6, 7, 2, 4],
    fixed: [0, 5],
    goal: 6,
  } satisfies AvlRotationsChallenge,
  start: { values: [5, 1, 3, 8, 6, 7, 2, 4], rotations: 5 },
  doubles: { swap: [2, 6] as const, values: [5, 1, 2, 8, 6, 7, 3, 4], rotations: 7 },
} as const;

/**
 * Puzzle #24, `bst-forced-order`: 10 keys, no fixed slots, target BST with preorder
 * [6, 3, 1, 2, 5, 4, 9, 7, 8, 10]: 6 has children 3 and 9; 3 has 1 and 5; 1 has right child 2;
 * 5 has left child 4; 9 has 7 and 10; 7 has right child 8.
 * An order rebuilds the target exactly when every key comes after all its ancestors: 2268 orders do.
 * Longest increasing run over those orders: median 3, best 6, so goal 5.
 *
 * - start [3, 6, 9, 1, 2, 5, 4, 7, 8, 10]: root 3, so the tree differs from the target. Unsolved; run 3, 6, 9 = 3
 *     and 1, 2, 5 = 3 and 4, 7, 8, 10 = 4, so its run is 4.
 * - solved [6, 3, 9, 5, 1, 2, 4, 7, 8, 10]: builds the target; run 1, 2, 4, 7, 8, 10 = 6, beating the goal of 5.
 * - longRun [6, 9, 3, 1, 2, 4, 5, 7, 8, 10]: 4 goes right of 3 and 5 right of 4, preorder
 *     [6, 3, 1, 2, 4, 5, 9, 7, 8, 10]. Unsolved, though its run 1, 2, 4, 5, 7, 8, 10 = 7 is longer than any solved one.
 * - ascending [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]: a chain to the right. Unsolved; run 10.
 */
export const FORCED_24 = {
  name: 'FORCED_24 (#24, forced order, goal 5)',
  challenge: {
    number: 24,
    template: 'bst-forced-order',
    values: [3, 6, 9, 1, 2, 5, 4, 7, 8, 10],
    targetTree: [6, 3, 1, 2, 5, 4, 9, 7, 8, 10],
    goal: 5,
  } satisfies ForcedOrderChallenge,
  start: { values: [3, 6, 9, 1, 2, 5, 4, 7, 8, 10], run: 4 },
  solved: { values: [6, 3, 9, 5, 1, 2, 4, 7, 8, 10], run: 6 },
  longRun: { values: [6, 9, 3, 1, 2, 4, 5, 7, 8, 10], run: 7 },
  ascending: { values: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], run: 10 },
} as const;

/**
 * Puzzle #25, `upset-bst-beats-avl`: insert 14 keys in order, fixed slots [0, 1, 5, 9, 11, 12]
 * (keys 3, 2, 1, 12, 7, 4). Nodes passed: each existing node an insert compares against on its way
 * down to the empty spot, so the first key passes 0. Rotations are not counted.
 * Over all 8! = 40320 fills, 3593 are solved (BST passes fewer): margin median 1, best 5, so goal 4.
 *
 * Nodes passed per insert, in insert order:
 * - start [3, 2, 13, 6, 14, 1, 8, 10, 5, 12, 11, 7, 4, 9]:
 *     BST 0+1+1+2+2+2+3+4+3+5+6+4+4+5 = 42; AVL 0+1+1+2+2+2+3+4+4+4+4+3+4+4 = 38 (6 rotations, not counted).
 *     Unsolved (42 >= 38). Final trees, as value(left, right):
 *     BST 3(2(1, ), 13(6(5(4, ), 8(7, 10(9, 12(11, )))), 14)); AVL 8(3(2(1, ), 6(5(4, ), 7)), 11(10(9, ), 13(12, 14))).
 * - solved [3, 2, 8, 13, 14, 1, 10, 9, 6, 12, 11, 7, 4, 5]:
 *     BST 0+1+1+2+3+2+3+4+2+4+5+3+3+4 = 37; AVL 0+1+1+2+3+2+3+4+4+4+4+4+4+5 = 41 (11 rotations, not counted).
 *     Solved; margin 41 - 37 = 4 reaches the goal of 4. Counting rotations would wrongly give AVL 52 and margin 15.
 */
export const UPSET_25 = {
  name: 'UPSET_25 (#25, BST beats AVL, goal margin 4)',
  challenge: {
    number: 25,
    template: 'upset-bst-beats-avl',
    values: [3, 2, 13, 6, 14, 1, 8, 10, 5, 12, 11, 7, 4, 9],
    fixed: [0, 1, 5, 9, 11, 12],
    goal: 4,
  } satisfies UpsetChallenge,
  start: {
    values: [3, 2, 13, 6, 14, 1, 8, 10, 5, 12, 11, 7, 4, 9],
    bst: 42,
    avl: 38,
    bstTree: '3(2(1, ), 13(6(5(4, ), 8(7, 10(9, 12(11, )))), 14))',
    avlTree: '8(3(2(1, ), 6(5(4, ), 7)), 11(10(9, ), 13(12, 14)))',
  },
  solved: { values: [3, 2, 8, 13, 14, 1, 10, 9, 6, 12, 11, 7, 4, 5], bst: 37, avl: 41, margin: 4 },
} as const;
