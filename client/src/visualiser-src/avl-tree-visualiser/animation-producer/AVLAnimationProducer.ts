import BSTInsertAnimationProducer from '@/visualiser-src/binary-search-tree-visualiser/animation-producer/BSTInsertAnimationProducer';
import { treeNodeFontSize } from '@/visualiser-src/common/GenericGraphicalTreeNode';
import {
  insertCodeSnippet,
  deleteCodeSnippet,
} from '@/visualiser-src/avl-tree-visualiser/util/codeSnippets';
import GraphicalAVLNode from '@/visualiser-src/avl-tree-visualiser/data-structure/GraphicalAVLNode';

export default class AVLAnimationProducer extends BSTInsertAnimationProducer {
  private rotationCount = 0;

  /** Counts one single rotation; a double rotation counts twice. */
  public countRotation(): void {
    this.rotationCount += 1;
  }

  /** Single rotations made so far. */
  public get rotations(): number {
    return this.rotationCount;
  }

  protected get stepCounters(): Record<string, number> {
    return { rotations: this.rotationCount, nodesPassed: this.nodesPassed };
  }

  public renderInsertCode(): void {
    this.renderCode(insertCodeSnippet);
  }

  public renderDeleteCode(): void {
    this.renderCode(deleteCodeSnippet);
  }

  public unhighlightNodeAndPointers(node: GraphicalAVLNode): void {
    this.unhighlightLine(node.leftLineTarget, node.leftArrowTarget);
    this.unhighlightLine(node.rightLineTarget, node.rightArrowTarget);
    this.unhighlightNode(node);
  }

  public highlightNodeAndLeftPointer(node: GraphicalAVLNode): void {
    this.halfHighlightNode(node);
    this.highlightLine(node.leftLineTarget, node.leftArrowTarget, true);
  }

  public updateNodeValue(node: GraphicalAVLNode, previousValue: number, nextValue: number): void {
    this.addSequenceAnimation(
      node.textTarget.animate(400).during((position: number) => {
        const shown = position < 0.5 ? previousValue : nextValue;
        node.textTarget.text(String(shown));
        node.textTarget.attr({
          opacity: Math.abs(position - 0.5) * 2,
          'font-size': treeNodeFontSize(shown),
        });
      })
    );
  }

  public freeNode(
    node: GraphicalAVLNode,
    parent: GraphicalAVLNode | null,
    shouldHideParentPointer: boolean
  ): void {
    if (parent !== null && shouldHideParentPointer) {
      if (node === parent.left) {
        this.addSequenceAnimation(parent.leftLineTarget.animate().attr({ opacity: 0 }));
      } else {
        this.addSequenceAnimation(parent.rightLineTarget.animate().attr({ opacity: 0 }));
      }
    }

    this.addSequenceAnimation(node.nodeTarget.animate().attr({ opacity: 0 }));
    this.addSequenceAnimation(node.textTarget.animate().attr({ opacity: 0 }));
    this.addSequenceAnimation(node.leftLineTarget.animate().attr({ opacity: 0 }));
    this.addSequenceAnimation(node.leftArrowTarget.animate().attr({ opacity: 0 }));
    this.addSequenceAnimation(node.rightLineTarget.animate().attr({ opacity: 0 }));
    this.addSequenceAnimation(node.rightArrowTarget.animate().attr({ opacity: 0 }));
  }
}
