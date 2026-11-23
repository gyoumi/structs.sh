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

const updateNodePositions = (root: GraphicalBSTNode | null): void => {
  const canvasWidth = document.getElementById(getCanvasTarget().container)?.offsetWidth;
  const low: number = 0;
  const high: number = Number(canvasWidth);
  const mid: number = (low + high) / 2;
  updateNodePositionsRecursive(root, low, high, mid, canvasPadding);
};

export default updateNodePositions;
