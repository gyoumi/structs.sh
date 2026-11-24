import type { DrawingBounds } from '@/visualiser-src/common/AnimationProducer';
import type { ListOperation } from '@/Services/puzzles/puzzles';
import { actualNodeDiameter } from '../../common/constants';
import { newNodePosition } from '../animation-producer/LinkedListAnimationProducer';
import LinkedListRunAnimationProducer from '../animation-producer/LinkedListRunAnimationProducer';
import { CURRENT, PREV, nodePathWidth, topOffset } from '../util/constants';
import type GraphicalLinkedList from './GraphicalLinkedList';
import GraphicalLinkedListNode from './GraphicalLinkedListNode';

const RADIUS = actualNodeDiameter / 2;

const boundsWith = (
  head: GraphicalLinkedListNode | null,
  [newX, newY]: [number, number],
  nextLength: number
): DrawingBounds => {
  let maxX = Math.max(newX, nextLength * nodePathWidth + RADIUS);
  let maxY = Math.max(newY, topOffset);
  for (let curr = head; curr !== null; curr = curr.next) {
    maxX = Math.max(maxX, curr.x);
    maxY = Math.max(maxY, curr.y);
  }
  const top = topOffset - RADIUS;
  return { x: 0, y: top, width: maxX + RADIUS, height: maxY + RADIUS - top };
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
  producer.setTargetBounds(boundsWith(list.head, newNodePosition(at, list.length), list.length));
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
  producer.setTargetBounds(null);
  let curr = list.head!;
  let prev: GraphicalLinkedListNode | null = null;
  producer.doAnimation(producer.initialisePointer, CURRENT);
  for (let i = 0; i < index; i += 1) {
    prev = curr;
    if (i === 0) {
      producer.doAnimation(producer.initialisePointerAndHighlight, PREV, prev);
    } else {
      producer.doAnimation(producer.movePointerToNextAndHighlight, PREV, prev);
    }
    curr = curr.next!;
    if (i === index - 1) {
      producer.doAnimation(producer.movePointerToNextAndHighlightRight, CURRENT, curr);
    } else {
      producer.doAnimation(producer.movePointerToNext, CURRENT);
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
