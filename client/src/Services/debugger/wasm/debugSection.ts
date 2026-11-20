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

/** A struct type as the GDB debugger sends it in `sendTypeDeclaration`. */
export type TypeDeclaration = {
  typeName: string;
  fields: { name: string; typeName: string }[];
};

const EMPTY: DebugSection = { functions: [], statements: [], types: [] };

/** The `structs.debug` section of an instrumented program. */
export const readDebugSection = (module: WebAssembly.Module): DebugSection => {
  const [section] = WebAssembly.Module.customSections(module, 'structs.debug');
  return section ? JSON.parse(new TextDecoder().decode(section)) : EMPTY;
};

/** The index of the type `index` is, seen through typedefs and qualifiers. */
export const resolveIndex = (types: DebugType[], index: number): number => {
  const type = types[index];
  if ((type.kind === 'typedef' || type.kind === 'qualified') && type.to !== null) {
    return resolveIndex(types, type.to);
  }
  return index;
};

/** The type `index` is, seen through typedefs and qualifiers. */
export const resolve = (types: DebugType[], index: number): DebugType =>
  types[resolveIndex(types, index)];

/** The type without its const, volatile or restrict. */
export const unqualified = (types: DebugType[], index: number): DebugType => {
  const type = types[index];
  return type.kind === 'qualified' && type.to !== null ? unqualified(types, type.to) : type;
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
