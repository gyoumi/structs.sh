import BSTAnimationProducer from './BSTAnimationProducer';
import GraphicalBSTNode from '../data-structure/GraphicalBSTNode';
import { getPointerStartEndCoordinates } from '../../common/helpers';
import { insertCodeSnippet } from '../util/codeSnippets';
import { canvasTheme } from '../../common/canvasTheme';

export default class BSTInsertAnimationProducer extends BSTAnimationProducer {
  private nodesPassedCount = 0;

  /** Counts one existing node an insert compares with on its way down. */
  public countNodePassed(): void {
    this.nodesPassedCount += 1;
  }

  /** Existing nodes the inserts have compared with so far. */
  public get nodesPassed(): number {
    return this.nodesPassedCount;
  }

  protected get stepCounters(): Record<string, number> {
    return { nodesPassed: this.nodesPassedCount };
  }

  public renderInsertCode(): void {
    this.renderCode(insertCodeSnippet);
  }

  public createNodeLeft(node: GraphicalBSTNode, parent: GraphicalBSTNode): void {
    this.createNode(node);

    this.addSequenceAnimation(
      parent.leftLineTarget.animate(400).attr({
        opacity: 1,
      })
    );
  }

  public createNodeRight(node: GraphicalBSTNode, parent: GraphicalBSTNode): void {
    this.createNode(node);

    this.addSequenceAnimation(
      parent.rightLineTarget.animate(400).attr({
        opacity: 1,
      })
    );
  }

  /** Creates `node` and relayouts the whole tree in the same step so parent edges stay attached. */
  public createAndLayoutNode(
    node: GraphicalBSTNode,
    root: GraphicalBSTNode | null,
    highlight = false
  ): void {
    this.createNode(node, highlight);
    if (root !== null) this.updateBST(root);
  }

  // draws a node on the draw canvas and shows the node
  public createNode(node: GraphicalBSTNode, highlight: boolean = false): void {
    const [lx, ly] = BSTAnimationProducer.childCoords(node, 'left');
    const leftChildCoordinates = getPointerStartEndCoordinates(node.x, node.y, lx, ly);
    node.leftLineTarget.plot(
      leftChildCoordinates[0][0],
      leftChildCoordinates[0][1],
      leftChildCoordinates[1][0],
      leftChildCoordinates[1][1]
    );

    const [rx, ry] = BSTAnimationProducer.childCoords(node, 'right');
    const rightChildCoordinates = getPointerStartEndCoordinates(node.x, node.y, rx, ry);
    node.rightLineTarget.plot(
      rightChildCoordinates[0][0],
      rightChildCoordinates[0][1],
      rightChildCoordinates[1][0],
      rightChildCoordinates[1][1]
    );
    node.nodeTarget.cx(node.x).cy(node.y);
    node.textTarget.cx(node.x).cy(node.y);

    if (highlight) {
      // If node should be highligted during creation
      this.addSequenceAnimation(
        node.nodeTarget.animate(400).attr({
          opacity: 1,
          fill: canvasTheme.accent,
          stroke: canvasTheme.accent,
        })
      );

      this.addSequenceAnimation(
        node.textTarget.animate(400).attr({
          opacity: 1,
          fill: canvasTheme.onAccent,
        })
      );
    } else {
      this.addSequenceAnimation(
        node.nodeTarget.animate(400).attr({
          opacity: 1,
        })
      );

      this.addSequenceAnimation(
        node.textTarget.animate(400).attr({
          opacity: 1,
        })
      );
    }
  }
}
