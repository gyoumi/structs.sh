/**
 * Reads a program's variables from its memory, using the `structs.debug`
 * section the instrumenter writes (see instrumenter/src/debug.rs). Values and
 * type names come out the way the GDB debugger sends them, so the page shows
 * both the same way.
 */

/** A type, named as GDB names it: `int`, `struct node *`, `int [3]`. */
export type DebugType =
  | { kind: 'int'; name: string; size: number; signed: boolean }
  | { kind: 'float'; name: string; size: number }
  | { kind: 'pointer'; name: string; size: number; to: number | null }
  | {
      kind: 'struct';
      name: string;
      size: number;
      /** A bit-field also has its first bit from the struct's start, and its width. */
      fields: {
        name: string;
        type: number;
        offset: number;
        bitOffset?: number;
        bitSize?: number;
      }[];
    }
  | { kind: 'array'; name: string; size: number; of: number; count: number }
  /** A typedef, or a type with `const` or `volatile`. */
  | { kind: 'typedef' | 'qualified'; name: string; size: number; to: number | null }
  /** Something the debugger doesn't read, such as a function. */
  | { kind: 'other'; name: string; size: number };

export type DebugSection = {
  /** The C names of the functions `structs.enter` reports. */
  functions: string[];
  /** Each statement `structs.line` reports: its line and the variables in scope. */
  statements: {
    line: number;
    /** Innermost scope first. `offset` is from the call's frame base. */
    variables: { name: string; type: number; offset: number }[];
  }[];
  types: DebugType[];
};

/**
 * A value as GDB shows it: a number for integers, characters and floats, a
 * hex string for a pointer (`0x0` for NULL), an array for an array, and an
 * object of fields for a struct. null where there's nothing to read.
 */
export type Value = number | string | null | Value[] | { [field: string]: Value };

/** A variable as the GDB debugger sends it in `stack_data`. */
export type Variable = { addr: string; typeName: string; value: Value };

/** A struct type as the GDB debugger sends it in `sendTypeDeclaration`. */
export type TypeDeclaration = {
  typeName: string;
  fields: { name: string; typeName: string }[];
};

/** Elements shown from one array: GDB's default `print elements`. */
const ARRAY_LIMIT = 200;

const EMPTY: DebugSection = { functions: [], statements: [], types: [] };

/** The `structs.debug` section of an instrumented program. */
export const readDebugSection = (module: WebAssembly.Module): DebugSection => {
  const [section] = WebAssembly.Module.customSections(module, 'structs.debug');
  return section ? JSON.parse(new TextDecoder().decode(section)) : EMPTY;
};

export const hex = (address: number) => `0x${address.toString(16)}`;

/** The type `index` is, seen through typedefs and qualifiers. */
const resolve = (types: DebugType[], index: number): DebugType => {
  const type = types[index];
  if ((type.kind === 'typedef' || type.kind === 'qualified') && type.to !== null) {
    return resolve(types, type.to);
  }
  return type;
};

const CHAR_TYPES = ['char', 'signed char', 'unsigned char'];

/** A C character type, not, say, an enum that happens to be one byte. */
const isChar = (type: DebugType) => type.kind === 'int' && CHAR_TYPES.includes(type.name);

const ESCAPES: Record<number, string> = {
  7: '\\a',
  8: '\\b',
  9: '\\t',
  10: '\\n',
  11: '\\v',
  12: '\\f',
  13: '\\r',
  34: '\\"',
  92: '\\\\',
};

/**
 * A char array as GDB shows it: a quoted C string, up to its terminating NUL
 * (or the array's end), with special characters escaped.
 */
const readString = (memory: DataView, address: number, count: number) => {
  let text = '';
  for (let i = 0; i < Math.min(count, ARRAY_LIMIT); i += 1) {
    const byte = memory.getUint8(address + i);
    if (byte === 0) break;
    if (ESCAPES[byte]) text += ESCAPES[byte];
    else if (byte < 32 || byte > 126) text += `\\${byte.toString(8).padStart(3, '0')}`;
    else text += String.fromCharCode(byte);
  }
  return `"${text}"`;
};

/**
 * A number of `type` at `address`, or null for a size there's no reader for,
 * such as a 16-byte `long double`, rather than a wrong value.
 */
const readNumber = (memory: DataView, address: number, type: DebugType): number | null => {
  if (type.kind === 'float') {
    if (type.size === 4) return memory.getFloat32(address, true);
    if (type.size === 8) return memory.getFloat64(address, true);
    return null;
  }
  const signed = type.kind === 'int' && type.signed;
  switch (type.size) {
    case 1:
      return signed ? memory.getInt8(address) : memory.getUint8(address);
    case 2:
      return signed ? memory.getInt16(address, true) : memory.getUint16(address, true);
    case 4:
      return signed ? memory.getInt32(address, true) : memory.getUint32(address, true);
    case 8:
      return Number(
        signed ? memory.getBigInt64(address, true) : memory.getBigUint64(address, true)
      );
    default:
      return null;
  }
};

/** The index of the type `index` is, seen through typedefs and qualifiers. */
const resolveIndex = (types: DebugType[], index: number): number => {
  const type = types[index];
  if ((type.kind === 'typedef' || type.kind === 'qualified') && type.to !== null) {
    return resolveIndex(types, type.to);
  }
  return index;
};

/** The type without its const, volatile or restrict. */
const unqualified = (types: DebugType[], index: number): DebugType => {
  const type = types[index];
  return type.kind === 'qualified' && type.to !== null ? unqualified(types, type.to) : type;
};

/** A bit-field: `bitSize` bits starting `bitOffset` bits into the struct. */
const readBits = (
  type: DebugType,
  memory: DataView,
  struct: number,
  { bitOffset, bitSize }: { bitOffset: number; bitSize: number }
) => {
  const first = struct + Math.floor(bitOffset / 8);
  const shift = bitOffset % 8;
  // The bytes it spans, read little-endian, then its bits taken out.
  let bits = 0n;
  for (let i = Math.ceil((shift + bitSize) / 8) - 1; i >= 0; i -= 1) {
    bits = bits * 256n + BigInt(memory.getUint8(first + i));
  }
  const value = BigInt.asUintN(bitSize, bits / 2n ** BigInt(shift));
  const signed = type.kind === 'int' && type.signed;
  return Number(signed ? BigInt.asIntN(bitSize, value) : value);
};

/** Reads a value of type `index` at `address`. */
export const readValue = (
  types: DebugType[],
  index: number,
  memory: DataView,
  address: number
): Value => {
  const type = types[index];
  switch (type.kind) {
    case 'int':
    case 'float':
      return readNumber(memory, address, type);
    case 'pointer':
      return hex(memory.getUint32(address, true));
    case 'struct':
      return Object.fromEntries(
        type.fields.map((field) => [
          field.name,
          field.bitSize === undefined || field.bitOffset === undefined
            ? readValue(types, field.type, memory, address + field.offset)
            : readBits(types[resolveIndex(types, field.type)], memory, address, {
                bitOffset: field.bitOffset,
                bitSize: field.bitSize,
              }),
        ])
      );
    case 'array': {
      if (isChar(resolve(types, type.of))) return readString(memory, address, type.count);
      const { size } = types[type.of];
      return Array.from({ length: Math.min(type.count, ARRAY_LIMIT) }, (_, i) =>
        readValue(types, type.of, memory, address + i * size)
      );
    }
    case 'typedef':
    case 'qualified':
      return type.to === null ? null : readValue(types, type.to, memory, address);
    default:
      return null;
  }
};

/**
 * The variables in scope at a statement, read from the call whose frame base
 * is `frameBase`. A variable that can't be read (an address past the end of
 * memory, which a broken frame could give) has the value null.
 */
export const readVariables = (
  debug: DebugSection,
  statement: number,
  frameBase: number,
  memory: DataView
): Record<string, Variable> => {
  // No prototype, so a variable called `constructor` is still found.
  const variables: Record<string, Variable> = Object.create(null);
  (debug.statements[statement]?.variables ?? []).forEach(({ name, type, offset }) => {
    // An inner variable hides an outer one with the same name, as in C.
    if (name in variables) return;
    const address = frameBase + offset;
    let value: Value;
    try {
      value = readValue(debug.types, type, memory, address);
    } catch {
      value = null;
    }
    variables[name] = { addr: hex(address), typeName: debug.types[type].name, value };
  });
  return variables;
};

/** The struct a type is, seen through typedefs and qualifiers, if any. */
const structOf = (types: DebugType[], index: number | null): DebugType | null => {
  const type = index === null ? null : types[index];
  if (type?.kind === 'typedef' || type?.kind === 'qualified') return structOf(types, type.to);
  return type?.kind === 'struct' ? type : null;
};

/**
 * The named struct types, and typedefs of them, that the program's variables
 * use directly or through pointers, arrays and fields, as GDB lists them.
 */
export const structDeclarations = (debug: DebugSection): TypeDeclaration[] => {
  const { types } = debug;
  const seen = new Set<number>();
  const declarations: TypeDeclaration[] = [];
  const visit = (index: number | null) => {
    if (index === null || seen.has(index)) return;
    seen.add(index);
    const type = types[index];
    const struct = structOf(types, index);
    const named = type.kind === 'typedef' || (type.kind === 'struct' && !type.name.includes('{'));
    if (struct?.kind === 'struct' && named) {
      declarations.push({
        typeName: type.name,
        fields: struct.fields.map((field) => ({
          name: field.name,
          typeName: types[field.type].name,
        })),
      });
    }
    if (type.kind === 'pointer' || type.kind === 'typedef' || type.kind === 'qualified') {
      visit(type.to);
    } else if (type.kind === 'array') {
      visit(type.of);
    } else if (type.kind === 'struct') {
      type.fields.forEach((field) => visit(field.type));
    }
  };
  debug.statements.forEach((statement) =>
    statement.variables.forEach((variable) => visit(variable.type))
  );
  return declarations;
};

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
   * Called with a struct shown before that overlaps a different struct the
   * variables reach now, so it's left out and can be forgotten.
   */
  onOverlapped?: (address: number) => void;
};

/**
 * The structs on the heap that the variables of every frame reach, as GDB
 * shows the heap. Pointers are followed through struct fields, arrays and
 * tables of pointers, and a struct inside a heap struct is shown too. A
 * pointer is only followed into memory `allocationOf` says is live, so freed
 * memory and the stack aren't shown. The `roots` in `shown` are read too,
 * after what the variables reach, along with what they reach, so a struct
 * shown before stays shown while only, say, a function's return value holds
 * it. What the variables reach wins: a struct found only that way that
 * overlaps a different struct they reach (memory reused as another struct)
 * isn't shown or followed.
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

  /** The heap structs the variables reach: their extents, and `type@address`. */
  let fromVariables = true;
  const reached: [number, number][] = [];
  const reachedExactly = new Set<string>();
  /** `reached` by start, with the furthest end of each and those before it. */
  let byStart: { starts: number[]; furthestEnds: number[] } | null = null;
  /** Whether [start, end) overlaps a struct the variables reach that isn't this one. */
  const overlapsReached = (start: number, end: number, type: number) => {
    if (reachedExactly.has(`${type}@${start}`)) return false;
    if (!byStart) {
      const sorted = [...reached].sort((a, b) => a[0] - b[0]);
      const furthestEnds: number[] = [];
      sorted.forEach(([, structEnd], i) =>
        furthestEnds.push(Math.max(structEnd, furthestEnds[i - 1] ?? -Infinity))
      );
      byStart = { starts: sorted.map(([structStart]) => structStart), furthestEnds };
    }
    // How many reached structs start before `end`.
    let low = 0;
    let high = byStart.starts.length;
    while (low < high) {
      const middle = Math.floor((low + high) / 2);
      if (byStart.starts[middle] < end) low = middle + 1;
      else high = middle;
    }
    return low > 0 && byStart.furthestEnds[low - 1] > start;
  };

  const look = (index: number, address: number) => {
    const resolved = resolveIndex(types, index);
    const type = types[resolved];
    if (type.kind === 'pointer' && type.to !== null) {
      const target = memory.getUint32(address, true);
      const pointee = types[resolveIndex(types, type.to)];
      if (pointee.kind === 'struct' || pointee.kind === 'array') {
        if (inAllocation(target, pointee.size)) visit(type.to, target);
      } else if (pointee.kind === 'pointer') {
        // A table of pointers, such as a hash table's buckets: every one in
        // its allocation that points somewhere.
        const allocation = allocationOf(target);
        if (allocation === null) return;
        const table = `${type.to}@${allocation.start}@${target % 4}`;
        const scannedFrom = tables.get(table) ?? allocation.start + allocation.size;
        if (target >= scannedFrom) return;
        tables.set(table, target);
        for (let at = target; at + pointee.size <= scannedFrom; at += 4) {
          tick();
          if (memory.getUint32(at, true) >= 1024) visit(type.to, at);
        }
      }
    } else if (type.kind === 'struct') {
      const heapKey = hex(address);
      const onHeap = inAllocation(address, type.size);
      if (onHeap && fromVariables) {
        reached.push([address, address + type.size]);
        reachedExactly.add(`${resolved}@${address}`);
      } else if (onHeap && overlapsReached(address, address + type.size, resolved)) {
        onOverlapped?.(address);
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
    } else if (type.kind === 'array' && leadsSomewhere(type.of)) {
      const { size } = types[type.of];
      const pointers = types[resolveIndex(types, type.of)].kind === 'pointer';
      for (let i = 0; i < type.count; i += 1) {
        tick();
        const at = address + i * size;
        // A NULL pointer leads nowhere, so isn't queued.
        if (!pointers || memory.getUint32(at, true) >= 1024) visit(type.of, at);
      }
    }
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
  fromVariables = false;
  // Then the structs shown before, so the ones the variables reach keep
  // their order. Reversed, as the last one queued is looked at first.
  [...roots].reverse().forEach(([type, address]) => visit(type, address));
  walk();
  return heap;
};
