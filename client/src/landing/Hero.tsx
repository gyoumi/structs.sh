import { Fragment, ReactElement, useState } from 'react';
import { useTheme } from '@/ui/theme';
import { DEVSOC, DevsocChar, DevsocGlyph, devsocInk } from './devsoc';
import { clamp01, progress, useTimeline } from './useTimeline';
import styles from './Hero.module.css';

const R = 19;
const X0 = 34;
const DX = 68;
const Y = 58;
const DROP = 68;
const FADE_MS = 500;
const SETTLE_MS = 400;

const KEYWORDS = new Set(['void', 'struct', 'char', 'while', 'return']);

interface Point {
  x: number;
  y: number;
}

const slot = (index: number): Point => ({ x: X0 + index * DX, y: Y });

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
  if (opacity <= 0) return null;
  return (
    <g transform={`translate(${at.x} ${at.y})`} opacity={opacity}>
      <circle r={R} className={styles.node} data-lit={lit || undefined} />
      <DevsocGlyph char={char} scale={19 / 44} fill={devsocInk(char, theme)} />
    </g>
  );
};

/** A pointer variable's name under the node it points at. Nodes hanging below the list use a smaller gap. */
const Label = ({
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

interface Scene {
  title: string;
  label: string;
  code: { text: string; indent: number }[];
  /** When each step starts, and the line of `code` it runs. */
  steps: { at: number; line: number }[];
  /** When the operation has finished and its labels fade. */
  doneAt: number;
  Stage: (props: { time: number }) => ReactElement;
}

/** Four statements, one every `gap` ms from the start. */
const statements = (gap: number) => [0, 1, 2, 3].map((line) => ({ at: line * gap, line }));

const INSERT_STEPS = statements(1100);
const RISE_AT = 4400;
const RISE_MS = 500;

/** `insert_after` links a new `v` node in, then the list rises into a straight line. */
const InsertStage = ({ time }: { time: number }) => {
  const [, made, linked, spliced] = INSERT_STEPS.map((step) => step.at);
  const rise = progress(time, RISE_AT, RISE_MS);
  const done = time >= RISE_AT;
  const labels = 1 - rise;
  const at: Record<DevsocChar, Point> = {
    '<': slot(0),
    d: slot(1),
    e: slot(2),
    v: { x: slot(3).x, y: Y + DROP * (1 - rise) },
    '/': slot(4),
    '>': slot(5),
  };
  const born = progress(time, made, 300);
  const curr = progress(time, 150, 250) * labels;
  return (
    <>
      <Arrow from={at['<']} to={at.d} />
      <Arrow from={at.d} to={at.e} />
      <Arrow from={at.e} to={at['/']} opacity={1 - progress(time, spliced, 300)} />
      <Arrow from={at.e} to={at.v} grow={progress(time, spliced + 150, 400)} />
      <Arrow from={at.v} to={at['/']} grow={progress(time, linked, 400)} />
      <Arrow from={at['/']} to={at['>']} />
      {DEVSOC.filter((char) => char !== 'v').map((char) => (
        <Node key={char} char={char} at={at[char]} lit={char === 'e' && curr > 0.5} />
      ))}
      {born > 0 && <Node char="v" at={at.v} lit={!done} opacity={born} />}
      <Label at={at.e} opacity={curr}>
        curr
      </Label>
      <Label at={at.v} opacity={born * labels} below={34}>
        new_node
      </Label>
    </>
  );
};

const DELETE_STEPS = statements(1100);
const DELETE_DONE = 4400;

/** `delete_after` unlinks a stray second `e` hanging between `e` and `v`, then frees it. */
const DeleteStage = ({ time }: { time: number }) => {
  const [, targeted, unlinked, freed] = DELETE_STEPS.map((step) => step.at);
  const labels = 1 - progress(time, DELETE_DONE, FADE_MS);
  const at: Record<DevsocChar, Point> = {
    '<': slot(0),
    d: slot(1),
    e: slot(2),
    v: slot(3),
    '/': slot(4),
    '>': slot(5),
  };
  const stray = { x: (slot(2).x + slot(3).x) / 2, y: Y + DROP };
  const alive = 1 - progress(time, freed, 400);
  const prev = progress(time, 150, 250) * labels;
  const target = progress(time, targeted, 300);
  return (
    <>
      <Arrow from={at['<']} to={at.d} />
      <Arrow from={at.d} to={at.e} />
      <Arrow from={at.e} to={stray} opacity={1 - progress(time, unlinked, 300)} />
      <Arrow from={at.e} to={at.v} grow={progress(time, unlinked + 150, 400)} />
      <Arrow from={stray} to={at.v} opacity={alive} />
      <Arrow from={at.v} to={at['/']} />
      <Arrow from={at['/']} to={at['>']} />
      {DEVSOC.map((char) => (
        <Node key={char} char={char} at={at[char]} lit={char === 'e' && prev > 0.5} />
      ))}
      <Node char="e" at={stray} lit={target > 0.5} opacity={alive} />
      <Label at={at.e} opacity={prev}>
        prev
      </Label>
      <Label at={stray} opacity={target * alive} below={34}>
        target
      </Label>
    </>
  );
};

const SEARCH_START = 700;
const SEARCH_STEP_MS = 380;
const SEARCH_MOVE_MS = 300;
const HOPS = DEVSOC.length - 1;
/** When `curr` moves on to each next node. */
const HOP_AT = Array.from(
  { length: HOPS },
  (_, hop) => SEARCH_START + (2 * hop + 1) * SEARCH_STEP_MS
);
const SEARCH_STEPS = [
  { at: 0, line: 0 },
  ...Array.from({ length: 2 * HOPS + 1 }, (_, i) => ({
    at: SEARCH_START + i * SEARCH_STEP_MS,
    line: i % 2 === 0 ? 1 : 2,
  })),
  { at: SEARCH_START + (2 * HOPS + 1) * SEARCH_STEP_MS, line: 3 },
];
const SEARCH_DONE = SEARCH_STEPS[SEARCH_STEPS.length - 1].at + SEARCH_STEP_MS;

/** `search` walks `curr` along a dimmed list, lighting each node, until it reaches `>`. */
const SearchStage = ({ time }: { time: number }) => {
  const labels = 1 - progress(time, SEARCH_DONE, FADE_MS);
  const place = HOP_AT.reduce((sum, at) => sum + progress(time, at, SEARCH_MOVE_MS), 0);
  const curr = progress(time, 150, 250) * labels;
  return (
    <>
      {DEVSOC.slice(1).map((char, i) => (
        <Arrow key={char} from={slot(i)} to={slot(i + 1)} />
      ))}
      {DEVSOC.map((char, i) => (
        <Node
          key={char}
          char={char}
          at={slot(i)}
          lit={curr > 0.5 && Math.round(place) === i}
          opacity={0.3 + 0.7 * clamp01(place - i + 1)}
        />
      ))}
      <Label at={{ x: X0 + place * DX, y: Y }} opacity={curr}>
        curr
      </Label>
    </>
  );
};

const SCENES: Scene[] = [
  {
    title: "insert_after(curr, 'v')",
    label:
      "An editor running insert_after, which links a new node into a list to complete DevSoc's <dev/> logo",
    code: [
      { text: 'void insert_after(struct node *curr, char c) {', indent: 0 },
      { text: 'struct node *new_node = make_node(c);', indent: 1 },
      { text: 'new_node->next = curr->next;', indent: 1 },
      { text: 'curr->next = new_node;', indent: 1 },
      { text: '}', indent: 0 },
    ],
    steps: INSERT_STEPS,
    doneAt: RISE_AT,
    Stage: InsertStage,
  },
  {
    title: 'delete_after(prev)',
    label:
      "An editor running delete_after, which unlinks and frees a stray node to complete DevSoc's <dev/> logo",
    code: [
      { text: 'void delete_after(struct node *prev) {', indent: 0 },
      { text: 'struct node *target = prev->next;', indent: 1 },
      { text: 'prev->next = target->next;', indent: 1 },
      { text: 'free(target);', indent: 1 },
      { text: '}', indent: 0 },
    ],
    steps: DELETE_STEPS,
    doneAt: DELETE_DONE,
    Stage: DeleteStage,
  },
  {
    title: "search(head, '>')",
    label:
      "An editor running search, which walks a list node by node to find '>' and lights up DevSoc's <dev/> logo",
    code: [
      { text: 'struct node *search(struct node *curr, char c) {', indent: 0 },
      { text: 'while (curr->data != c)', indent: 1 },
      { text: 'curr = curr->next;', indent: 2 },
      { text: 'return curr;', indent: 1 },
      { text: '}', indent: 0 },
    ],
    steps: SEARCH_STEPS,
    doneAt: SEARCH_DONE,
    Stage: SearchStage,
  },
];

/**
 * An editor running a linked list operation that completes DevSoc's `<dev/>`. Each page load picks
 * one of `SCENES`, and replays on hover keep it.
 */
const Hero = () => {
  const [scene] = useState(() => SCENES[Math.floor(Math.random() * SCENES.length)]);
  const { ref, time, replay } = useTimeline(scene.doneAt + FADE_MS + SETTLE_MS);
  const step = scene.steps.filter((s) => time >= s.at).length - 1;
  const done = time >= scene.doneAt;
  const { Stage } = scene;

  return (
    <div ref={ref} className={styles.wrap} onPointerEnter={replay}>
      <div className={styles.editor} role="img" aria-label={scene.label}>
        <div className={styles.editorBar}>
          <i />
          <i />
          <i />
          <span className={styles.editorTitle}>{scene.title}</span>
          <span className={styles.editorStatus}>
            {done ? 'done' : `step ${step + 1} of ${scene.steps.length}`}
          </span>
        </div>
        <svg className={styles.stage} viewBox="0 0 410 172">
          <Stage time={time} />
        </svg>
        <ol className={styles.listing}>
          {scene.code.map((row, index) => (
            <li key={index} data-active={index === scene.steps[step].line || undefined}>
              <Line text={'  '.repeat(row.indent) + row.text} />
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

export default Hero;
