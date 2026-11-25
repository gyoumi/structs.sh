import type { ListOperation } from '@/Services/challenges/challenges';

/** `insert(5, 2)` or `delete(0)`, as the operation list shows it. */
export const describeOperation = (op: ListOperation) =>
  op.kind === 'insert' ? `insert(${op.value}, ${op.index})` : `delete(${op.index})`;

/** Whether every queued operation stays within the list's length at its turn. */
export type QueueValidation =
  | { status: 'valid'; endLength: number }
  | { status: 'invalid'; invalidAt: number; reason: string };

/** Replays `operations` from `startLength` and flags the first out-of-range delete, if any. */
export const validateOperations = (
  startLength: number,
  operations: ListOperation[]
): QueueValidation => {
  let length = startLength;
  for (let i = 0; i < operations.length; i += 1) {
    const op = operations[i];
    if (op.kind === 'insert') {
      length += 1;
    } else {
      if (op.index < 0 || op.index >= length) {
        const range =
          length === 0
            ? `the list is empty at step ${i + 1}`
            : `only indices 0 to ${length - 1} exist at step ${i + 1}`;
        return {
          status: 'invalid',
          invalidAt: i,
          reason: `Step ${i + 1} (${describeOperation(op)}) is out of range — ${range}.`,
        };
      }
      length -= 1;
    }
  }
  return { status: 'valid', endLength: length };
};

/** Whether `operations` can be run from a list of `startLength`: at least one, and none out of range. */
export const isRunnable = (startLength: number, operations: ListOperation[]) =>
  operations.length > 0 && validateOperations(startLength, operations).status === 'valid';
