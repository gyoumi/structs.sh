import { SVG, Path, Element } from '@svgdotjs/svg.js';
import { topOffset, nodePathWidth, insertedNodeTopOffset, CURRENT, PREV } from '../util/constants';
import { actualNodeDiameter, strokeWidth, nodeDiameter } from '../../common/constants';
import AnimationProducer, { DrawingBounds } from '../../common/AnimationProducer';
import { getCanvasTarget } from '../../common/canvasTarget';
import GraphicalLinkedListNode from '../data-structure/GraphicalLinkedListNode';
import { getPointerPath } from '../util/util';
import { canvasTheme } from '../../common/canvasTheme';

/** Where a node created at `index` of a list that is `length` long once it holds the node first appears. */
export const newNodePosition = (index: number, length: number): [number, number] =>
  index < length - 1
    ? [index * nodePathWidth + (3 * actualNodeDiameter) / 2, insertedNodeTopOffset]
    : [length * nodePathWidth + actualNodeDiameter / 2, topOffset];

const pointerPosition = (index: number): [number, number] => [
  10 + (index + 1) * nodePathWidth + strokeWidth / 2,
  topOffset + actualNodeDiameter / 2,
];

// Class that produces SVG.Runners animating general linked list operations
export default class LinkedListAnimationProducer extends AnimationProducer {
  private pointerIndexes = new Map<string, number>();

  private targetBounds: DrawingBounds | null = null;

  /** Records the drawing bounds upcoming steps need visible so the stage can zoom out before a node appears. */
  public setTargetBounds(bounds: DrawingBounds | null): void {
    this.targetBounds = bounds;
  }

  protected get stepBounds(): DrawingBounds | null {
    return this.targetBounds;
  }

  protected pointer(pointerId: string): Element {
    return SVG(getCanvasTarget().canvas).findOne(pointerId) as Element;
  }

  public createNodeAt(index: number, newNode: GraphicalLinkedListNode, length: number) {
    const [cx, cy] = newNodePosition(index, length);
    newNode.boxTarget.cx(cx).cy(cy);
    newNode.numberTarget.cx(cx).cy(cy);
    newNode.placeAt(cx, cy);
    this.addSequenceAnimation(newNode.boxTarget.animate().attr({ opacity: 1 }));
    this.addSequenceAnimation(newNode.numberTarget.animate().attr({ opacity: 1 }));
  }

  public addNodeAt(index: number, newNode: GraphicalLinkedListNode, length: number) {
    this.createNodeAt(index, newNode, length);
    this.highlightRightNode(newNode);
  }

  public highlightRightNode(node: GraphicalLinkedListNode) {
    this.addSequenceAnimation(node.boxTarget.animate().attr({ stroke: canvasTheme.accent }));
    this.addSequenceAnimation(node.numberTarget.animate().attr({ fill: canvasTheme.accent }));
  }

  public highlightNotRightNode(node: GraphicalLinkedListNode) {
    this.addSequenceAnimation(node.boxTarget.animate().attr({ stroke: canvasTheme.danger }));
    this.addSequenceAnimation(node.numberTarget.animate().attr({ fill: canvasTheme.danger }));
  }

  public removeHighlightNode(node: GraphicalLinkedListNode) {
    this.addSequenceAnimation(node.boxTarget.animate().attr({ stroke: canvasTheme.ink }));
    this.addSequenceAnimation(node.numberTarget.animate().attr({ fill: canvasTheme.ink }));
  }

  public initialisePointer(pointerId: string) {
    const pointerSvg = this.pointer(pointerId);
    this.pointerIndexes.set(pointerId, 0);
    const [x, y] = pointerPosition(0);
    this.addSequenceAnimation(pointerSvg.animate(1).move(x, y));
    this.addSequenceAnimation(pointerSvg.animate().attr({ opacity: 1 }));
  }

  public movePointerToNext(pointerId: string) {
    const index = (this.pointerIndexes.get(pointerId) ?? 0) + 1;
    this.pointerIndexes.set(pointerId, index);
    const [x, y] = pointerPosition(index);
    this.addSequenceAnimation(this.pointer(pointerId).animate().move(x, y));
  }

  public resetPointers() {
    this.addSequenceAnimation(this.pointer(CURRENT).animate().attr({ opacity: 0 }));
    this.addSequenceAnimation(this.pointer(PREV).animate().attr({ opacity: 0 }));
  }

  public resetColorNode(head: GraphicalLinkedListNode) {
    this.addSequenceAnimation(head.boxTarget.animate().attr({ stroke: canvasTheme.ink }));
    this.addSequenceAnimation(head.numberTarget.animate().attr({ fill: canvasTheme.ink }));
  }

  public resetPositioning(headPointer: Path, head: GraphicalLinkedListNode | null) {
    let curr: GraphicalLinkedListNode | null = head;
    let index: number = 0;
    this.addSequenceAnimation(
      headPointer
        .animate()
        .plot(
          getPointerPath(
            actualNodeDiameter / 2,
            topOffset,
            nodePathWidth + actualNodeDiameter / 2,
            topOffset
          ) as any
        )
    );
    while (curr !== null) {
      const cx = (index + 1) * nodePathWidth + actualNodeDiameter / 2;
      curr.placeAt(cx, topOffset);
      this.addSequenceAnimation(curr.boxTarget.animate().cx(cx).cy(topOffset));
      this.addSequenceAnimation(curr.numberTarget.animate().cx(cx).cy(topOffset));
      this.addSequenceAnimation(
        curr.pointerTarget
          .animate()
          .plot(getPointerPath(cx, topOffset, cx + nodePathWidth, topOffset) as any)
      );
      index += 1;
      curr = curr.next;
    }
    if (head !== null) this.resetColorNode(head);
  }

  public resetList(headPointer: Path, head: GraphicalLinkedListNode | null) {
    this.resetPointers();
    this.resetPositioning(headPointer, head);
  }

  public resetPointersAndColor(node: GraphicalLinkedListNode) {
    this.resetPointers();
    this.resetColorNode(node);
  }

  public resetListAndColor(
    headPointer: Path,
    head: GraphicalLinkedListNode,
    node: GraphicalLinkedListNode
  ) {
    this.resetList(headPointer, head);
    this.resetColorNode(node);
  }

  // Precondition: newHead's next pointer will never be null
  public newHeadPointToOldHead(newHead: GraphicalLinkedListNode) {
    this.showPointer(newHead);
  }

  public pointHeadToPrependedNode(head: Path, newHead: GraphicalLinkedListNode) {
    this.addSequenceAnimation(
      head.animate().plot(getPointerPath(nodeDiameter / 2, topOffset, newHead.x, newHead.y) as any)
    );
  }

  public initialiseHead(headPointer: Path) {
    this.addSequenceAnimation(headPointer.animate().attr({ opacity: 1 }));
  }

  // Precondition: last's next pointer will never be null
  public linkLastToNew(last: GraphicalLinkedListNode) {
    this.showPointer(last);
  }

  public insertedNodePointToNext(newNode: GraphicalLinkedListNode) {
    if (newNode.next !== null) this.showPointer(newNode);
  }

  public pointToInsertedNode(node: GraphicalLinkedListNode) {
    this.addSequenceAnimation(
      node.pointerTarget
        .animate()
        .plot(getPointerPath(node.x, node.y, node.next!.x, node.next!.y) as any)
    );
  }

  private showPointer(node: GraphicalLinkedListNode) {
    const path = getPointerPath(node.x, node.y, node.next!.x, node.next!.y) as any;
    this.addSequenceAnimation(node.pointerTarget.animate(1).plot(path));
    this.addSequenceAnimation(node.pointerTarget.animate().attr({ opacity: 1 }));
  }
}
