/**
 * Backend data structure definition
 */

// TODO: should an explicit 'null' be includded in addresses? Or should it map to 0x00
export type Addr = `0x${string}`;
export type Name = string;

export type IntType = {
  typeName: 'int';
};
export type IntValue = {
  type: IntType;
  value: number;
};

export type FloatType = {
  typeName: 'float';
};
export type FloatValue = {
  type: FloatType;
  value: number;
};

export type DoubleType = {
  typeName: 'double';
};
export type DoubleValue = {
  type: DoubleType;
  value: number;
};

export type CharType = {
  typeName: 'char';
};
export type CharValue = {
  type: CharType;
  value: string;
};

export type StructType = {
  typeName: `struct ${string}`;
  fields: Record<Name, NativeType>;
};
export type StructValue = {
  type: StructType;
  value: Record<Name, TypedValue>;
};

export type PointerType = {
  typeName: `${string}*`;
  innerType: NativeType;
};
export type PointerValue = {
  type: PointerType;
  value: Addr;
};

export type ArrayType = {
  typeName: `${string}[]`;
  innerType: NativeType;
};

export type SizetType = {
  typeName: 'size_t';
};

export type SizetValue = {
  type: SizetType;
  value: null;
};
export type ArrayValue = {
  type: ArrayType;
  // It is important that the value of an ArrayValue is an array of TypedValue,
  // not an array of Value. This is to support nested types e.g. array of structs.
  value: TypedValue[];
  size: number; // Capacity of array
  userTypeDeclaration: string;
};

export type TypedValue =
  | IntValue
  | FloatValue
  | DoubleValue
  | CharValue
  | StructValue
  | PointerValue
  | SizetValue
  | ArrayValue;

export type RecordedValue =
  | number
  | string
  | null
  | RecordedValue[]
  | { [field: Name]: RecordedValue };

export type MemoryValue = { addr: string; typeName: string; value: RecordedValue };
export type NativeType = TypedValue['type'];
export type Value = TypedValue['value'];
export type NativeTypeName = NativeType['typeName'];

export type Stack = Record<Name, MemoryValue>;
export type Heap = Record<Addr, MemoryValue>;

export type BackendState = {
  frame_info: {
    file: string;
    line: string;
    line_num: number;
    function: string;
  };
  stack_data: Stack;
  heap_data: Heap;
};

export type ProgramEnd = {
  exited: true;
};

export function isProgramEnd(state: BackendState | ProgramEnd): state is ProgramEnd {
  return (state as ProgramEnd).exited !== undefined;
}

export type BackendTypeDeclaration = {
  file: string;
  line_num: string;
  original_line: string;
  typeName: NativeTypeName;
  // For structs, the fields
  fields?: {
    name: Name;
    typeName: NativeTypeName;
  }[];
  // For typedefs, the type being aliased
  type?: {
    typeName: NativeTypeName;
  };
};

export const isStructTypeName = (typeName: string): typeName is StructType['typeName'] =>
  typeName.startsWith('struct ');

export const isPointerType = (typeName: string): typeName is PointerType['typeName'] =>
  typeName.endsWith('*');

export const isArrayType = (typeName: string): typeName is ArrayType['typeName'] =>
  typeName.endsWith('[]');

export const isNativeTypeName = (typeName: string): typeName is NativeTypeName =>
  typeName === 'int' ||
  typeName === 'float' ||
  typeName === 'double' ||
  typeName === 'char' ||
  isStructTypeName(typeName) ||
  isPointerType(typeName) ||
  isArrayType(typeName);

export const INITIAL_BACKEND_STATE: BackendState = {
  frame_info: {
    file: '',
    line: '',
    line_num: 0,
    function: '',
  },
  stack_data: {},
  heap_data: {},
};

export function isInitialBackendState(state: BackendState): boolean {
  return (
    state.frame_info.file === '' &&
    state.frame_info.line === '' &&
    state.frame_info.line_num === 0 &&
    state.frame_info.function === '' &&
    Object.keys(state.stack_data).length === 0 &&
    Object.keys(state.heap_data).length === 0
  );
}

interface FunctionParameter {
  type: string;
  name: string | null;
}

interface FunctionDeclaration {
  return_type: string;
  params: FunctionParameter[];
}

export interface FunctionStructure {
  name: string;
  func_decl: FunctionDeclaration;
}
