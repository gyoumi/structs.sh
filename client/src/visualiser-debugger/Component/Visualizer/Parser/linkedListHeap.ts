import { UserAnnotation, DataStructureType, isLinkedListNode } from '../../../Types/annotationType';
import { Addr, BackendState } from '../../../Types/backendType';
import { assertUnreachable } from '../Util/util';

export type LinkedListNode = {
  uid: Addr;
  data: string;
  next: Addr;
};

/** The list nodes on the heap, in heap order, for each linked list annotation. */
export function readLinkedListNodes(
  backendStructure: BackendState,
  annotation: UserAnnotation
): LinkedListNode[] {
  // Later need to add an additional step to parse user defined struct into generic struct
  const linkedList: LinkedListNode[] = [];

  // === Get all linked list nodes from backend heap data
  Object.entries(annotation.typeAnnotation).forEach(([_, linkedListAnnotation]) => {
    switch (linkedListAnnotation.type) {
      case DataStructureType.BinaryTree: {
        break;
      }
      case DataStructureType.LinkedList: {
        Object.entries(backendStructure.heap_data).forEach(([uid, heapValue]) => {
          if (isLinkedListNode(heapValue, linkedListAnnotation)) {
            const linkedListNode: LinkedListNode = {
              uid: uid as Addr,
              // @ts-ignore
              data: heapValue.value[linkedListAnnotation.value.name].value,
              // @ts-ignore
              next: heapValue.value[linkedListAnnotation.next.name].value,
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
