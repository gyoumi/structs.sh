import { lineDiffY, canvasPadding } from '../../common/settings';
import GraphicalBSTNode from '../data-structure/GraphicalBSTNode';
import { getCanvasTarget } from '../../common/canvasTarget';

// Updates node positions of a tree
const updateNodePositionsRecursive = (
  node: GraphicalBSTNode | null,
  low: number,
  high: number,
  mid: number,
  y: number
) => {
  if (node === null) {
    return;
  }

  node.x = mid;
  node.y = y;

  updateNodePositionsRecursive(node.left, low, mid, (low + mid) / 2, y + lineDiffY);
  updateNodePositionsRecursive(node.right, mid, high, (mid + high) / 2, y + lineDiffY);
};

const MIN_TREE_CANVAS_WIDTH = 1800;

/** Width used for tree level subdivision, floored so narrow dual stages never overlap deep nodes. */
export const treeCanvasWidth = (): number => {
  const width = document.getElementById(getCanvasTarget().container)?.offsetWidth ?? 0;
  return Math.max(MIN_TREE_CANVAS_WIDTH, width);
};

const updateNodePositions = (root: GraphicalBSTNode | null): void => {
  const low: number = 0;
  const high: number = treeCanvasWidth();
  const mid: number = (low + high) / 2;
  updateNodePositionsRecursive(root, low, high, mid, canvasPadding);
};

export default updateNodePositions;
