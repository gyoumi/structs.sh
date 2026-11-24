import BSTInsertAnimationProducer from '../animation-producer/BSTInsertAnimationProducer';
import updateNodePositions from '../util/helpers';
import GraphicalBSTNode from './GraphicalBSTNode';

/** The tree an insert adds to. */
export interface BSTRoot {
  root: GraphicalBSTNode | null;
}

const insertBelow = (
  tree: BSTRoot,
  root: GraphicalBSTNode,
  input: number,
  animationProducer: BSTInsertAnimationProducer
): void => {
  if (root.value > input) {
    animationProducer.countNodePassed();
    animationProducer.doAnimationAndHighlight(5, animationProducer.halfHighlightNode, root);
    animationProducer.doAnimationAndHighlight(
      6,
      animationProducer.highlightLine,
      root.leftLineTarget,
      root.leftArrowTarget,
      true
    );
    if (root.left == null) {
      root.left = GraphicalBSTNode.from(input);
      updateNodePositions(tree.root);
      animationProducer.doAnimationAndHighlight(
        3,
        animationProducer.createAndLayoutNode,
        root.left,
        tree.root,
        true
      );
    } else {
      insertBelow(tree, root.left, input, animationProducer);
    }
  } else if (root.value < input) {
    animationProducer.countNodePassed();
    animationProducer.doAnimationAndHighlight(7, animationProducer.halfHighlightNode, root);
    animationProducer.doAnimationAndHighlight(
      8,
      animationProducer.highlightLine,
      root.rightLineTarget,
      root.rightArrowTarget,
      true
    );
    if (root.right == null) {
      root.right = GraphicalBSTNode.from(input);
      updateNodePositions(tree.root);
      animationProducer.doAnimationAndHighlight(
        3,
        animationProducer.createAndLayoutNode,
        root.right,
        tree.root,
        true
      );
    } else {
      insertBelow(tree, root.right, input, animationProducer);
    }
  } else {
    animationProducer.countNodePassed();
    animationProducer.doAnimation(animationProducer.halfHighlightNodeRed, root);
    animationProducer.doAnimationAndHighlight(9, animationProducer.unhighlightBST, tree.root);
  }
};

const insertOne = (
  tree: BSTRoot,
  input: number,
  animationProducer: BSTInsertAnimationProducer
): void => {
  if (tree.root === null) {
    tree.root = GraphicalBSTNode.from(input);
    updateNodePositions(tree.root);
    animationProducer.doAnimationAndHighlight(3, animationProducer.createNode, tree.root, true);
    animationProducer.doAnimation(animationProducer.unhighlightBST, tree.root);
  } else {
    insertBelow(tree, tree.root, input, animationProducer);
    animationProducer.doAnimationAndHighlight(9, animationProducer.unhighlightBST, tree.root);
  }
};

/** Inserts `values` into `tree` in order, animating every insert on one timeline. */
export const insertValues = (tree: BSTRoot, values: number[]): BSTInsertAnimationProducer => {
  const animationProducer = new BSTInsertAnimationProducer();
  animationProducer.renderInsertCode();
  values.forEach((input) => insertOne(tree, input, animationProducer));
  return animationProducer;
};
