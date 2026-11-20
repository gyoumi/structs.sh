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
  const unitX = Math.cos(angle);
  const unitY = Math.sin(angle);
  const startX = from.x + unitX * (NODE_RADIUS + 3);
  const startY = from.y + unitY * (NODE_RADIUS + 3);
  const length = Math.hypot(to.x - from.x, to.y - from.y) - (NODE_RADIUS + 3) - (NODE_RADIUS + 5);
  const endX = startX + unitX * length * grow;
  const endY = startY + unitY * length * grow;
  const headX = endX - unitX * 7;
  const headY = endY - unitY * 7;
  const wingX = -unitY * 4.5;
  const wingY = unitX * 4.5;
  return (
    <g className={styles.arrow} opacity={opacity}>
      <line x1={startX} y1={startY} x2={headX} y2={headY} />
      <polygon
        points={`${endX},${endY} ${headX + wingX},${headY + wingY} ${headX - wingX},${headY - wingY}`}
      />
    </g>
  );
};

export const Node = ({
  char,
  position,
  lit,
  opacity = 1,
}: {
  char: DevsocChar;
  position: Point;
  lit: boolean;
  opacity?: number;
}) => {
  const theme = useTheme();
  if (opacity <= 0) return null;
  return (
    <g transform={`translate(${position.x} ${position.y})`} opacity={opacity}>
      <circle r={NODE_RADIUS} className={styles.node} data-lit={lit || undefined} />
      <DevsocGlyph char={char} scale={19 / 44} fill={devsocInk(char, theme)} />
    </g>
  );
};

export const Label = ({
  position,
  opacity,
  below = 40,
  children,
}: {
  position: Point;
  opacity: number;
  below?: number;
  children: string;
}) => (
  <text x={position.x} y={position.y + below} className={styles.label} opacity={opacity}>
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
