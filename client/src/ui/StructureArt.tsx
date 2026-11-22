import { CSSProperties, JSX, ReactNode } from 'react';
import styles from './StructureArt.module.css';

/*
 * A small line drawing for each structure that plays a few frames of what it does.
 * It has no state of its own: an ancestor with `artHostClass` switches it on when
 * hovered, focused, checked or marked `data-active`, and it eases back when that ends.
 */

export const artHostClass = styles.host;

const after = (ms: number): CSSProperties => ({ transitionDelay: `${ms}ms` });

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

interface ArtProps {
  className?: string;
}

const Frame = ({ className, children }: ArtProps & { children: ReactNode }) => (
  <svg viewBox="0 0 120 80" aria-hidden="true" className={cx(styles.art, className)}>
    {children}
  </svg>
);

interface NodeProps {
  x: number;
  y: number;
  r?: number;
  highlightDelay?: number;
  className?: string;
  style?: CSSProperties;
}

const Node = ({ x, y, r = 8, highlightDelay, className, style }: NodeProps) => (
  <g className={className} style={style}>
    <rect
      className={cx(styles.node, styles.round)}
      x={x - r}
      y={y - r}
      width={r * 2}
      height={r * 2}
      rx={3}
    />
    {highlightDelay !== undefined && (
      <rect
        className={cx(styles.node, styles.round, styles.lit)}
        x={x - r}
        y={y - r}
        width={r * 2}
        height={r * 2}
        rx={3}
        style={after(highlightDelay)}
      />
    )}
  </g>
);

const shift = (dx: number, dy = 0, ms = 0) =>
  ({ '--dx': dx, '--dy': dy, ...after(ms) }) as CSSProperties;

const ListArt = ({ className }: ArtProps) => (
  <Frame className={className}>
    <g className={styles.shift} style={shift(-15)}>
      <path d="M36 40h14m-4-4 4 4-4 4M70 40h14m-4-4 4 4-4 4" />
      <Node x={26} y={40} r={9} />
      <Node x={60} y={40} r={9} />
      <Node x={94} y={40} r={9} />
    </g>
    <path className={styles.appear} d="M89 40h10m-4-4 4 4-4 4" style={after(160)} />
    <Node x={109} y={40} r={9} highlightDelay={160} className={styles.pop} style={after(160)} />
  </Frame>
);

const TreeArt = ({ className }: ArtProps) => (
  <Frame className={className}>
    <path d="M60 14 34 38M60 14l26 24M34 38 20 64M34 38l14 26M86 38l14 26" />
    <path className={styles.trace} d="M60 14 34 38l14 26" pathLength={1} />
    <Node x={60} y={14} highlightDelay={0} />
    <Node x={34} y={38} highlightDelay={180} />
    <Node x={86} y={38} />
    <Node x={20} y={64} r={7} />
    <Node x={48} y={64} r={7} highlightDelay={360} />
    <Node x={100} y={64} r={7} />
  </Frame>
);

const AvlTreeArt = ({ className }: ArtProps) => (
  <Frame className={className}>
    <path d="M56 18 32 42M56 18l24 24M32 42 20 66M32 42l12 24M80 42l12 24" />
    <path d="M69.2 13.2A14 14 0 0 0 42.8 13.2M47 10.4l-4.2 2.8-1.4-4.8" />
    <path className={styles.trace} d="M69.2 13.2A14 14 0 0 0 42.8 13.2" pathLength={1} />
    <Node x={56} y={18} highlightDelay={0} />
    <Node x={32} y={42} />
    <Node x={80} y={42} highlightDelay={160} />
    <Node x={20} y={66} r={7} />
    <Node x={44} y={66} r={7} />
    <Node x={92} y={66} r={7} highlightDelay={320} />
  </Frame>
);

const bars = [
  { height: 36, to: 2 },
  { height: 20, to: 0 },
  { height: 52, to: 4 },
  { height: 28, to: 1 },
  { height: 44, to: 3 },
];

const SortArt = ({ className }: ArtProps) => (
  <Frame className={className}>
    {bars.map(({ height, to }, index) => (
      <g key={height} className={styles.shift} style={shift((to - index) * 20, 0, to * 60)}>
        <rect
          className={styles.node}
          x={14 + index * 20}
          y={70 - height}
          width={12}
          height={height}
        />
        <rect
          className={cx(styles.node, styles.round, styles.lit)}
          x={14 + index * 20}
          y={70 - height}
          width={12}
          height={height}
          style={after(to * 60 + 240)}
        />
      </g>
    ))}
  </Frame>
);

const DebuggerArt = ({ className }: ArtProps) => (
  <Frame className={className}>
    <rect className={styles.node} x={8} y={10} width={104} height={60} rx={6} />
    <path d="M66 10v60" />
    <rect
      className={cx(styles.cursor, styles.shift)}
      x={13}
      y={21}
      width={48}
      height={10}
      rx={2}
      style={shift(0, 30)}
    />
    <path d="M18 26h30M24 36h26M24 46h18M18 56h34" />
    <Node x={80} y={40} r={6} />
    <path className={styles.appear} d="M86 40h6m-3-3 3 3-3 3" style={after(260)} />
    <Node x={99} y={40} r={6} highlightDelay={260} className={styles.pop} style={after(260)} />
  </Frame>
);

const artById: Record<string, (props: ArtProps) => JSX.Element> = {
  'linked-lists': ListArt,
  'binary-search-trees': TreeArt,
  'avl-trees': AvlTreeArt,
  'sorting-algorithms': SortArt,
  debugger: DebuggerArt,
};

/** `id` is a topic's slug, or `debugger`. */
const StructureArt = ({ id, className }: ArtProps & { id: string }) => {
  const Art = artById[id] ?? ListArt;
  return <Art className={className} />;
};

export default StructureArt;
