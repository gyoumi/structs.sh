import cards from './DailyCards.module.css';
import styles from './TargetTree.module.css';

type TreeNode = { value: number; left: TreeNode | null; right: TreeNode | null };

type PlacedNode = { value: number; x: number; y: number };

type Edge = { from: PlacedNode; to: PlacedNode };

const insert = (node: TreeNode | null, value: number): TreeNode => {
  if (node === null) return { value, left: null, right: null };
  if (value < node.value) return { ...node, left: insert(node.left, value) };
  if (value > node.value) return { ...node, right: insert(node.right, value) };
  return node;
};

const RADIUS = 14;
const STEP_Y = 46;
const MARGIN_Y = RADIUS + 3;
const CHAR_WIDTH = 8;

/** Lays the tree out with x in inorder position and y by depth, sizing pill widths for the longest key label. */
const layout = (preorder: number[]) => {
  const root = preorder.reduce<TreeNode | null>((tree, value) => insert(tree, value), null);
  const maxChars = preorder.reduce((max, value) => Math.max(max, String(value).length), 2);
  const nodeWidth = maxChars <= 2 ? RADIUS * 2 : maxChars * CHAR_WIDTH + 14;
  const stepX = Math.max(34, nodeWidth + 8);
  const marginX = nodeWidth / 2 + 4;
  const nodes: PlacedNode[] = [];
  const edges: Edge[] = [];
  const place = (node: TreeNode | null, depth: number): PlacedNode | null => {
    if (node === null) return null;
    const left = place(node.left, depth + 1);
    const placed = {
      value: node.value,
      x: marginX + nodes.length * stepX,
      y: MARGIN_Y + depth * STEP_Y,
    };
    nodes.push(placed);
    const right = place(node.right, depth + 1);
    [left, right].forEach((child) => child && edges.push({ from: placed, to: child }));
    return placed;
  };
  place(root, 0);
  const width = marginX * 2 + Math.max(0, nodes.length - 1) * stepX;
  const height = MARGIN_Y * 2 + Math.max(0, ...nodes.map((node) => node.y - MARGIN_Y));
  return { nodes, edges, width, height, nodeWidth };
};

/** The tree a forced-order puzzle asks the player to build, drawn as the BST visualiser draws it, with its preorder. */
export const TargetTree = ({ preorder }: { preorder: number[] }) => {
  const { nodes, edges, width, height, nodeWidth } = layout(preorder);
  return (
    <figure aria-label="Target tree" className={`${cards.card} ${styles.figure}`}>
      <h2 className={cards.cardTitle}>Target tree</h2>
      <svg
        className={styles.drawing}
        viewBox={`0 0 ${width} ${height}`}
        style={{ maxWidth: `${width * 1.4}px` }}
        aria-hidden="true"
      >
        {edges.map(({ from, to }) => (
          <line
            key={`${from.value}-${to.value}`}
            className={styles.edge}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
          />
        ))}
        {nodes.map((node) => (
          <g key={node.value}>
            <rect
              className={styles.node}
              x={node.x - nodeWidth / 2}
              y={node.y - RADIUS}
              width={nodeWidth}
              height={RADIUS * 2}
              rx={RADIUS}
              ry={RADIUS}
            />
            <text className={styles.label} x={node.x} y={node.y}>
              {node.value}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className={styles.caption}>Preorder: {preorder.join(', ')}</figcaption>
    </figure>
  );
};
