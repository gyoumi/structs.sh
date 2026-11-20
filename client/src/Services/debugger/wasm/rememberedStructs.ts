import type { DebugType } from './debugSection';
import type { Allocation } from './heap';

/**
 * The structs shown so far, as their address and type, by the start of the
 * live allocation they're in. Each is shown at every step until it's freed,
 * even when no variable reaches it any more (a node that's only a call's
 * return value, or a leak).
 */
export const createRememberedStructs = (
  types: DebugType[],
  allocationOf: (address: number) => Allocation | null
) => {
  const shown = new Map<number, Map<number, number>>();

  return {
    remember(address: number, type: number) {
      const allocation = allocationOf(address);
      if (allocation === null) return;
      let structs = shown.get(allocation.start);
      if (!structs) {
        structs = new Map();
        shown.set(allocation.start, structs);
      }
      structs.set(address, type);
    },
    /**
     * Forgets a struct whose memory now holds a different one, but not another
     * struct remembered at the same address since, such as the one there now.
     */
    forget(address: number, type: number) {
      const allocation = allocationOf(address);
      const structs = allocation && shown.get(allocation.start);
      if (structs?.get(address) === type) structs.delete(address);
    },
    /** Each struct remembered, as [type, address]. */
    roots: () =>
      [...shown.values()].flatMap((structs) =>
        [...structs].map(([address, type]): [number, number] => [type, address])
      ),
    freed(start: number) {
      shown.delete(start);
    },
    reallocated(old: number, start: number, size: number) {
      const structs = shown.get(old);
      if (structs && start === old) {
        // Resized in place: forget the structs no longer wholly inside it,
        // so they aren't drawn from that memory once it's reused.
        structs.forEach((type, address) => {
          if (address + types[type].size > start + size) structs.delete(address);
        });
      } else {
        // Moved, its structs are now wherever the variables reach them.
        shown.delete(old);
      }
    },
  };
};
