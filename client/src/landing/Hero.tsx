import { Fragment } from 'react';
import { useTheme } from '@/ui/theme';
import { DEVSOC, DevsocChar, DevsocGlyph, devsocInk } from './devsoc';
import { progress, useTimeline } from './useTimeline';
import styles from './Hero.module.css';

const R = 19;
const X0 = 34;
const DX = 68;
const Y = 58;
const DROP = 68;

/** When each of the four statements starts running. */
const STEP_AT = [0, 1100, 2200, 3300];
const RISE_AT = 4400;
const RISE_MS = 500;
const DURATION = RISE_AT + RISE_MS + 400;

const KEYWORDS = new Set(['void', 'struct', 'char']);

const CODE = [
  { text: 'void insert_after(struct node *curr, char c) {', indent: 0 },
  { text: 'struct node *new_node = make_node(c);', indent: 1 },
  { text: 'new_node->next = curr->next;', indent: 1 },
  { text: 'curr->next = new_node;', indent: 1 },
  { text: '}', indent: 0 },
];

interface Point {
  x: number;
  y: number;
}

/** A pointer between two nodes' rims, drawn `grow` of the way along. */
const Arrow = ({
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
  const sx = from.x + ux * (R + 3);
  const sy = from.y + uy * (R + 3);
  const length = Math.hypot(to.x - from.x, to.y - from.y) - (R + 3) - (R + 5);
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

const Node = ({
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
  return (
    <g transform={`translate(${at.x} ${at.y})`} opacity={opacity}>
      <circle r={R} className={styles.node} data-lit={lit || undefined} />
      <DevsocGlyph char={char} scale={19 / 44} fill={devsocInk(char, theme)} />
    </g>
  );
};

const Line = ({ text }: { text: string }) => (
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

/** An editor running `insert_after`, which links a new `v` node in to complete DevSoc's `<dev/>`. */
const Hero = () => {
  const { ref, time, replay } = useTimeline(DURATION);
  const step = STEP_AT.filter((at) => time >= at).length - 1;
  const rise = progress(time, RISE_AT, RISE_MS);
  const done = time >= RISE_AT;
  const labels = 1 - rise;

  const slot = (index: number): Point => ({ x: X0 + index * DX, y: Y });
  const at: Record<DevsocChar, Point> = {
    '<': slot(0),
    d: slot(1),
    e: slot(2),
    v: { x: slot(3).x, y: Y + DROP * (1 - rise) },
    '/': slot(4),
    '>': slot(5),
  };
  const born = progress(time, STEP_AT[1], 300);
  const curr = progress(time, 150, 250) * labels;

  return (
    <div ref={ref} className={styles.wrap} onPointerEnter={replay}>
      <div
        className={styles.editor}
        role="img"
        aria-label="An editor running insert_after, which links a new node into a list to complete DevSoc's <dev/> logo"
      >
        <div className={styles.editorBar}>
          <i />
          <i />
          <i />
          <span className={styles.editorTitle}>insert_after(curr, &apos;v&apos;)</span>
          <span className={styles.editorStatus}>{done ? 'done' : `step ${step + 1} of 4`}</span>
        </div>
        <svg className={styles.stage} viewBox="0 0 410 172">
          <Arrow from={at['<']} to={at.d} />
          <Arrow from={at.d} to={at.e} />
          <Arrow from={at.e} to={at['/']} opacity={1 - progress(time, STEP_AT[3], 300)} />
          <Arrow from={at.e} to={at.v} grow={progress(time, STEP_AT[3] + 150, 400)} />
          <Arrow from={at.v} to={at['/']} grow={progress(time, STEP_AT[2], 400)} />
          <Arrow from={at['/']} to={at['>']} />
          {DEVSOC.filter((char) => char !== 'v').map((char) => (
            <Node key={char} char={char} at={at[char]} lit={char === 'e' && curr > 0.5} />
          ))}
          {born > 0 && <Node char="v" at={at.v} lit={!done} opacity={born} />}
          <text x={at.e.x} y={Y + 40} className={styles.label} opacity={curr}>
            curr
          </text>
          <text x={at.v.x} y={at.v.y + 34} className={styles.label} opacity={born * labels}>
            new_node
          </text>
        </svg>
        <ol className={styles.listing}>
          {CODE.map((row, index) => (
            <li key={row.text} data-active={index === step || undefined}>
              <Line text={'  '.repeat(row.indent) + row.text} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

export default Hero;
