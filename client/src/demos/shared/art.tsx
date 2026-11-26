import type { CSSProperties, JSX, SVGProps } from 'react';
import { cx } from './parts';

/*
 * A small drawing for each structure that plays a few frames of what the
 * structure does. It has no state of its own: whatever holds it turns it on
 * with `--art-on: 1` (see `.sx-art-host` in base.css), and it eases back when
 * that goes away. Colours and line weight come from `--art-*`.
 */

type ArtProps = Omit<SVGProps<SVGSVGElement>, 'id'>;

const after = (ms: number): CSSProperties => ({ transitionDelay: `${ms}ms` });

const Frame = ({ className, children, ...props }: ArtProps) => (
  <svg viewBox="0 0 120 80" aria-hidden="true" className={cx('sx-art', className)} {...props}>
    {children}
  </svg>
);

interface NodeProps {
  x: number;
  y: number;
  r?: number;
  /** Fills with the accent colour while the drawing is on, after this many milliseconds. */
  lit?: number;
  className?: string;
  style?: CSSProperties;
}

const Node = ({ x, y, r = 8, lit, className, style }: NodeProps) => (
  <g className={className} style={style}>
    <rect className="sx-art-node" x={x - r} y={y - r} width={r * 2} height={r * 2} rx={r} />
    {lit === undefined ? null : (
      <rect
        className="sx-art-node sx-art-lit"
        x={x - r}
        y={y - r}
        width={r * 2}
        height={r * 2}
        rx={r}
        style={after(lit)}
      />
    )}
  </g>
);

/** A node is appended to the end of the list. */
const ListArt = (props: ArtProps) => (
  <Frame {...props}>
    <g className="sx-art-shift" style={{ '--dx': -15 } as CSSProperties}>
      <path d="M36 40h14m-4-4 4 4-4 4M70 40h14m-4-4 4 4-4 4" />
      <Node x={26} y={40} r={9} />
      <Node x={60} y={40} r={9} />
      <Node x={94} y={40} r={9} />
    </g>
    <path className="sx-art-appear" d="M89 40h10m-4-4 4 4-4 4" style={after(160)} />
    <Node x={109} y={40} r={9} lit={160} className="sx-art-pop" style={after(160)} />
  </Frame>
);

/** A search walks one path down from the root. */
const TreeArt = (props: ArtProps) => (
  <Frame {...props}>
    <path d="M60 14 34 38M60 14l26 24M34 38 20 64M34 38l14 26M86 38l14 26" />
    <path className="sx-art-trace" d="M60 14 34 38l14 26" pathLength={1} />
    <Node x={60} y={14} lit={0} />
    <Node x={34} y={38} lit={180} />
    <Node x={86} y={38} />
    <Node x={20} y={64} r={7} />
    <Node x={48} y={64} r={7} lit={360} />
    <Node x={100} y={64} r={7} />
  </Frame>
);

/** A right-heavy tree rotates left and comes out balanced. */
const BalancedArt = (props: ArtProps) => (
  <Frame {...props}>
    <path d="M50 12 28 32M28 32 14 52M50 12l22 20M72 32l18 18" />
    <path className="sx-art-vanish" d="m90 50 16 18" />
    <path className="sx-art-appear" d="M72 32 56 52" style={after(220)} />
    <Node x={50} y={12} />
    <Node x={28} y={32} />
    <Node x={14} y={52} r={7} />
    <Node
      x={72}
      y={32}
      lit={0}
      className="sx-art-shift"
      style={{ '--dx': -16, '--dy': 20 } as CSSProperties}
    />
    <Node
      x={90}
      y={50}
      lit={0}
      className="sx-art-shift"
      style={{ '--dx': -18, '--dy': -18 } as CSSProperties}
    />
    <Node
      x={106}
      y={68}
      lit={0}
      className="sx-art-shift"
      style={{ '--dx': -16, '--dy': -18 } as CSSProperties}
    />
  </Frame>
);

const bars = [
  { height: 36, to: 2 },
  { height: 20, to: 0 },
  { height: 52, to: 4 },
  { height: 28, to: 1 },
  { height: 44, to: 3 },
];

/** Bars slide into order, shortest first. */
const SortArt = (props: ArtProps) => (
  <Frame {...props}>
    {bars.map(({ height, to }, index) => (
      <g
        key={height}
        className="sx-art-shift"
        style={{ '--dx': (to - index) * 20, ...after(to * 60) } as CSSProperties}
      >
        <rect
          className="sx-art-node sx-art-bar"
          x={14 + index * 20}
          y={70 - height}
          width={12}
          height={height}
        />
        <rect
          className="sx-art-node sx-art-bar sx-art-lit"
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

/** The running line moves down the program, and the list it builds grows. */
const DebuggerArt = (props: ArtProps) => (
  <Frame {...props}>
    <rect className="sx-art-node sx-art-window" x={8} y={10} width={104} height={60} rx={6} />
    <path d="M66 10v60" />
    <rect
      className="sx-art-cursor sx-art-shift"
      x={13}
      y={21}
      width={48}
      height={10}
      rx={2}
      style={{ '--dy': 30 } as CSSProperties}
    />
    <path d="M18 26h30M24 36h26M24 46h18M18 56h34" />
    <Node x={80} y={40} r={6} />
    <path className="sx-art-appear" d="M86 40h6m-3-3 3 3-3 3" style={after(260)} />
    <Node x={99} y={40} r={6} lit={260} className="sx-art-pop" style={after(260)} />
  </Frame>
);

const byKey: Record<string, (props: ArtProps) => JSX.Element> = {
  'linked-lists': ListArt,
  'binary-search-trees': TreeArt,
  'avl-trees': BalancedArt,
  'sorting-algorithms': SortArt,
  debugger: DebuggerArt,
};

/** `id` is a topic's slug, or `debugger`. */
export const StructureArt = ({ id, ...props }: ArtProps & { id: string }) => {
  const Art = byKey[id] ?? ListArt;
  return <Art {...props} data-art={id} />;
};
