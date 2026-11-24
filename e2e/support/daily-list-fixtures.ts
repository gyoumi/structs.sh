import type { IndexDriftChallenge } from './daily-challenge-shapes';

/** One step in the Index drift operation list: insert `value` at `index`, or delete the node at `index`. */
export type ListOperation =
  | { kind: 'insert'; value: number; index: number }
  | { kind: 'delete'; index: number };

/**
 * Linked list test challenge for checkpoint 2 (step 2a-3), costed with the rule in docs/challenge-ideas.md
 * ("Linked list costs"; the list has no tail pointer):
 * insert(value, i) costs 1 + min(i, lengthBefore) and delete(i) costs 1 + (i + 1).
 * Cost = operations + nodes walked; lower wins, so a solved try reaches the goal when cost <= goal.
 *
 * Puzzle #26, `linked-list-index-drift`: start [8, 3, 6, 1], target [3, 6, 5, 1].
 * A Dijkstra search over list states finds the cheapest solution costs 5. The cheap rebuild shortcut
 * (delete 8, 3, 6 from the front for 2 + 2 + 2, then prepend 5, 6, 3 for 1 + 1 + 1) costs 9.
 * Goal is Math.round(9 - 0.65 * (9 - 5)) = 6.
 *
 * - unsolved: insert(5, 0) walks 0 -> 1 operation, 0 walked, cost 1; final [5, 8, 3, 6, 1] is not the target.
 * - cheap: delete(0) walks 1 -> [3, 6, 1]; insert(5, 2) walks min(2, 3) = 2 -> [3, 6, 5, 1].
 *     2 operations, 3 walked, cost 5, at or below the goal of 6.
 * - costly: delete(3) walks 4 -> [8, 3, 6]; delete(0) walks 1 -> [3, 6]; insert(5, 2) walks min(2, 2) = 2
 *     -> [3, 6, 5]; insert(1, 3) walks min(3, 3) = 3 -> [3, 6, 5, 1].
 *     4 operations, 10 walked, cost 14, above the goal of 6.
 */
export const DRIFT_26 = {
  name: 'DRIFT_26 (#26, index drift, goal cost 6)',
  challenge: {
    number: 26,
    template: 'linked-list-index-drift',
    start: [8, 3, 6, 1],
    target: [3, 6, 5, 1],
    goal: 6,
  } satisfies IndexDriftChallenge,
  unsolved: {
    operations: [{ kind: 'insert', value: 5, index: 0 }] satisfies readonly ListOperation[],
    listed: ['insert(5, 0)'],
    count: 1,
    walked: 0,
    cost: 1,
  },
  cheap: {
    operations: [
      { kind: 'delete', index: 0 },
      { kind: 'insert', value: 5, index: 2 },
    ] satisfies readonly ListOperation[],
    listed: ['delete(0)', 'insert(5, 2)'],
    count: 2,
    walked: 3,
    cost: 5,
  },
  costly: {
    operations: [
      { kind: 'delete', index: 3 },
      { kind: 'delete', index: 0 },
      { kind: 'insert', value: 5, index: 2 },
      { kind: 'insert', value: 1, index: 3 },
    ] satisfies readonly ListOperation[],
    listed: ['delete(3)', 'delete(0)', 'insert(5, 2)', 'insert(1, 3)'],
    count: 4,
    walked: 10,
    cost: 14,
  },
} as const;
