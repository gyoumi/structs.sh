import type { Allocation } from './heap';

/** The heap blocks in use, to tell which allocation an address is in. */
export const createAllocations = () => {
  /** The heap blocks in use: their start, and size. */
  const allocations = new Map<number, number>();
  /** The blocks' starts in order, rebuilt after the blocks change. */
  let starts: number[] | null = null;

  const allocationOf = (address: number): Allocation | null => {
    if (address < 1024) return null;
    const exact = allocations.get(address);
    if (exact !== undefined) return { start: address, size: exact };
    starts ??= [...allocations.keys()].sort((a, b) => a - b);
    // The last block starting at or before the address.
    let low = 0;
    let high = starts.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (starts[middle] <= address) low = middle + 1;
      else high = middle;
    }
    if (low === 0) return null;
    const start = starts[low - 1];
    const size = allocations.get(start)!;
    return address < start + size ? { start, size } : null;
  };

  return {
    allocationOf,
    add(start: number, size: number) {
      allocations.set(start, size);
      starts = null;
    },
    remove(start: number) {
      allocations.delete(start);
      starts = null;
    },
  };
};
