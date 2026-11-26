/** One bucket of the hash table, as game-server/challenges/src/hash_table.rs serialises it. */
export type HashSlot =
  | { kind: 'empty' }
  | { kind: 'occupied'; key: number }
  | { kind: 'tombstone' };

/** One operation to run on the hash table. */
export type HashOp =
  | { kind: 'insert'; key: number }
  | { kind: 'search'; key: number }
  | { kind: 'delete'; key: number };

/** One recorded event while a hash table operation runs. */
export type HashStep =
  | { kind: 'computeHash'; key: number; capacity: number; index: number }
  | {
      kind: 'probe';
      index: number;
      slot: HashSlot;
      probeNumber: number;
      firstTombstone: number | null;
    }
  | { kind: 'place'; key: number; index: number; replacedTombstone: boolean }
  | { kind: 'alreadyPresent'; key: number; index: number }
  | { kind: 'found'; key: number; index: number }
  | { kind: 'notFound'; key: number }
  | { kind: 'markTombstone'; key: number; index: number }
  | { kind: 'tableFull'; key: number };

/** A table of `capacity` buckets holding `slots`, and the operation to run on it. */
export type HashTableRequest = { capacity: number; slots: HashSlot[]; op: HashOp };

/** The table and step log after one operation. */
export type HashRunResult = { slots: HashSlot[]; steps: HashStep[]; probes: number };
