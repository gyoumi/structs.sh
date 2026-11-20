import { UserAnnotation, DataStructureType, isLinkedListNode } from '../../../Types/annotationType';
import { Addr, ProgramState, RecordedValue } from '../../../Types/programState';
import { assertUnreachable } from '../Util/util';

export type LinkedListNode = {
  uid: Addr;
  data: RecordedValue;
  next: Addr;
};

/** The list nodes on the heap, in heap order, for each linked list annotation. */
export function readLinkedListNodes(
  programState: ProgramState,
  annotation: UserAnnotation
): LinkedListNode[] {
  const linkedList: LinkedListNode[] = [];

  Object.entries(annotation.typeAnnotation).forEach(([_, linkedListAnnotation]) => {
    switch (linkedListAnnotation.type) {
      case DataStructureType.BinaryTree: {
        break;
      }
      case DataStructureType.LinkedList: {
        Object.entries(programState.heap_data).forEach(([uid, heapValue]) => {
          if (isLinkedListNode(heapValue, linkedListAnnotation)) {
            const fields = heapValue.value;
            const linkedListNode: LinkedListNode = {
              uid: uid as Addr,
              data: fields[linkedListAnnotation.value.name].value,
              next: fields[linkedListAnnotation.next.name].value as Addr,
            };
            linkedList.push(linkedListNode);
          }
        });
        break;
      }
      default: {
        assertUnreachable(linkedListAnnotation);
      }
    }
  });
  return linkedList;
}
