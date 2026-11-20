import { Fragment } from 'react';
import { useTheme } from '@/ui/theme';
import { DevsocChar, DevsocGlyph, devsocInk } from './devsoc';
import styles from './Hero.module.css';

const NODE_RADIUS = 19;
export const FIRST_NODE_X = 34;
export const NODE_SPACING = 68;
export const ROW_Y = 58;
export const DROP_DISTANCE = 68;

const KEYWORDS = new Set(['void', 'struct', 'char', 'while', 'return']);

export interface Point {
  x: number;
  y: number;
}

export const slot = (index: number): Point => ({
  x: FIRST_NODE_X + index * NODE_SPACING,
  y: ROW_Y,
});

export const Arrow = ({
  from,
  to,
  grow = 1,
  opacity = 1,
}: {
  from: Point;
  to: Point;
  grow?: number;
  opacity?: number;
}) => {
  if (grow <= 0 || opacity <= 0) return null;
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const sx = from.x + ux * (NODE_RADIUS + 3);
  const sy = from.y + uy * (NODE_RADIUS + 3);
  const length = Math.hypot(to.x - from.x, to.y - from.y) - (NODE_RADIUS + 3) - (NODE_RADIUS + 5);
  const ex = sx + ux * length * grow;
  const ey = sy + uy * length * grow;
  const hx = ex - ux * 7;
  const hy = ey - uy * 7;
  const px = -uy * 4.5;
  const py = ux * 4.5;
  return (
    <g className={styles.arrow} opacity={opacity}>
      <line x1={sx} y1={sy} x2={hx} y2={hy} />
      <polygon points={`${ex},${ey} ${hx + px},${hy + py} ${hx - px},${hy - py}`} />
    </g>
  );
};

export const Node = ({
  char,
  at,
  lit,
  opacity = 1,
}: {
  char: DevsocChar;
  at: Point;
  lit: boolean;
  opacity?: number;
}) => {
  const theme = useTheme();
  if (opacity <= 0) return null;
  return (
    <g transform={`translate(${at.x} ${at.y})`} opacity={opacity}>
      <circle r={NODE_RADIUS} className={styles.node} data-lit={lit || undefined} />
      <DevsocGlyph char={char} scale={19 / 44} fill={devsocInk(char, theme)} />
    </g>
  );
};

export const Label = ({
  at,
  opacity,
  below = 40,
  children,
}: {
  at: Point;
  opacity: number;
  below?: number;
  children: string;
}) => (
  <text x={at.x} y={at.y + below} className={styles.label} opacity={opacity}>
    {children}
  </text>
);

export const Line = ({ text }: { text: string }) => (
  <>
    {text.split(/(\w+)/).map((part, i) =>
      KEYWORDS.has(part) ? (
        <span key={i} className={styles.keyword}>
          {part}
        </span>
      ) : (
        <Fragment key={i}>{part}</Fragment>
      )
    )}
  </>
);
