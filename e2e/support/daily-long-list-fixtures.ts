import type { IndexDriftChallenge } from './daily-challenge-shapes';
import type { ListOperation } from './daily-list-fixtures';

/**
 * Index drift with a long operation list, as in the 3e recorded run (about 40 inserts), for step 3f's
 * "long linked lists stay readable on a phone". The score doesn't matter here (the try is unsolved).
 *
 * Start list [8, 3, 6, 1, 9, 4] (6 nodes, short enough to fit a 390px phone's stage). The operations are
 * 39 inserts at the front, insert(10, 0) ... insert(48, 0), then insert(99, 45), which appends 99 after the
 * 45 nodes there are by then, so `curr` walks the whole list (45 nodes) to its far end. The final list has
 * 46 nodes: [48, 47, ..., 10, 8, 3, 6, 1, 9, 4, 99]. Every value is different, so a drawn number names one node.
 *
 * Costs (rule in daily-list-fixtures.ts): the front inserts walk 0 nodes each, the append walks 45, so
 * Operations 40, Nodes walked 45, Cost 85.
 */
const FRONT_VALUES = Array.from({ length: 39 }, (_, k) => 10 + k);
const FRONT_INSERTS: ListOperation[] = FRONT_VALUES.map((value) => ({ kind: 'insert', value, index: 0 }));

export const LONG_DRIFT = {
  name: 'LONG_DRIFT (#31, index drift, start [8, 3, 6, 1, 9, 4], 39 front inserts then insert(99, 45))',
  challenge: {
    number: 31,
    template: 'linked-list-index-drift',
    start: [8, 3, 6, 1, 9, 4],
    target: [3, 6, 5, 1],
    goal: 6,
  } satisfies IndexDriftChallenge,
  operations: [...FRONT_INSERTS, { kind: 'insert', value: 99, index: 45 }] as readonly ListOperation[],
  listed: [...FRONT_VALUES.map((value) => `insert(${value}, 0)`), 'insert(99, 45)'],
  /** The final list, front to back. */
  final: [...Array.from({ length: 39 }, (_, k) => 48 - k), 8, 3, 6, 1, 9, 4, 99],
  /** The value the last operation appends at the far end of the list. */
  appended: 99,
  count: 40,
  walked: 45,
} as const;
