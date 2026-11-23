import AVLAnimationProducer from '@/visualiser-src/avl-tree-visualiser/animation-producer/AVLAnimationProducer';
import updateNodePositions from '@/visualiser-src/binary-search-tree-visualiser/util/helpers';
import GraphicalAVLNode from './GraphicalAVLNode';
import { AVLRoot, rotateLeft, rotateRight } from './avlRotate';

/** Returns whether to keep rebalancing on the way up: false after a duplicate. */
const insertBelow = (
  tree: AVLRoot,
  parent: GraphicalAVLNode | null,
  root: GraphicalAVLNode,
  isInsertLeft: boolean,
  input: number,
  animationProducer: AVLAnimationProducer
): boolean => {
  if (root.value > input) {
    animationProducer.countNodePassed();
    animationProducer.doAnimationAndHighlight(4, animationProducer.halfHighlightNode, root);
    animationProducer.doAnimationAndHighlight(
      5,
      animationProducer.highlightLine,
      root.leftLineTarget,
      root.leftArrowTarget,
      true
    );
    if (root.left == null) {
      root.left = GraphicalAVLNode.from(input);
      updateNodePositions(tree.root);
      animationProducer.doAnimationAndHighlight(3, animationProducer.createNode, root.left, true);
      animationProducer.doAnimation(animationProducer.unhighlightNode, root.left);
    } else if (!insertBelow(tree, root, root.left, true, input, animationProducer)) {
      return false;
    }
  } else if (root.value < input) {
    animationProducer.countNodePassed();
    animationProducer.doAnimationAndHighlight(6, animationProducer.halfHighlightNode, root);
    animationProducer.doAnimationAndHighlight(
      7,
      animationProducer.highlightLine,
      root.rightLineTarget,
      root.rightArrowTarget,
      true
    );
    if (root.right == null) {
      root.right = GraphicalAVLNode.from(input);
      updateNodePositions(tree.root);
      animationProducer.doAnimationAndHighlight(3, animationProducer.createNode, root.right, true);
      animationProducer.doAnimation(animationProducer.unhighlightNode, root.right);
    } else if (!insertBelow(tree, root, root.right, false, input, animationProducer)) {
      return false;
    }
  } else {
    animationProducer.countNodePassed();
    animationProducer.doAnimationAndHighlight(8, animationProducer.halfHighlightNodeRed, root);
    animationProducer.doAnimationAndHighlight(9, animationProducer.unhighlightBST, tree.root);

    return false;
  }
  root.updateHeight();
  if (root.balance > 1) {
    animationProducer.doAnimationAndHighlight(13, animationProducer.highlightNode, root);
    if (root.left != null && input > root.left.value) {
      animationProducer.doAnimationAndHighlight(14, animationProducer.highlightNode, root.left);
      animationProducer.highlightCode(15);
      rotateLeft(tree, root, root.left, true, animationProducer);
    }
    animationProducer.highlightCode(16);
    rotateRight(tree, parent, root, isInsertLeft, animationProducer);
  } else if (root.balance < -1) {
    animationProducer.doAnimationAndHighlight(17, animationProducer.highlightNode, root);
    if (root.right != null && input < root.right.value) {
      animationProducer.doAnimationAndHighlight(18, animationProducer.highlightNode, root.right);
      animationProducer.highlightCode(19);
      rotateRight(tree, root, root.right, false, animationProducer);
    }
    animationProducer.highlightCode(20);
    rotateLeft(tree, parent, root, isInsertLeft, animationProducer);
  } else {
    animationProducer.doAnimationAndHighlight(21, animationProducer.highlightNode, root);
    animationProducer.doAnimationAndHighlight(
      22,
      animationProducer.unhighlightNodeAndPointers,
      root
    );
  }

  return true;
};

const insertOne = (tree: AVLRoot, input: number, animationProducer: AVLAnimationProducer): void => {
  if (tree.root === null) {
    tree.root = GraphicalAVLNode.from(input);
    updateNodePositions(tree.root);
    animationProducer.doAnimationAndHighlight(3, animationProducer.createNode, tree.root, true);
    animationProducer.doAnimation(animationProducer.unhighlightBST, tree.root);
  } else {
    insertBelow(tree, null, tree.root, false, input, animationProducer);
  }
};

/** Inserts `values` into `tree` in order with AVL rebalancing, animating every insert on one timeline. */
export const insertValues = (tree: AVLRoot, values: number[]): AVLAnimationProducer => {
  const animationProducer = new AVLAnimationProducer();
  animationProducer.renderInsertCode();
  values.forEach((input) => insertOne(tree, input, animationProducer));
  return animationProducer;
};
