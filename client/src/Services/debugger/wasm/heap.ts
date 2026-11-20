import { DebugSection, DebugType, isAnonymous, resolveIndex, unqualified } from './debugSection';
import { clashesWithReached, ReachedByStart, ReachedStruct, sortByStart } from './heapOverlap';
import { hex, readValue, Value } from './values';

export type HeapField = { kind: string; value: Value; addr: null };

export type HeapEntry = { addr: string; typeName: string; value: Record<string, HeapField> };

export type Frame = { statement: number; frameBase: number };

export type Allocation = { start: number; size: number };

export const LOWEST_VALID_ADDRESS = 1024;

export type ShownStructs = {
  /** Each struct shown before, as [type, address]. */
  roots?: Iterable<[number, number]>;
  onShown?: (address: number, type: number) => void;
  /**
   * Called with a struct shown before, as its address and type, that overlaps
   * a different struct the variables reach now, so it's left out and can be
   * forgotten.
   */
  onOverlapped?: (address: number, type: number) => void;
};

type WalkStage =
  | { from: 'variables'; reached: ReachedStruct[] }
  | { from: 'shown'; reached: ReachedStruct[]; byStart: ReachedByStart | null };

const reachedByStart = (stage: Extract<WalkStage, { from: 'shown' }>) => {
  stage.byStart ??= sortByStart(stage.reached);
  return stage.byStart;
};

type StructType = Extract<DebugType, { kind: 'struct' }>;
type ArrayType = Extract<DebugType, { kind: 'array' }>;

/**
 * The structs on the heap that the variables of every frame reach, following
 * pointers through struct fields, arrays and tables of pointers. A pointer is
 * only followed into memory `allocationOf` says is live. The `roots` in
 * `shown` are read too, after what the variables reach, along with what they
 * reach. What the variables reach wins: a struct found only from `roots` that
 * overlaps a struct they reach isn't shown or followed, unless it's that
 * struct, or one is a field inside the other.
 */
export const readHeap = (
  debug: DebugSection,
  frames: Frame[],
  memory: DataView,
  allocationOf: (address: number) => Allocation | null,
  /** Called now and then during a long walk; it may throw to stop it. */
  checkTime: () => void = () => {},
  { roots = [], onShown, onOverlapped }: ShownStructs = {}
): Record<string, HeapEntry> => {
  const { types } = debug;
  const heap: Record<string, HeapEntry> = Object.create(null);
  const inAllocation = (address: number, size: number) => {
    const allocation = allocationOf(address);
    return allocation !== null && address + size <= allocation.start + allocation.size;
  };
  const leadsSomewhere = (index: number) => {
    const { kind } = types[resolveIndex(types, index)];
    return kind === 'pointer' || kind === 'struct' || kind === 'array';
  };

  let work = 0;
  const tick = () => {
    work += 1;
    if (work % 10_000 === 0) checkTime();
  };

  // A list rather than recursion, so a long linked list can't overflow the
  // call stack.
  const pendingStack: [number, number][] = [];
  const visited = new Set<string>();
  const visit = (index: number, address: number) => {
    const key = `${index}@${address}`;
    if (visited.has(key)) return;
    visited.add(key);
    pendingStack.push([index, address]);
  };
  const visitInGivenOrder = (structs: Iterable<[number, number]>) =>
    [...structs].reverse().forEach(([type, address]) => visit(type, address));

  let stage: WalkStage = { from: 'variables', reached: [] };

  const lowestSlotScanned = new Map<string, number>();
  const scanPointerTable = (slotType: number, slotSize: number, firstSlot: number) => {
    const allocation = allocationOf(firstSlot);
    if (allocation === null) return;
    const alignment = firstSlot % 4;
    const table = `${slotType}@${allocation.start}@${alignment}`;
    const scannedFrom = lowestSlotScanned.get(table) ?? allocation.start + allocation.size;
    if (firstSlot >= scannedFrom) return;
    lowestSlotScanned.set(table, firstSlot);
    for (let slot = firstSlot; slot + slotSize <= scannedFrom; slot += 4) {
      tick();
      if (memory.getUint32(slot, true) >= LOWEST_VALID_ADDRESS) visit(slotType, slot);
    }
  };

  const followPointer = (to: number, address: number) => {
    const target = memory.getUint32(address, true);
    const pointee = types[resolveIndex(types, to)];
    if (pointee.kind === 'struct' || pointee.kind === 'array') {
      if (inAllocation(target, pointee.size)) visit(to, target);
    } else if (pointee.kind === 'pointer') {
      scanPointerTable(to, pointee.size, target);
    }
  };

  const showStruct = (index: number, resolved: number, type: StructType, address: number) => {
    const heapKey = hex(address);
    const onHeap = inAllocation(address, type.size);
    if (onHeap && stage.from === 'variables') {
      stage.reached.push([address, address + type.size, resolved]);
    } else if (
      onHeap &&
      stage.from === 'shown' &&
      clashesWithReached(types, reachedByStart(stage), address, address + type.size, resolved)
    ) {
      onOverlapped?.(address, index);
      return;
    }
    if (!(heapKey in heap) && onHeap) {
      const whole = readValue(types, resolveIndex(types, index), memory, address) as Record<
        string,
        Value
      >;
      heap[heapKey] = {
        addr: heapKey,
        typeName: isAnonymous(type) ? unqualified(types, index).name : type.name,
        value: Object.fromEntries(
          type.fields.map((field) => [
            field.name,
            { kind: types[field.type].name, value: whole[field.name], addr: null },
          ])
        ),
      };
      onShown?.(address, index);
    }
    type.fields
      .filter((field) => field.bitSize === undefined && leadsSomewhere(field.type))
      .forEach((field) => visit(field.type, address + field.offset));
  };

  const followArray = (type: ArrayType, address: number) => {
    const { size } = types[type.of];
    const pointers = types[resolveIndex(types, type.of)].kind === 'pointer';
    for (let i = 0; i < type.count; i += 1) {
      tick();
      const at = address + i * size;
      if (!pointers || memory.getUint32(at, true) >= LOWEST_VALID_ADDRESS) visit(type.of, at);
    }
  };

  const look = (index: number, address: number) => {
    const resolved = resolveIndex(types, index);
    const type = types[resolved];
    if (type.kind === 'pointer' && type.to !== null) followPointer(type.to, address);
    else if (type.kind === 'struct') showStruct(index, resolved, type, address);
    else if (type.kind === 'array' && leadsSomewhere(type.of)) followArray(type, address);
  };

  const walk = () => {
    while (pendingStack.length > 0) {
      tick();
      const [type, address] = pendingStack.pop()!;
      try {
        look(type, address);
      } catch (error) {
        // An address past the end of memory has nothing to follow. Anything
        // else, such as checkTime stopping the walk, goes on up.
        if (!(error instanceof RangeError)) throw error;
      }
    }
  };

  frames.forEach(({ statement, frameBase }) =>
    (debug.statements[statement]?.variables ?? [])
      .filter(({ type }) => leadsSomewhere(type))
      .forEach(({ type, offset }) => visit(type, frameBase + offset))
  );
  walk();
  stage = { from: 'shown', reached: stage.reached, byStart: null };
  visitInGivenOrder(roots);
  walk();
  return heap;
};
