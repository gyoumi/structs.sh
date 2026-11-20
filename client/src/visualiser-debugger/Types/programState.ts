// TODO: should an explicit 'null' be includded in addresses? Or should it map to 0x00
export type Addr = `0x${string}`;
export type Name = string;

export type IntType = {
  typeName: 'int';
};

export type FloatType = {
  typeName: 'float';
};

export type DoubleType = {
  typeName: 'double';
};

export type CharType = {
  typeName: 'char';
};

export type StructType = {
  typeName: `struct ${string}`;
  fields: Record<Name, NativeType>;
};

export type PointerType = {
  typeName: `${string}*`;
  innerType: NativeType;
};

export type ArrayType = {
  typeName: `${string}[]`;
  innerType: NativeType;
};

export type NativeType =
  | IntType
  | FloatType
  | DoubleType
  | CharType
  | StructType
  | PointerType
  | ArrayType;

export type RecordedValue =
  | number
  | string
  | null
  | RecordedValue[]
  | { [field: Name]: RecordedValue };

export type MemoryValue = { addr: string; typeName: string; value: RecordedValue };
export type NativeTypeName = NativeType['typeName'];

export type Stack = Record<Name, MemoryValue>;
export type Heap = Record<Addr, MemoryValue>;

export type ProgramState = {
  frame_info: {
    file: string;
    line: string;
    line_num: number;
    function: string;
  };
  stack_data: Stack;
  heap_data: Heap;
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

export const INITIAL_PROGRAM_STATE: ProgramState = {
  frame_info: {
    file: '',
    line: '',
    line_num: 0,
    function: '',
  },
  stack_data: {},
  heap_data: {},
};

export function isInitialProgramState(state: ProgramState): boolean {
  return (
    state.frame_info.file === '' &&
    state.frame_info.line === '' &&
    state.frame_info.line_num === 0 &&
    state.frame_info.function === '' &&
    Object.keys(state.stack_data).length === 0 &&
    Object.keys(state.heap_data).length === 0
  );
}
