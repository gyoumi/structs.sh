import GraphicalTreeGenerate from '@/visualiser-src/binary-search-tree-visualiser/data-structure/GraphicalTreeGenerate';
import GraphicalDataStructure from '@/visualiser-src/common/GraphicalDataStructure';
import { Documentation } from '@/visualiser-src/common/typedefs';
import { injectIds } from '@/visualiser-src/common/helpers';
import GraphicalTreeTraversal from '@/visualiser-src/binary-search-tree-visualiser/data-structure/GraphicalTreeTraversal';
import BSTTraverseAnimationProducer from '@/visualiser-src/binary-search-tree-visualiser/animation-producer/BSTTraverseAnimationProducer';
import updateNodePositions from '@/visualiser-src/binary-search-tree-visualiser/util/helpers';
import AVLAnimationProducer from '@/visualiser-src/avl-tree-visualiser/animation-producer/AVLAnimationProducer';
import GraphicalAVLNode from './GraphicalAVLNode';
import { rotateLeft, rotateRight } from './avlRotate';
import { insertValues } from './avlInsert';

// used for the actual implementation of the bst
class GraphicalAVL extends GraphicalDataStructure {
  private static documentation: Documentation = injectIds({
    insert: {
      args: ['value'],
      description:
        'Executes standard AVL insertion to add a new node with the given value into the tree.',
    },
    delete: {
      args: ['value'],
      description:
        'Executes standard AVL deletion to remove the node with the given value from the tree.',
    },
    inorderTraversal: {
      args: [],
      description: 'Executes an inorder traversal on the tree.',
    },
    preorderTraversal: {
      args: [],
      description: 'Executes a preorder traversal on the tree.',
    },
    postorderTraversal: {
      args: [],
      description: 'Executes a postorder traversal on the tree.',
    },
    insertAll: {
      args: ['keys'],
      description: 'Inserts the values in order into an empty AVL tree, on one timeline.',
      menu: 'hidden',
    },
  });

  public root: GraphicalAVLNode | null = null;

  public insert(input: number): AVLAnimationProducer {
    return insertValues(this, [input]);
  }

  public insertAll(values: number[]): AVLAnimationProducer {
    return insertValues(this, values);
  }

  public delete(input: number): AVLAnimationProducer {
    const animationProducer: AVLAnimationProducer = new AVLAnimationProducer();
    animationProducer.renderDeleteCode();

    const nodeExists = GraphicalAVL.exists(this.root, input);
    this.root = this.doDelete(this.root, null, false, input, animationProducer);

    if (nodeExists) {
      updateNodePositions(this.root);
      animationProducer.doAnimationWithoutTimestamp(animationProducer.updateBST, this.root);
      animationProducer.doAnimation(animationProducer.unhighlightBST, this.root);
    }

    return animationProducer;
  }

  private doDelete(
    root: GraphicalAVLNode | null,
    parent: GraphicalAVLNode | null,
    isLeftChild: boolean,
    input: number,
    animationProducer: AVLAnimationProducer
  ): GraphicalAVLNode | null {
    if (root === null) {
      animationProducer.doAnimationAndHighlight(3, animationProducer.unhighlightBST, this.root);
      return null;
    }

    if (input < root.value) {
      animationProducer.doAnimationAndHighlight(4, animationProducer.halfHighlightNode, root);
      if (root.left !== null) {
        animationProducer.doAnimationAndHighlight(
          5,
          animationProducer.highlightLine,
          root.leftLineTarget,
          root.leftArrowTarget,
          true
        );
      }
      root.left = this.doDelete(root.left, root, true, input, animationProducer);
    } else if (input > root.value) {
      animationProducer.doAnimationAndHighlight(6, animationProducer.halfHighlightNode, root);
      if (root.right !== null) {
        animationProducer.doAnimationAndHighlight(
          7,
          animationProducer.highlightLine,
          root.rightLineTarget,
          root.rightArrowTarget,
          true
        );
      }
      root.right = this.doDelete(root.right, root, false, input, animationProducer);
    } else {
      animationProducer.doAnimationAndHighlight(8, animationProducer.highlightNode, root);
      if (root.left === null) {
        const newRoot = root.right;
        animationProducer.doAnimationAndHighlight(
          11,
          animationProducer.freeNode,
          root,
          parent,
          newRoot === null
        );
        return newRoot;
      }
      if (root.right === null) {
        const newRoot = root.left;
        animationProducer.doAnimationAndHighlight(
          15,
          animationProducer.freeNode,
          root,
          parent,
          false
        );
        return newRoot;
      }
      const successor = this.findMinimum(root.right, animationProducer);
      const previousValue = root.value;
      root.value = successor.value;
      animationProducer.doAnimationAndHighlight(
        19,
        animationProducer.updateNodeValue,
        root,
        previousValue,
        successor.value
      );
      animationProducer.doAnimationAndHighlight(
        20,
        animationProducer.highlightLine,
        root.rightLineTarget,
        root.rightArrowTarget,
        true
      );
      root.right = this.doDelete(root.right, root, false, successor.value, animationProducer);
    }

    return this.rebalanceAfterDelete(parent, root, isLeftChild, animationProducer);
  }

  private findMinimum(
    root: GraphicalAVLNode,
    animationProducer: AVLAnimationProducer
  ): GraphicalAVLNode {
    if (root.left === null) {
      animationProducer.doAnimationAndHighlight(18, animationProducer.highlightNode, root);
      return root;
    }

    animationProducer.doAnimationAndHighlight(
      18,
      animationProducer.highlightNodeAndLeftPointer,
      root
    );

    return this.findMinimum(root.left, animationProducer);
  }

  private rebalanceAfterDelete(
    parent: GraphicalAVLNode | null,
    root: GraphicalAVLNode,
    isLeftChild: boolean,
    animationProducer: AVLAnimationProducer
  ): GraphicalAVLNode {
    root.updateHeight();

    if (root.balance > 1 && root.left !== null) {
      animationProducer.doAnimationAndHighlight(26, animationProducer.highlightNode, root);

      if (root.left.balance < 0) {
        animationProducer.doAnimationAndHighlight(27, animationProducer.highlightNode, root.left);
        animationProducer.highlightCode(28);
        rotateLeft(this, root, root.left, true, animationProducer);
      }

      animationProducer.highlightCode(30);

      return rotateRight(this, parent, root, isLeftChild, animationProducer) ?? root;
    }

    if (root.balance < -1 && root.right !== null) {
      animationProducer.doAnimationAndHighlight(31, animationProducer.highlightNode, root);

      if (root.right.balance > 0) {
        animationProducer.doAnimationAndHighlight(32, animationProducer.highlightNode, root.right);
        animationProducer.highlightCode(33);
        rotateRight(this, root, root.right, false, animationProducer);
      }

      animationProducer.highlightCode(35);

      return rotateLeft(this, parent, root, isLeftChild, animationProducer) ?? root;
    }

    animationProducer.doAnimationAndHighlight(
      37,
      animationProducer.unhighlightNodeAndPointers,
      root
    );

    return root;
  }

  public inorderTraversal(): BSTTraverseAnimationProducer {
    return GraphicalTreeTraversal.inorderTraversal(this.root);
  }

  public preorderTraversal(): BSTTraverseAnimationProducer {
    return GraphicalTreeTraversal.preorderTraversal(this.root);
  }

  public postorderTraversal(): BSTTraverseAnimationProducer {
    return GraphicalTreeTraversal.postorderTraversal(this.root);
  }

  public get documentation() {
    return GraphicalAVL.documentation;
  }

  public generate(): void {
    this.root = GraphicalTreeGenerate.generate(GraphicalAVLNode.from);
    GraphicalAVL.updateHeight(this.root);
  }

  private static updateHeight(root: GraphicalAVLNode | null) {
    if (root == null) {
      return;
    }
    GraphicalAVL.updateHeight(root.left);
    GraphicalAVL.updateHeight(root.right);
    root.updateHeight();
  }

  public get data(): number[] {
    const data: number[] = [];

    this.saveInPreOrder(this.root, data);

    return data;
  }

  private saveInPreOrder(node: GraphicalAVLNode | null, data: number[]) {
    if (node == null) return;

    data.push(node.value);

    this.saveInPreOrder(node.left, data);

    this.saveInPreOrder(node.right, data);
  }

  public load(data: number[]): void {
    this.root = GraphicalTreeGenerate.loadTree<GraphicalAVLNode>(GraphicalAVLNode.from, data, true);
    GraphicalAVL.updateHeight(this.root);
  }

  private static exists(root: GraphicalAVLNode | null, value: number): boolean {
    if (root === null) {
      return false;
    }
    if (value < root.value) {
      return this.exists(root.left, value);
    }
    if (value > root.value) {
      return this.exists(root.right, value);
    }
    return true;
  }
}

export default GraphicalAVL;
