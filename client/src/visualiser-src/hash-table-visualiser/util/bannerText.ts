import type { HashSlot, HashStep } from '@/Services/challenges/challenges';
import { HASH_TABLE_CAPACITY } from './shareEncoding';

const SEPARATOR = ' · ';

const describeSlot = (slot: HashSlot, index: number): string => {
  if (slot.kind === 'empty') return `slot ${index} is empty`;
  if (slot.kind === 'tombstone') return `slot ${index} is DEL`;
  return `slot ${index} holds ${slot.key}`;
};

const outcome = (step: HashStep): string => {
  switch (step.kind) {
    case 'computeHash':
      return `Start at slot ${step.index}`;
    case 'probe':
      return describeSlot(step.slot, step.index);
    case 'place':
      return step.replacedTombstone
        ? `Placed at slot ${step.index} (reused DEL)`
        : `Placed at slot ${step.index}`;
    case 'alreadyPresent':
      return `Already present at slot ${step.index}`;
    case 'tableFull':
      return 'Table is full';
    case 'found':
      return `Found at slot ${step.index}`;
    case 'notFound':
      return 'Not found';
    case 'markTombstone':
      return `Deleted: slot ${step.index} marked DEL`;
    default:
      return '';
  }
};

/** Whether this probe moved from the last bucket back to bucket 0. */
export const isWrapProbe = (step: HashStep): boolean =>
  step.kind === 'probe' && step.index === 0 && step.probeNumber > 1;

/** The banner for `step`: hash formula, probe count so far, then what the step did. */
export const stepBanner = (key: number, start: number, probes: number, step: HashStep): string => {
  const parts = [`h(${key}) = ${key} % ${HASH_TABLE_CAPACITY} = ${start}`, `Probes: ${probes}`];
  if (isWrapProbe(step)) parts.push('wrap → 0');
  parts.push(outcome(step));
  return parts.join(SEPARATOR);
};
