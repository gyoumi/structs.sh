import { DebugType, resolve, resolveIndex } from './debugSection';

/**
 * A value as GDB shows it: a number for integers, characters and floats, a
 * hex string for a pointer (`0x0` for NULL), an array for an array, and an
 * object of fields for a struct. null where there's nothing to read.
 */
export type Value = number | string | null | Value[] | { [field: string]: Value };

/** Elements shown from one array: GDB's default `print elements`. */
const ARRAY_LIMIT = 200;

export const hex = (address: number) => `0x${address.toString(16)}`;

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
