import { describe, expect, it } from 'vitest';
import { actualNodeDiameter } from '@/visualiser-src/common/constants';
import type GraphicalBSTNode from '../data-structure/GraphicalBSTNode';
import updateNodePositions from './helpers';

type StubNode = {
  value: number;
  x: number;
  y: number;
  left: StubNode | null;
  right: StubNode | null;
};

const insert = (root: StubNode | null, value: number): StubNode => {
  if (root === null) return { value, x: 0, y: 0, left: null, right: null };
  if (value < root.value) root.left = insert(root.left, value);
  else if (value > root.value) root.right = insert(root.right, value);
  return root;
};

const collect = (node: StubNode | null, out: StubNode[] = []): StubNode[] => {
  if (node === null) return out;
  collect(node.left, out);
  out.push(node);
  collect(node.right, out);
  return out;
};

describe('updateNodePositions', () => {
  it('never overlaps any pair of nodes in deep 14-key BSTs', () => {
    const keys = [3, 2, 13, 6, 14, 1, 8, 9, 11, 12, 10, 7, 4, 5];
    const root = keys.reduce<StubNode | null>((tree, value) => insert(tree, value), null);
    updateNodePositions(root as unknown as GraphicalBSTNode);

    const nodes = collect(root);
    for (let i = 1; i < nodes.length; i += 1) {
      expect(
        nodes[i].x - nodes[i - 1].x,
        `inorder neighbours ${nodes[i - 1].value} and ${nodes[i].value} must clear the ${actualNodeDiameter}px diameter`
      ).toBeGreaterThanOrEqual(actualNodeDiameter);
    }
  });
});
