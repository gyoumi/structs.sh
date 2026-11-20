import { Addr } from '../../../Types/backendType';
import { LinkedListNode } from './linkedListHeap';
import { UnionFind } from './util/unionFind';

export type Position = { x: number; y: number };

const LINKED_LIST_GAP = 200;

function convertToRootedTree(
  linkedList: LinkedListNode[]
): [LinkedListNode, Map<Addr, LinkedListNode[]>] {
  let root: LinkedListNode = null!;
  const prevNodeMap: Map<Addr, LinkedListNode[]> = new Map();
  linkedList.forEach((node) => {
    if (node.next !== '0x0') {
      if (!prevNodeMap.has(node.next)) {
        prevNodeMap.set(node.next, []);
      }
      prevNodeMap.get(node.next)!.push(node);
    } else {
      root = node;
    }
  });

  linkedList.forEach((node) => {
    if (node.next === '0x0') {
      // @ts-ignore
      node.next = null;
    }
  });

  const stack: LinkedListNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (prevNodeMap.has(node.uid)) {
      const prevNodes = prevNodeMap.get(node.uid)!;
      prevNodes.forEach((prevNode) => {
        prevNode.next = node.uid; // Point the previous nodes to the current node
        stack.push(prevNode);
      });
    }
  }

  return [root, prevNodeMap];
}

// Recursion algorithm
function assignPositionsRecursion(
  currNode: LinkedListNode,
  prevNodeMap: Map<Addr, LinkedListNode[]>,
  posCache: Map<Addr, Position>,
  x: number,
  yRange: [number, number]
): Position {
  const prevNodes = prevNodeMap.get(currNode.uid);
  // Base case: The currNode is the last node
  if (!prevNodes) {
    const currNodePosition = { x, y: (yRange[0] + 100) / 2 };
    posCache.set(currNode.uid, currNodePosition);
    return currNodePosition;
  }

  // Recursive case
  const yRangePerNode = (yRange[1] - yRange[0]) / prevNodes.length;
  let currY = yRange[0];
  const positions: Position[] = [];
  prevNodes.forEach((prevNode) => {
    positions.push(
      assignPositionsRecursion(prevNode, prevNodeMap, posCache, x - LINKED_LIST_GAP, [
        currY,
        currY + yRangePerNode,
      ])
    );
    currY += yRangePerNode;
  });

  // Choose the middle y value
  const y = positions.reduce((a, b) => a + b.y, 0) / positions.length;
  const currNodePosition = { x, y };
  posCache.set(currNode.uid, currNodePosition);
  return currNodePosition;
}

// TODO: Rewrite
function assignPositions(
  currNode: LinkedListNode,
  prevNodeMap: Map<Addr, LinkedListNode[]>,
  horizontalDepth: number,
  initialYRange: [number, number]
): Map<Addr, Position> {
  const posCache: Map<Addr, Position> = new Map();
  assignPositionsRecursion(
    currNode,
    prevNodeMap,
    posCache,
    horizontalDepth * LINKED_LIST_GAP,
    initialYRange
  );
  return posCache;
}

function findMaxDepth(
  cacheLinkedListNode: Map<Addr, LinkedListNode[]>,
  linkedList: LinkedListNode[]
): number {
  // Reverase cache linkedList as we want trakck back
  const cacheLinkedListNodeReverse: Map<Addr, LinkedListNode[]> = new Map();
  cacheLinkedListNode.forEach((nodes) => {
    nodes.forEach((node) => {
      if (!cacheLinkedListNodeReverse.has(node.uid)) {
        cacheLinkedListNodeReverse.set(node.uid, []);
      }
      cacheLinkedListNodeReverse.get(node.uid)!.push(node);
    });
  });

  // Utility function for DFS traversal
  function dfs(node: LinkedListNode | null, visited: Set<Addr>): number {
    if (!node) return 0; // base case: end of linked list
    if (visited.has(node.uid)) return 0; // loop detected, end traversal

    visited.add(node.uid);

    const nextNodes = cacheLinkedListNodeReverse.get(node.next);
    if (!nextNodes) return 1;

    let maxDepth = 0;
    nextNodes.forEach((nextNode: LinkedListNode) => {
      maxDepth = Math.max(maxDepth, dfs(nextNode, new Set(visited)));
    });
    return 1 + maxDepth;
  }

  let maximumDepth = 0;
  linkedList.forEach((node) => {
    maximumDepth = Math.max(maximumDepth, dfs(node, new Set()));
  });
  return maximumDepth + 1;
}

/** The nodes joined by next pointers (or a shared target), one group per list. */
function groupLinkedLists(
  linkedList: LinkedListNode[],
  nodesByUid: Map<Addr, LinkedListNode>
): LinkedListNode[][] {
  const unionNodes = new Set<string>();
  linkedList.forEach((node) => {
    unionNodes.add(node.uid);
    if (node.next !== '0x0') {
      unionNodes.add(node.next);
    }
  });
  const unionFind = new UnionFind(unionNodes);

  // Combine
  linkedList.forEach((node) => {
    if (node.next !== '0x0') {
      unionFind.union(node.uid, node.next);
    }
  });

  const groups: LinkedListNode[][] = [];
  unionFind.getGroups().forEach((group) => {
    const linkedListGroupNodes: LinkedListNode[] = [];
    group.forEach((uid) => {
      const node = nodesByUid.get(uid as Addr);
      if (node) linkedListGroupNodes.push(node);
    });
    groups.push(linkedListGroupNodes);
  });
  return groups;
}

/**
 * Where each node is drawn, each group in its own band. Also turns each NULL
 * next pointer ('0x0') into null.
 */
export function layOutLinkedLists(
  linkedList: LinkedListNode[],
  nodesByUid: Map<Addr, LinkedListNode>
): Map<Addr, Position> {
  const nodesPosition: Map<Addr, Position> = new Map();
  let idx = 0;

  groupLinkedLists(linkedList, nodesByUid).forEach((linkedListGroupNodes) => {
    if (linkedListGroupNodes.length === 0) {
      return;
    }

    const [rootedTree, prevNodeMap] = convertToRootedTree(linkedListGroupNodes);
    const maxDepth = findMaxDepth(prevNodeMap, linkedListGroupNodes);
    const positions = assignPositions(rootedTree, prevNodeMap, maxDepth, [
      600 * idx,
      900 + 600 * idx,
    ]);

    positions.forEach((pos, uid) => {
      nodesPosition.set(uid, pos);
    });

    idx += 1;
  });

  return nodesPosition;
}
