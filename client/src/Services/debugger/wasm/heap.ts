import { DebugSection, DebugType, resolveIndex, unqualified } from './debugSection';
import { clashesWithReached, ReachedByStart, ReachedStruct, sortByStart } from './heapOverlap';
import { hex, readValue, Value } from './values';

/** A struct field in a heap entry, as the GDB debugger sends it. */
export type HeapField = { kind: string; value: Value; addr: null };

/** A struct on the heap, as the GDB debugger sends it in `heap_data`. */
export type HeapEntry = { addr: string; typeName: string; value: Record<string, HeapField> };

/** One call's place in the program, from which its variables can be read. */
export type Frame = { statement: number; frameBase: number };

/** A live heap allocation. */
export type Allocation = { start: number; size: number };

/** Structs shown at earlier steps, to show again while they're live. */
export type ShownStructs = {
  /** Each struct shown before, as [type, address]. */
  roots?: Iterable<[number, number]>;
  /** Called with each struct shown, as its address and type. */
  onShown?: (address: number, type: number) => void;
  /**
   * Called with a struct shown before, as its address and type, that overlaps
   * a different struct the variables reach now, so it's left out and can be
   * forgotten.
   */
  onOverlapped?: (address: number, type: number) => void;
};

/**
 * What the walk is reading: first what the variables reach, noting each heap
 * struct found, then the structs shown before, checked against those. The
 * structs reached are sorted by start only once a check first needs it.
 */
type WalkStage =
  | { from: 'variables'; reached: ReachedStruct[] }
  | { from: 'shown'; reached: ReachedStruct[]; byStart: ReachedByStart | null };

/** The structs the variables reach, by start, sorted on first use. */
const reachedByStart = (stage: Extract<WalkStage, { from: 'shown' }>) => {
  stage.byStart ??= sortByStart(stage.reached);
  return stage.byStart;
};

type StructType = Extract<DebugType, { kind: 'struct' }>;
type ArrayType = Extract<DebugType, { kind: 'array' }>;

/**
 * The structs on the heap that the variables of every frame reach, as GDB
 * shows the heap. Pointers are followed through struct fields, arrays and
 * tables of pointers, and a struct inside a heap struct is shown too. A
 * pointer is only followed into memory `allocationOf` says is live, so freed
 * memory and the stack aren't shown. The `roots` in `shown` are read too,
 * after what the variables reach, along with what they reach, so a struct
 * shown before stays shown while only, say, a function's return value holds
 * it. What the variables reach wins: a struct found only that way that
 * overlaps a struct they reach (memory reused as another struct) isn't shown
 * or followed, unless it's that struct, or one is a field inside the other.
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
  /** Whether following a value of this type could reach a heap struct. */
  const leadsSomewhere = (index: number) => {
    const { kind } = types[resolveIndex(types, index)];
    return kind === 'pointer' || kind === 'struct' || kind === 'array';
  };

  /** Counts work done, to check the time now and then. */
  let work = 0;
  const tick = () => {
    work += 1;
    if (work % 10_000 === 0) checkTime();
  };

  // Places still to look in, as [type, address], and places already seen. A
  // list rather than recursion, so a long linked list can't overflow the
  // call stack.
  const pending: [number, number][] = [];
  const visited = new Set<string>();
  /**
   * How far down each table of pointers has been walked: the lowest slot
   * scanned, by table, pointer type and alignment. Every slot from there to
   * the table's end has been seen, so pointers into the same table only
   * scan what's new.
   */
  const tables = new Map<string, number>();
  const visit = (index: number, address: number) => {
    const key = `${index}@${address}`;
    if (visited.has(key)) return;
    visited.add(key);
    pending.push([index, address]);
  };

  let stage: WalkStage = { from: 'variables', reached: [] };

  const followPointer = (to: number, address: number) => {
    const target = memory.getUint32(address, true);
    const pointee = types[resolveIndex(types, to)];
    if (pointee.kind === 'struct' || pointee.kind === 'array') {
      if (inAllocation(target, pointee.size)) visit(to, target);
    } else if (pointee.kind === 'pointer') {
      // A table of pointers, such as a hash table's buckets: every one in
      // its allocation that points somewhere.
      const allocation = allocationOf(target);
      if (allocation === null) return;
      const table = `${to}@${allocation.start}@${target % 4}`;
      const scannedFrom = tables.get(table) ?? allocation.start + allocation.size;
      if (target >= scannedFrom) return;
      tables.set(table, target);
      for (let at = target; at + pointee.size <= scannedFrom; at += 4) {
        tick();
        if (memory.getUint32(at, true) >= 1024) visit(to, at);
      }
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
        // An anonymous struct goes by the typedef it was reached through,
        // without qualifiers, as the visualiser knows it.
        typeName: type.name.includes('{') ? unqualified(types, index).name : type.name,
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
      // A NULL pointer leads nowhere, so isn't queued.
      if (!pointers || memory.getUint32(at, true) >= 1024) visit(type.of, at);
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
    while (pending.length > 0) {
      tick();
      const [type, address] = pending.pop()!;
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
  // Then the structs shown before, so the ones the variables reach keep
  // their order. Reversed, as the last one queued is looked at first.
  [...roots].reverse().forEach(([type, address]) => visit(type, address));
  walk();
  return heap;
};
