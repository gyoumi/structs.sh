import { lineDiffY, canvasPadding } from '../../common/settings';
import GraphicalBSTNode from '../data-structure/GraphicalBSTNode';

const NODE_STEP_X = 64;

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
