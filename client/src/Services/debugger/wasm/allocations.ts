import { countBefore } from './countBefore';
import { type Allocation, LOWEST_VALID_ADDRESS } from './heap';

export const createAllocations = () => {
  const allocations = new Map<number, number>();
  let starts: number[] | null = null;

  const allocationOf = (address: number): Allocation | null => {
    if (address < LOWEST_VALID_ADDRESS) return null;
    const exact = allocations.get(address);
    if (exact !== undefined) return { start: address, size: exact };
    starts ??= [...allocations.keys()].sort((a, b) => a - b);
    const startsAtOrBefore = countBefore(starts, (start) => start <= address);
    if (startsAtOrBefore === 0) return null;
    const start = starts[startsAtOrBefore - 1];
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
