import LinkedListAnimationProducer from './LinkedListAnimationProducer';
import GraphicalLinkedListNode from '../data-structure/GraphicalLinkedListNode';
import { searchCodeSnippet } from '../util/codeSnippets';
import { canvasTheme } from '../../common/canvasTheme';

// Class that produces SVG.Runners animating linked list operations specific to inserting
export default class LinkedListSearchAnimationProducer extends LinkedListAnimationProducer {
  public renderSearchCode() {
    this.renderCode(searchCodeSnippet);
  }

  public indicateFound(node: GraphicalLinkedListNode) {
    this.highlightRightNode(node);
  }

  public indicateNotFound(node: GraphicalLinkedListNode) {
    this.highlightNotRightNode(node);
  }

  public resetPointersAndColor(head: GraphicalLinkedListNode) {
    this.resetPointers();
    let curr: GraphicalLinkedListNode | null = head;
    while (curr != null) {
      this.addSequenceAnimation(curr.boxTarget.animate().attr({ stroke: canvasTheme.ink }));
      this.addSequenceAnimation(curr.numberTarget.animate().attr({ fill: canvasTheme.ink }));
      curr = curr.next;
    }
  }
}
