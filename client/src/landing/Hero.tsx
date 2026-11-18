import { useState } from 'react';
import { Theme, useTheme } from '@/ui/theme';
import { DEVSOC, DevsocGlyph, devsocInk } from './devsoc';
import { easeInOut, useTimeline } from './useTimeline';
import styles from './Hero.module.css';

const UNIT = 40;
const DEPTH = 16;
const PITCH = UNIT + 20;
const HOLD_MS = 700;
const FRAME_MS = 230;
const MOVE_MS = 200;
const SETTLE_MS = 200;

/** Stacks in their starting order. A stack's id is its sorted place, and its height is two more than that. */
const START = [3, 0, 4, 2, 5, 1];

interface Frame {
  order: number[];
  comparing: number[];
  /** The places, from `[0]` up to but not including `[1]`, that are already in sorted order. */
  sorted: [number, number];
}

const swap = (order: number[], a: number, b: number) => {
  [order[a], order[b]] = [order[b], order[a]];
};

/** Every frame of a selection sort over `START`, as the order of the stacks. */
const selectionSort = (): Frame[] => {
  const order = [...START];
  const frames: Frame[] = [{ order: [...order], comparing: [], sorted: [0, 0] }];
  for (let i = 0; i < order.length - 1; i += 1) {
    let smallest = i;
    for (let j = i + 1; j < order.length; j += 1) {
      frames.push({ order: [...order], comparing: [order[smallest], order[j]], sorted: [0, i] });
      if (order[j] < order[smallest]) smallest = j;
    }
    swap(order, i, smallest);
    frames.push({ order: [...order], comparing: [order[i]], sorted: [0, i + 1] });
  }
  frames.push({ order: [...order], comparing: [], sorted: [0, order.length] });
  return frames;
};

/** Every frame of a bubble sort over `START`, which settles the tallest stacks at the end first. */
const bubbleSort = (): Frame[] => {
  const order = [...START];
  const n = order.length;
  const frames: Frame[] = [{ order: [...order], comparing: [], sorted: [n, n] }];
  for (let pass = 0; pass < n - 1; pass += 1) {
    const settled: [number, number] = [n - pass, n];
    for (let j = 0; j < n - 1 - pass; j += 1) {
      frames.push({ order: [...order], comparing: [order[j], order[j + 1]], sorted: settled });
      if (order[j] > order[j + 1]) {
        swap(order, j, j + 1);
        frames.push({ order: [...order], comparing: [order[j], order[j + 1]], sorted: settled });
      }
    }
  }
  frames.push({ order: [...order], comparing: [], sorted: [0, n] });
  return frames;
};

/** Every frame of an insertion sort over `START`, which swaps each stack left into the sorted front. */
const insertionSort = (): Frame[] => {
  const order = [...START];
  const frames: Frame[] = [{ order: [...order], comparing: [], sorted: [0, 1] }];
  for (let i = 1; i < order.length; i += 1) {
    for (let j = i; j > 0; j -= 1) {
      frames.push({ order: [...order], comparing: [order[j - 1], order[j]], sorted: [0, i] });
      if (order[j - 1] < order[j]) break;
      swap(order, j - 1, j);
      frames.push({ order: [...order], comparing: [order[j - 1]], sorted: [0, i] });
    }
  }
  frames.push({ order: [...order], comparing: [], sorted: [0, order.length] });
  return frames;
};

const SORTS = [
  { name: 'selection sort', frames: selectionSort() },
  { name: 'bubble sort', frames: bubbleSort() },
  { name: 'insertion sort', frames: insertionSort() },
];

const startOf = (frame: number) => (frame === 0 ? 0 : HOLD_MS + (frame - 1) * FRAME_MS);
const durationOf = (frames: Frame[]) => startOf(frames.length - 1) + SETTLE_MS;

interface Faces {
  front: string;
  top: string;
  side: string;
}

const palette: Record<Theme, Record<'waiting' | 'comparing' | 'sorted', Faces>> = {
  light: {
    waiting: { front: '#9CC5EC', top: '#D6E8F8', side: '#6F9FD2' },
    comparing: { front: '#ECC98F', top: '#F7E6C4', side: '#C99A52' },
    sorted: { front: '#B3AEF0', top: '#DCD9FA', side: '#8A84DC' },
  },
  dark: {
    waiting: { front: '#6FA3D8', top: '#C4DEF4', side: '#3F78B5' },
    comparing: { front: '#ECC98F', top: '#F7E6C4', side: '#B98A45' },
    sorted: { front: '#8F8AE0', top: '#C3C0F2', side: '#5D58BD' },
  },
};

/** One block's front and side between `bottom` and `bottom - UNIT`, plus its top when it is the highest. */
const Block = ({ bottom, faces, top }: { bottom: number; faces: Faces; top: boolean }) => {
  const y = bottom - UNIT;
  return (
    <>
      <rect x={0} y={y} width={UNIT} height={UNIT} fill={faces.front} />
      <polygon
        points={`${UNIT},${y} ${UNIT + DEPTH},${y - DEPTH} ${UNIT + DEPTH},${bottom - DEPTH} ${UNIT},${bottom}`}
        fill={faces.side}
      />
      {top && (
        <polygon
          points={`0,${y} ${DEPTH},${y - DEPTH} ${UNIT + DEPTH},${y - DEPTH} ${UNIT},${y}`}
          fill={faces.top}
        />
      )}
      <path
        d={`M0 ${bottom}h${UNIT}l${DEPTH} ${-DEPTH}`}
        stroke="rgba(20, 18, 63, 0.22)"
        strokeWidth={2}
        fill="none"
      />
    </>
  );
};

/** Where stack `id` is at `time`, sliding between frames. */
const placeOf = (frames: Frame[], id: number, frame: number, time: number) => {
  const now = frames[frame].order.indexOf(id);
  if (frame === 0) return now;
  const before = frames[frame - 1].order.indexOf(id);
  return before + (now - before) * easeInOut((time - startOf(frame)) / MOVE_MS);
};

/**
 * Stacks of blocks that sort themselves until the bottom row spells DevSoc's `<dev/>`. Each page
 * load picks one of `SORTS`, and replays on hover keep it.
 */
const Hero = () => {
  const theme = useTheme();
  const [{ name, frames }] = useState(() => SORTS[Math.floor(Math.random() * SORTS.length)]);
  const { ref, time, replay } = useTimeline(durationOf(frames));
  const frame = frames.reduce((current, _, i) => (time >= startOf(i) ? i : current), 0);
  const { comparing, sorted, order } = frames[frame];
  const colours = palette[theme];
  const paint = [...order].sort(
    (a, b) => Number(comparing.includes(a)) - Number(comparing.includes(b))
  );

  return (
    <div ref={ref} className={styles.wrap} onPointerEnter={replay}>
      <svg
        className={styles.sort}
        viewBox={`-4 ${-(7 * UNIT + DEPTH + 6)} ${5 * PITCH + UNIT + DEPTH + 8} ${7 * UNIT + DEPTH + 10}`}
        role="img"
        aria-label={`Blocks sorting themselves into DevSoc's <dev/> logo with ${name}`}
      >
        {paint.map((id) => {
          const place = order.indexOf(id);
          const state = comparing.includes(id)
            ? 'comparing'
            : place >= sorted[0] && place < sorted[1]
              ? 'sorted'
              : 'waiting';
          const char = DEVSOC[id];
          return (
            <g key={char} transform={`translate(${placeOf(frames, id, frame, time) * PITCH} 0)`}>
              {Array.from({ length: id + 2 }, (_, level) => (
                <Block
                  key={level}
                  bottom={-level * UNIT}
                  faces={colours[state]}
                  top={level === id + 1}
                />
              ))}
              <g transform={`translate(${UNIT / 2} ${-UNIT / 2})`}>
                <DevsocGlyph char={char} scale={0.72} fill={devsocInk(char, 'light')} />
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default Hero;
