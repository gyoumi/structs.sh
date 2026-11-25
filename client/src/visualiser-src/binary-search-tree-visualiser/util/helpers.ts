import { actualNodeDiameter } from '../../common/constants';
import type { DrawingBounds } from '../../common/AnimationProducer';
import { lineDiffY, canvasPadding } from '../../common/settings';
import GraphicalBSTNode from '../data-structure/GraphicalBSTNode';

const NODE_STEP_X = 64;
const NODE_RADIUS = actualNodeDiameter / 2;

/** Axis-aligned bounds enclosing every node circle in `root` at its current `(x, y)` coordinates. */
export const treeBounds = (root: GraphicalBSTNode | null): DrawingBounds | null => {
  if (root === null) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const walk = (node: GraphicalBSTNode | null) => {
    if (node === null) return;
    minX = Math.min(minX, node.x - NODE_RADIUS);
    minY = Math.min(minY, node.y - NODE_RADIUS);
    maxX = Math.max(maxX, node.x + NODE_RADIUS);
    maxY = Math.max(maxY, node.y + NODE_RADIUS);
    walk(node.left);
    walk(node.right);
  };
  walk(root);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

/** Places every node at its inorder column (`x`) and tree depth (`y`) so nodes never overlap at any depth. */
const updateNodePositions = (root: GraphicalBSTNode | null): void => {
  let column = 0;
  const place = (node: GraphicalBSTNode | null, depth: number) => {
    if (node === null) return;
    place(node.left, depth + 1);
    node.x = canvasPadding + column * NODE_STEP_X;
    node.y = canvasPadding + depth * lineDiffY;
    column += 1;
    place(node.right, depth + 1);
  };
  place(root, 0);
};

export default updateNodePositions;
