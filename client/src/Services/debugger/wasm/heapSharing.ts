import type { HeapEntry } from './heap';

const ESTIMATED_REFERENCE_BYTES = 16;

/** JSON writes NaN and Infinity as null, and -0 as 0: keep them apart when comparing. */
const keepSpecialNumbers = (_key: string, value: unknown) => {
  if (typeof value !== 'number') return value;
  if (Object.is(value, -0)) return '-0';
  return Number.isFinite(value) ? value : String(value);
};

/**
 * Returns a function that takes each step's heap in turn and gives it back
 * with every entry that didn't change since the step before replaced by that
 * step's entry, along with roughly how many bytes it adds to the recording.
 */
export const createHeapSharing = () => {
  let previousHeap = new Map<string, { entry: HeapEntry; json: string }>();

  return (read: Record<string, HeapEntry>) => {
    let size = 0;
    const heap: Record<string, HeapEntry> = Object.create(null);
    const seen = new Map<string, { entry: HeapEntry; json: string }>();
    Object.entries(read).forEach(([address, entry]) => {
      const json = JSON.stringify(entry, keepSpecialNumbers);
      size += address.length + ESTIMATED_REFERENCE_BYTES;
      const before = previousHeap.get(address);
      if (before?.json === json) {
        heap[address] = before.entry;
        seen.set(address, before);
      } else {
        heap[address] = entry;
        seen.set(address, { entry, json });
        size += json.length;
      }
    });
    previousHeap = seen;
    return { heap, size };
  };
};
