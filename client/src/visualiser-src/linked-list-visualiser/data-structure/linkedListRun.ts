import type { DrawingBounds } from '@/visualiser-src/common/AnimationProducer';
import type { ListOperation } from '@/Services/challenges/challenges';
import { actualNodeDiameter } from '../../common/constants';
import LinkedListRunAnimationProducer from '../animation-producer/LinkedListRunAnimationProducer';
import {
  CURRENT,
  PREV,
  LIST_ENVELOPE_BOTTOM,
  LIST_ENVELOPE_TOP,
  nodePathWidth,
} from '../util/constants';
import type GraphicalLinkedList from './GraphicalLinkedList';
import GraphicalLinkedListNode from './GraphicalLinkedListNode';

const runEnvelope = (maxLength: number): DrawingBounds => ({
  x: actualNodeDiameter / 2,
  y: LIST_ENVELOPE_TOP,
  width: Math.max(1, maxLength) * nodePathWidth + actualNodeDiameter / 2,
  height: LIST_ENVELOPE_BOTTOM - LIST_ENVELOPE_TOP,
});

const maxLengthFor = (startLength: number, operations: ListOperation[]): number => {
  let length = startLength;
  let max = startLength;
  operations.every((op) => {
    if (op.kind === 'delete') {
      if (op.index < 0 || op.index >= length) return false;
      length -= 1;
    } else {
      length += 1;
      max = Math.max(max, length);
    }
    return true;
  });
  return max;
};

const insertAt = (
  list: GraphicalLinkedList,
  producer: LinkedListRunAnimationProducer,
  value: number,
  index: number
) => {
  const at = Math.min(index, list.length);
  list.length += 1;
  const newNode = GraphicalLinkedListNode.from(value);
  producer.doAnimation(producer.addNodeAt, at, newNode, list.length);
  if (at === 0) {
    if (list.head === null) {
      producer.doAnimation(producer.initialiseHead, list.headPointer);
    } else {
      newNode.next = list.head;
      producer.doAnimation(producer.newHeadPointToOldHead, newNode);
      producer.doAnimation(producer.pointHeadToPrependedNode, list.headPointer, newNode);
    }
    list.head = newNode;
    producer.doAnimation(producer.resetListAndColor, list.headPointer, list.head);
    return;
  }
  let curr = list.head!;
  producer.doAnimation(producer.initialisePointer, CURRENT);
  for (let i = 0; i < at - 1; i += 1) {
    curr = curr.next!;
    producer.doAnimation(producer.movePointerToNext, CURRENT);
  }
  newNode.next = curr.next;
  curr.next = newNode;
  if (newNode.next !== null) {
    producer.doAnimation(producer.insertedNodePointToNext, newNode);
    producer.doAnimation(producer.pointToInsertedNode, curr);
  } else {
    producer.doAnimation(producer.linkLastToNew, curr);
  }
  producer.doAnimation(producer.resetListAndColor, list.headPointer, list.head);
};

const deleteAt = (
  list: GraphicalLinkedList,
  producer: LinkedListRunAnimationProducer,
  index: number
) => {
  list.length -= 1;
  let curr = list.head!;
  let prev: GraphicalLinkedListNode | null = null;
  producer.doAnimation(producer.initialisePointer, CURRENT);
  for (let i = 0; i < index; i += 1) {
    prev = curr;
    curr = curr.next!;
    if (i === 0) {
      if (index === 1) {
        producer.doAnimation(producer.movePointerToNextAndHighlightRight, CURRENT, curr);
      } else {
        producer.doAnimation(producer.movePointerToNext, CURRENT);
      }
      producer.doAnimationWithoutTimestamp(producer.initialisePointer, PREV);
    } else {
      producer.doAnimation(producer.advanceDeletePointers, curr, i === index - 1);
    }
  }
  if (prev === null) {
    list.head = curr.next;
    if (list.head === null) {
      producer.doAnimation(producer.setHeadToNull, list.headPointer);
    } else {
      producer.doAnimation(producer.pointHeadToNext, list.headPointer, list.head);
    }
  } else {
    prev.next = curr.next;
    if (prev.next === null) {
      producer.doAnimation(producer.setNextToNull, prev);
    } else {
      producer.doAnimation(producer.morphNextPointerToArc, prev);
    }
  }
  producer.doAnimation(producer.deleteNode, curr);
  producer.doAnimation(producer.resetListAndColor, list.headPointer, list.head);
};

/** Runs `operations` on `list` in order on one timeline, stopping before a delete whose index is not in the list. */
export const runListOperations = (
  list: GraphicalLinkedList,
  operations: ListOperation[]
): LinkedListRunAnimationProducer => {
  const producer = new LinkedListRunAnimationProducer();
  producer.setTargetBounds(runEnvelope(maxLengthFor(list.length, operations)));
  operations.every((operation) => {
    if (operation.kind === 'delete' && (operation.index < 0 || operation.index >= list.length)) {
      return false;
    }
    producer.startOperation();
    if (operation.kind === 'insert') {
      insertAt(list, producer, operation.value, operation.index);
    } else {
      deleteAt(list, producer, operation.index);
    }
    return true;
  });
  return producer;
};
