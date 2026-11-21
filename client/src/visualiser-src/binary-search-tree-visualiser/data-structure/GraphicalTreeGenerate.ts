import { generateNumbers } from '@/visualiser-src/common/RandomNumGenerator';
import BSTCreateAnimationProducer from '@/visualiser-src/binary-search-tree-visualiser/animation-producer/BSTCreateAnimationProducer';
import updateNodePositions from '@/visualiser-src/binary-search-tree-visualiser/util/helpers';
import GraphicalBSTNode from './GraphicalBSTNode';

export default class GraphicalTreeGenerate {
  // given a sorted array arr, inserts elements to num such that its linear insertion order
  // will lead to a reasonably balanced BST
  private static recurseArrInsert<T extends GraphicalBSTNode>(
    arr: number[],
    start: number,
    end: number,
    createNode: (arg0: number) => T
  ): T | null {
    // the base case is array length <=1
    if (end - start === 0) {
      return null;
    }
    // insert midpoint
    const mid = Math.floor((end + start) / 2);
    const newNode = createNode(arr[mid]);
    // set up for recursion
    // recurse left
    newNode.left = GraphicalTreeGenerate.recurseArrInsert(arr, start, mid, createNode);
    // recurse right
    newNode.right = GraphicalTreeGenerate.recurseArrInsert(arr, mid + 1, end, createNode);
    return newNode;
  }

  private static create<T extends GraphicalBSTNode>(root: T | null): void {
    const producer = new BSTCreateAnimationProducer();
    producer.createTree(root);
  }

  public static generate<T extends GraphicalBSTNode>(createNode: (arg0: number) => T): T | null {
    const num = generateNumbers().sort((a, b) => a - b);
    const root = GraphicalTreeGenerate.recurseArrInsert(num, 0, num.length, createNode);
    updateNodePositions(root);
    GraphicalTreeGenerate.create(root);
    return root;
  }

  // Loads Tree from Data: valid pre-order keeps its shape, anything else is inserted in order
  public static loadTree<T extends GraphicalBSTNode>(
    createNode: (arg0: number) => T,
    data: number[],
    balanced = false
  ): T | null {
    const unique = [...new Set(data)];
    let root = GraphicalTreeGenerate.isPreOrder(data)
      ? GraphicalTreeGenerate.constructTreeUtil(createNode, data, 0, data.length - 1)
      : GraphicalTreeGenerate.insertAll(createNode, unique);
    if (balanced && GraphicalTreeGenerate.balancedHeight(root) === -1) {
      const sorted = unique.sort((a, b) => a - b);
      root = GraphicalTreeGenerate.recurseArrInsert(sorted, 0, sorted.length, createNode);
    }

    updateNodePositions(root);
    GraphicalTreeGenerate.create(root);
    return root;
  }

  private static isPreOrder(data: number[]): boolean {
    const ancestors: number[] = [];
    let lowerBound = -Infinity;
    return data.every((value) => {
      if (value <= lowerBound) return false;
      while (ancestors.length > 0 && ancestors[ancestors.length - 1] <= value) {
        if (ancestors[ancestors.length - 1] === value) return false;
        lowerBound = ancestors.pop()!;
      }
      ancestors.push(value);
      return true;
    });
  }

  private static insertAll<T extends GraphicalBSTNode>(
    createNode: (arg0: number) => T,
    values: number[]
  ): T | null {
    let root: T | null = null;
    values.forEach((value) => {
      const node = createNode(value);
      if (root === null) {
        root = node;
        return;
      }
      let parent: GraphicalBSTNode = root;
      for (;;) {
        const side = value < parent.value ? 'left' : 'right';
        const child = parent[side];
        if (child === null) {
          parent[side] = node;
          return;
        }
        parent = child;
      }
    });
    return root;
  }

  // Height of the tree, or -1 when some node's subtrees differ in height by more than 1
  private static balancedHeight(node: GraphicalBSTNode | null): number {
    if (node === null) return 0;
    const left = GraphicalTreeGenerate.balancedHeight(node.left);
    const right = GraphicalTreeGenerate.balancedHeight(node.right);
    if (left === -1 || right === -1 || Math.abs(left - right) > 1) return -1;
    return Math.max(left, right) + 1;
  }

  // Construct tree from pre order
  public static constructTreeUtil<T extends GraphicalBSTNode>(
    createNode: (arg0: number) => T,
    pre: number[],
    low: number,
    high: number
  ) {
    let preIndex: number = 0;
    function constructTreeRecursive(_pre: number[], _low: number, _high: number) {
      // Base Case
      if (_low > _high) return null;

      // The first node in preorder traversal is root. So take
      // the node at preIndex from pre[] and make it root,
      // and increment preIndex
      const root = createNode(_pre[preIndex]);
      preIndex++;

      // If the current subarray has only one element,
      // no need to recur
      if (_low === _high) return root;
      let rRoot = -1;

      // Search for the first element greater than root
      for (let i = _low; i <= _high; i++) {
        if (_pre[i] > root.value) {
          rRoot = i;
          break;
        }
      }

      // If no elements are greater than the current root,
      // all elements are left children
      // so assign root appropriately
      if (rRoot === -1) rRoot = preIndex + (_high - _low);

      // Use the index of element found in preorder to divide
      // preorder array in two parts. Left subtree and right
      // subtree
      root.left = constructTreeRecursive(_pre, preIndex, rRoot - 1);

      root.right = constructTreeRecursive(_pre, rRoot, _high);

      return root;
    }
    return constructTreeRecursive(pre, low, high);
  }
}
