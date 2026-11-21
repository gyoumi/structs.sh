import type { Page } from '@playwright/test';
import { readDrawing, type DrawnNode } from './drawing';

/** A tree node rebuilt from the drawing. */
export interface TreeNode {
  value: number;
  left?: TreeNode;
  right?: TreeNode;
}

/** Rebuilds a tree from nodes sorted left to right: each slice's highest node is its root. */
const build = (nodes: DrawnNode[]): TreeNode | undefined => {
  if (nodes.length === 0) return undefined;
  const top = nodes.reduce((highest, node) => (node.y < highest.y ? node : highest));
  const at = nodes.indexOf(top);
  return { value: top.value, left: build(nodes.slice(0, at)), right: build(nodes.slice(at + 1)) };
};

/** The tree in the drawing, rebuilt from where each value is drawn. */
export const readTree = async (page: Page): Promise<TreeNode | undefined> =>
  build((await readDrawing(page)).sort((a, b) => a.x - b.x));

/** Writes a tree as value(left, right), e.g. "50(30(20, 40), 70)"; a leaf is just its value. */
export const describeTree = (node?: TreeNode): string => {
  if (!node) return '';
  if (!node.left && !node.right) return String(node.value);
  return `${node.value}(${describeTree(node.left)}, ${describeTree(node.right)})`;
};

const height = (node?: TreeNode): number => (node ? 1 + Math.max(height(node.left), height(node.right)) : 0);

/** The values whose left and right subtrees differ in height by more than 1. */
export const unbalancedValues = (node?: TreeNode): number[] => {
  if (!node) return [];
  const here = Math.abs(height(node.left) - height(node.right)) > 1 ? [node.value] : [];
  return [...here, ...unbalancedValues(node.left), ...unbalancedValues(node.right)];
};
