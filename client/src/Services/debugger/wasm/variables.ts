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

/**
 * The structs on the heap that the variables of every frame reach by
 * following pointers, through struct fields and arrays too, as GDB shows the
 * heap. A pointer is only followed into memory `isAllocated` says is live, so
 * freed memory and the stack aren't shown.
 */
export const readHeap = (
  debug: DebugSection,
  frames: Frame[],
  memory: DataView,
  isAllocated: (address: number, size: number) => boolean
): Record<string, HeapEntry> => {
  const { types } = debug;
  const heap: Record<string, HeapEntry> = Object.create(null);

  // Places still to look in, as [type, address]. A list rather than
  // recursion, so a long linked list can't overflow the call stack.
  const pending: [number, number][] = [];
  const follow = (index: number, address: number) => {
    const type = types[resolveIndex(types, index)];
    if (type.kind === 'pointer' && type.to !== null) {
      const target = memory.getUint32(address, true);
      const structIndex = resolveIndex(types, type.to);
      const struct = types[structIndex];
      const key = hex(target);
      if (struct.kind !== 'struct' || key in heap || !isAllocated(target, struct.size)) return;
      heap[key] = {
        addr: key,
        // An anonymous struct goes by the typedef it was reached through.
        typeName: struct.name.includes('{') ? types[type.to].name : struct.name,
        value: Object.fromEntries(
          struct.fields.map((field) => [
            field.name,
            {
              kind: types[field.type].name,
              value: readValue(types, field.type, memory, target + field.offset),
              addr: null,
            },
          ])
        ),
      };
      pending.push([structIndex, target]);
    } else if (type.kind === 'struct') {
      type.fields.forEach((field) => pending.push([field.type, address + field.offset]));
    } else if (type.kind === 'array') {
      const { size } = types[type.of];
      for (let i = 0; i < Math.min(type.count, ARRAY_LIMIT); i += 1) {
        pending.push([type.of, address + i * size]);
      }
    }
  };

  frames.forEach(({ statement, frameBase }) =>
    (debug.statements[statement]?.variables ?? []).forEach(({ type, offset }) =>
      pending.push([type, frameBase + offset])
    )
  );
  while (pending.length > 0) {
    const [type, address] = pending.pop()!;
    try {
      follow(type, address);
    } catch {
      // An address past the end of memory: nothing to follow.
    }
  }
  return heap;
};
