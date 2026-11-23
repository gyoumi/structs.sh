import AVLAnimationProducer from '@/visualiser-src/avl-tree-visualiser/animation-producer/AVLAnimationProducer';
import updateNodePositions from '@/visualiser-src/binary-search-tree-visualiser/util/helpers';
import GraphicalAVLNode from './GraphicalAVLNode';

/** The tree a rotation or insert changes. */
export interface AVLRoot {
  root: GraphicalAVLNode | null;
}

export const rotateLeft = (
  tree: AVLRoot,
  parent: GraphicalAVLNode | null,
  node: GraphicalAVLNode | null,
  isLeftChild: boolean,
  animationProducer: AVLAnimationProducer
): GraphicalAVLNode | null => {
  if (node === null || node.right === null) {
    return node;
  }
  const newRoot = node.right;
  if (newRoot.left != null) {
    animationProducer.doAnimationWithoutTimestamp(
      animationProducer.movePointerToNewRootLeftChild,
      node,
      newRoot
    );
    animationProducer.doAnimationWithoutTimestamp(
      animationProducer.moveLeftPointerToOldRoot,
      node,
      newRoot
    );
  } else {
    if (node.right != null) {
      animationProducer.doAnimationWithoutTimestamp(
        animationProducer.hideLine,
        node.rightLineTarget
      );
    }
    animationProducer.doAnimationWithoutTimestamp(
      animationProducer.assignNewRootLeftPointerToOldRoot,
      node,
      newRoot
    );
  }
  node.right = newRoot.left;
  newRoot.left = node;
  node.updateHeight();
  newRoot.updateHeight();
  if (parent === null) {
    tree.root = newRoot;
  } else if (isLeftChild) {
    parent.left = newRoot;
  } else {
    parent.right = newRoot;
  }
  updateNodePositions(tree.root);
  animationProducer.countRotation();
  animationProducer.doAnimation(animationProducer.updateAndUnhighlightBST, newRoot);
  if (parent !== null) {
    animationProducer.doAnimationWithoutTimestamp(animationProducer.updateNodeLines, parent);
  }
  return newRoot;
};

export const rotateRight = (
  tree: AVLRoot,
  parent: GraphicalAVLNode | null,
  node: GraphicalAVLNode | null,
  isLeftChild: boolean,
  animationProducer: AVLAnimationProducer
): GraphicalAVLNode | null => {
  if (node === null || node.left === null) {
    return node;
  }
  const newRoot = node.left;
  if (newRoot.right != null) {
    animationProducer.doAnimationWithoutTimestamp(
      animationProducer.movePointerToNewRootRightChild,
      node,
      newRoot
    );
    animationProducer.doAnimationWithoutTimestamp(
      animationProducer.moveRightPointerToOldRoot,
      node,
      newRoot
    );
  } else {
    if (node.left != null) {
      animationProducer.doAnimationWithoutTimestamp(
        animationProducer.hideLine,
        node.leftLineTarget
      );
    }
    animationProducer.doAnimationWithoutTimestamp(
      animationProducer.assignNewRootRightPointerToOldRoot,
      node,
      newRoot
    );
  }
  node.left = newRoot.right;
  newRoot.right = node;
  node.updateHeight();
  newRoot.updateHeight();
  if (parent === null) {
    tree.root = newRoot;
  } else if (isLeftChild) {
    parent.left = newRoot;
  } else {
    parent.right = newRoot;
  }
  updateNodePositions(tree.root);
  animationProducer.countRotation();
  animationProducer.doAnimation(animationProducer.updateAndUnhighlightBST, newRoot);
  if (parent !== null) {
    animationProducer.doAnimationWithoutTimestamp(animationProducer.updateNodeLines, parent);
  }
  return newRoot;
};
