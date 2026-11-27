import type { HashOp, HashSlot, HashStep } from '@/Services/challenges/challenges';
import { deleteCodeSnippet, insertCodeSnippet, searchCodeSnippet } from './codeSnippets';

type OpKind = HashOp['kind'];

/** The C function shown in the code panel for each operation. */
export const snippetFor = (kind: OpKind): string => {
  if (kind === 'insert') return insertCodeSnippet;
  if (kind === 'search') return searchCodeSnippet;
  return deleteCodeSnippet;
};

const HASH_LINE = 2;

const insertProbeLine = (slot: HashSlot, isFirstTombstone: boolean): number => {
  if (slot.kind === 'empty') return 12;
  if (slot.kind === 'tombstone') return isFirstTombstone ? 10 : 9;
  return 6;
};

const scanProbeLine = (slot: HashSlot): number => (slot.kind === 'empty' ? 5 : 8);

/**
 * The 1-indexed line of `snippetFor(kind)` that `step` runs.
 * `lastProbed` is the slot the previous probe looked at, so a miss highlights
 * the line that stopped the loop.
 */
export const lineForStep = (kind: OpKind, step: HashStep, lastProbed: HashSlot | null): number => {
  switch (step.kind) {
    case 'computeHash':
      return HASH_LINE;
    case 'probe':
      return kind === 'insert'
        ? insertProbeLine(step.slot, step.firstTombstone === step.index)
        : scanProbeLine(step.slot);
    case 'alreadyPresent':
      return 7;
    case 'tableFull':
      return 18;
    case 'place':
      return 21;
    case 'found':
    case 'markTombstone':
      return 9;
    case 'notFound':
      if (lastProbed?.kind === 'empty') return 6;
      return kind === 'search' ? 12 : 13;
    default:
      return HASH_LINE;
  }
};
