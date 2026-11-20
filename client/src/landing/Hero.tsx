import { ReactElement, useState } from 'react';
import { DEVSOC, DevsocChar } from './devsoc';
import { clamp01, easedProgress, useTimeline } from './useTimeline';
import {
  Arrow,
  DROP_DISTANCE,
  FIRST_NODE_X,
  Label,
  Line,
  Node,
  NODE_SPACING,
  Point,
  ROW_Y,
  slot,
} from './HeroDrawing';
import styles from './Hero.module.css';

const FADE_MS = 500;
const SETTLE_MS = 400;

interface Scene {
  title: string;
  label: string;
  code: { text: string; indent: number }[];
  steps: { at: number; line: number }[];
  doneAt: number;
  Stage: (props: { time: number }) => ReactElement;
}

const statements = (gap: number) => [0, 1, 2, 3].map((line) => ({ at: line * gap, line }));

const INSERT_STEPS = statements(1100);
const RISE_AT = 4400;
const RISE_MS = 500;

const InsertStage = ({ time }: { time: number }) => {
  const [, made, linked, spliced] = INSERT_STEPS.map((step) => step.at);
  const rise = easedProgress(time, RISE_AT, RISE_MS);
  const done = time >= RISE_AT;
  const labelOpacity = 1 - rise;
  const positions: Record<DevsocChar, Point> = {
    '<': slot(0),
    d: slot(1),
    e: slot(2),
    v: { x: slot(3).x, y: ROW_Y + DROP_DISTANCE * (1 - rise) },
    '/': slot(4),
    '>': slot(5),
  };
  const newNodeOpacity = easedProgress(time, made, 300);
  const currLabelOpacity = easedProgress(time, 150, 250) * labelOpacity;
  return (
    <>
      <Arrow from={positions['<']} to={positions.d} />
      <Arrow from={positions.d} to={positions.e} />
      <Arrow
        from={positions.e}
        to={positions['/']}
        opacity={1 - easedProgress(time, spliced, 300)}
      />
      <Arrow from={positions.e} to={positions.v} grow={easedProgress(time, spliced + 150, 400)} />
      <Arrow from={positions.v} to={positions['/']} grow={easedProgress(time, linked, 400)} />
      <Arrow from={positions['/']} to={positions['>']} />
      {DEVSOC.filter((char) => char !== 'v').map((char) => (
        <Node
          key={char}
          char={char}
          position={positions[char]}
          lit={char === 'e' && currLabelOpacity > 0.5}
        />
      ))}
      {newNodeOpacity > 0 && (
        <Node char="v" position={positions.v} lit={!done} opacity={newNodeOpacity} />
      )}
      <Label position={positions.e} opacity={currLabelOpacity}>
        curr
      </Label>
      <Label position={positions.v} opacity={newNodeOpacity * labelOpacity} below={34}>
        new_node
      </Label>
    </>
  );
};

const DELETE_STEPS = statements(1100);
const DELETE_DONE = 4400;

const DeleteStage = ({ time }: { time: number }) => {
  const [, targeted, unlinked, freed] = DELETE_STEPS.map((step) => step.at);
  const labelOpacity = 1 - easedProgress(time, DELETE_DONE, FADE_MS);
  const positions: Record<DevsocChar, Point> = {
    '<': slot(0),
    d: slot(1),
    e: slot(2),
    v: slot(3),
    '/': slot(4),
    '>': slot(5),
  };
  const stray = { x: (slot(2).x + slot(3).x) / 2, y: ROW_Y + DROP_DISTANCE };
  const strayNodeOpacity = 1 - easedProgress(time, freed, 400);
  const prevLabelOpacity = easedProgress(time, 150, 250) * labelOpacity;
  const targetOpacity = easedProgress(time, targeted, 300);
  return (
    <>
      <Arrow from={positions['<']} to={positions.d} />
      <Arrow from={positions.d} to={positions.e} />
      <Arrow from={positions.e} to={stray} opacity={1 - easedProgress(time, unlinked, 300)} />
      <Arrow from={positions.e} to={positions.v} grow={easedProgress(time, unlinked + 150, 400)} />
      <Arrow from={stray} to={positions.v} opacity={strayNodeOpacity} />
      <Arrow from={positions.v} to={positions['/']} />
      <Arrow from={positions['/']} to={positions['>']} />
      {DEVSOC.map((char) => (
        <Node
          key={char}
          char={char}
          position={positions[char]}
          lit={char === 'e' && prevLabelOpacity > 0.5}
        />
      ))}
      <Node char="e" position={stray} lit={targetOpacity > 0.5} opacity={strayNodeOpacity} />
      <Label position={positions.e} opacity={prevLabelOpacity}>
        prev
      </Label>
      <Label position={stray} opacity={targetOpacity * strayNodeOpacity} below={34}>
        target
      </Label>
    </>
  );
};

const SEARCH_START = 700;
const SEARCH_STEP_MS = 380;
const SEARCH_MOVE_MS = 300;
const HOPS = DEVSOC.length - 1;
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

const SearchStage = ({ time }: { time: number }) => {
  const labelOpacity = 1 - easedProgress(time, SEARCH_DONE, FADE_MS);
  const place = HOP_AT.reduce((sum, at) => sum + easedProgress(time, at, SEARCH_MOVE_MS), 0);
  const currLabelOpacity = easedProgress(time, 150, 250) * labelOpacity;
  return (
    <>
      {DEVSOC.slice(1).map((char, i) => (
        <Arrow key={char} from={slot(i)} to={slot(i + 1)} />
      ))}
      {DEVSOC.map((char, i) => (
        <Node
          key={char}
          char={char}
          position={slot(i)}
          lit={currLabelOpacity > 0.5 && Math.round(place) === i}
          opacity={0.3 + 0.7 * clamp01(place - i + 1)}
        />
      ))}
      <Label
        position={{ x: FIRST_NODE_X + place * NODE_SPACING, y: ROW_Y }}
        opacity={currLabelOpacity}
      >
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
