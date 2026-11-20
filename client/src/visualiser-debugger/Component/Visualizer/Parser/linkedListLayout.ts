import { Addr } from '../../../Types/backendType';
import { LinkedListNode } from './linkedListHeap';
import { UnionFind } from './util/unionFind';

export type Position = { x: number; y: number };

const LINKED_LIST_GAP = 200;

function buildRootedTree(
  linkedList: LinkedListNode[]
): [LinkedListNode, Map<Addr, LinkedListNode[]>] {
  const root = linkedList.findLast((node) => node.next === '0x0');
  if (!root) throw new Error('This list has no node with a NULL next, so it has no end');

  const prevNodeMap: Map<Addr, LinkedListNode[]> = new Map();
  linkedList.forEach((node) => {
    if (node.next === '0x0') return;
    if (!prevNodeMap.has(node.next)) {
      prevNodeMap.set(node.next, []);
    }
    prevNodeMap.get(node.next)!.push(node);
  });

  return [root, prevNodeMap];
}

function assignPositionsRecursion(
  currNode: LinkedListNode,
  prevNodeMap: Map<Addr, LinkedListNode[]>,
  posCache: Map<Addr, Position>,
  x: number,
  yRange: [number, number]
): Position {
  const prevNodes = prevNodeMap.get(currNode.uid);
  if (!prevNodes) {
    const currNodePosition = { x, y: (yRange[0] + 100) / 2 };
    posCache.set(currNode.uid, currNodePosition);
    return currNodePosition;
  }

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

  const y = positions.reduce((a, b) => a + b.y, 0) / positions.length;
  const currNodePosition = { x, y };
  posCache.set(currNode.uid, currNodePosition);
  return currNodePosition;
}

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

function findMaxDepth(linkedList: LinkedListNode[]): number {
  const nodesWithNextByUid: Map<Addr, LinkedListNode> = new Map();
  linkedList.forEach((node) => {
    if (node.next !== '0x0') nodesWithNextByUid.set(node.uid, node);
  });

  function dfs(node: LinkedListNode, visited: Set<Addr>): number {
    if (visited.has(node.uid)) return 0;

    visited.add(node.uid);

    const nextNode = nodesWithNextByUid.get(node.next);
    if (!nextNode) return 1;

    return 1 + dfs(nextNode, visited);
  }

  let maximumDepth = 0;
  linkedList.forEach((node) => {
    maximumDepth = Math.max(maximumDepth, dfs(node, new Set()));
  });
  return maximumDepth + 1;
}

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

/** Where each node is drawn, each group in its own band. */
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

    const [rootedTree, prevNodeMap] = buildRootedTree(linkedListGroupNodes);
    const maxDepth = findMaxDepth(linkedListGroupNodes);
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
