import type { DebugType } from './debugSection';
import type { Allocation } from './heap';

/**
 * The structs remembered so far, as their address and type, by the start of
 * the live allocation they're in. Each stays in every step's heap until it's
 * freed, even when no variable reaches it any more.
 */
export const createRememberedStructs = (
  types: DebugType[],
  allocationOf: (address: number) => Allocation | null
) => {
  const remembered = new Map<number, Map<number, number>>();

  return {
    remember(address: number, type: number) {
      const allocation = allocationOf(address);
      if (allocation === null) return;
      let structs = remembered.get(allocation.start);
      if (!structs) {
        structs = new Map();
        remembered.set(allocation.start, structs);
      }
      structs.set(address, type);
    },
    /**
     * Forgets a struct whose memory now holds a different one, but not another
     * struct remembered at the same address since, such as the one there now.
     */
    forget(address: number, type: number) {
      const allocation = allocationOf(address);
      const structs = allocation && remembered.get(allocation.start);
      if (structs?.get(address) === type) structs.delete(address);
    },
    /** Each struct remembered, as [type, address]. */
    roots: () =>
      [...remembered.values()].flatMap((structs) =>
        [...structs].map(([address, type]): [number, number] => [type, address])
      ),
    freed(start: number) {
      remembered.delete(start);
    },
    reallocated(old: number, start: number, size: number) {
      const structs = remembered.get(old);
      const resizedInPlace = start === old;
      if (structs && resizedInPlace) {
        structs.forEach((type, address) => {
          if (address + types[type].size > start + size) structs.delete(address);
        });
      } else {
        remembered.delete(old);
      }
    },
  };
};
