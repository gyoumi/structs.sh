import {
  StructType,
  Name,
  PointerType,
  MemoryValue,
  NativeTypeName,
  RecordedValue,
  isPointerType,
} from './programState';

export enum DataStructureType {
  LinkedList,
  BinaryTree,
}
export interface DataStructureAnnotationBase {
  typeName: NativeTypeName;
  type: DataStructureType;
}

type SelfReferenceField = {
  typeName: PointerType['typeName'];
  name: Name;
};

/**
 * Mapping from standard linked list node structure to the user's own defined linked list node struct
 *
 * Annotate on type definition, used for heap data.
 */
export interface LinkedListAnnotation extends DataStructureAnnotationBase {
  typeName: StructType['typeName'];
  type: DataStructureType.LinkedList;
  value: {
    typeName: NativeTypeName;
    name: Name;
  };
  next: SelfReferenceField;
}

export interface BinaryTreeAnnotation extends DataStructureAnnotationBase {
  typeName: StructType['typeName'];
  type: DataStructureType.BinaryTree;
  value: {
    typeName: NativeTypeName;
    name: Name;
  };
  left: SelfReferenceField;
  right: SelfReferenceField;
}

export type DataStructureAnnotation = LinkedListAnnotation | BinaryTreeAnnotation;

export interface StackVariableAnnotation {
  typeName: MemoryValue['typeName'];
}

export interface StackAnnotation {
  [name: Name]: StackVariableAnnotation | null;
}

export interface UserAnnotation {
  stackAnnotation: StackAnnotation;
  typeAnnotation: { [name: Name]: DataStructureAnnotation };
}

/**
 * Whether a stack variable is labelled beside the node it points at. A
 * pointer is, unless the user turned it off (an annotation of null); any
 * other variable only if the user turned it on.
 */
export const isStackVariableLabelled = (
  stackAnnotation: StackAnnotation | undefined,
  name: string,
  typeName: string
): boolean => {
  if (stackAnnotation && Object.prototype.hasOwnProperty.call(stackAnnotation, name)) {
    return stackAnnotation[name] !== null;
  }
  return isPointerType(typeName);
};

export type LinkedListNodeValue = MemoryValue & {
  value: Record<Name, { value: RecordedValue }>;
};

export const isLinkedListNode = (
  memoryValue: MemoryValue,
  linkedListAnnotation: LinkedListAnnotation
): memoryValue is LinkedListNodeValue => memoryValue.typeName === linkedListAnnotation.typeName;

export const isTreeNode = (memoryValue: MemoryValue, binaryTreeAnnotation: BinaryTreeAnnotation) =>
  memoryValue.typeName === binaryTreeAnnotation.typeName;

export enum FieldType {
  RECURSIVE,
  BASE,
}

export interface PossibleFieldBase {
  type: FieldType;
}

export interface PossibleRecursiveField extends PossibleFieldBase {
  name: string;
  typeName: PointerType['typeName'];
  type: FieldType.RECURSIVE;
}

export interface PossiblePropertyField extends PossibleFieldBase {
  name: string;
  typeName: NativeTypeName;
  type: FieldType.BASE;
}

export type PossibleField = PossibleRecursiveField | PossiblePropertyField;

export type PossibleStructAnnotation = {
  typeName: string;
  possibleFields: {
    name: string;
    possibleChoices: PossibleField[];
  };
};

export enum StructRole {
  LinkedList = 'Linked List Node',
  Empty = 'Not Visualized',
}

export enum StackVariableRole {
  LinkedListPointer = 'Linked List Node',
  Empty = 'Not Visualized',
}

export type PossibleLinkedListAnnotation = {
  typeName: StructType['typeName'];
  possibleValues: {
    name: Name;
    typeName: NativeTypeName;
  }[];
  possibleNexts: {
    name: Name;
    typeName: PointerType['typeName'];
  }[];
};
