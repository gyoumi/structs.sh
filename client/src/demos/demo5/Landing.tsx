import { useEffect, useState, type CSSProperties } from 'react';
import { LandingPage, type LandingConfig } from '../shared/Landing';
import './demo5.css';

const START = [5, 2, 7, 3, 8, 1, 6, 4];
const FRAME_MS = 300;

interface Frame {
  order: number[];
  comparing: number[];
  sorted: number;
}

/** Every frame of a selection sort over `start`, as positions of values. */
const selectionSort = (start: number[]): Frame[] => {
  const order = [...start];
  const frames: Frame[] = [{ order: [...order], comparing: [], sorted: 0 }];
  for (let i = 0; i < order.length - 1; i += 1) {
    let smallest = i;
    for (let j = i + 1; j < order.length; j += 1) {
      frames.push({ order: [...order], comparing: [order[smallest], order[j]], sorted: i });
      if (order[j] < order[smallest]) smallest = j;
    }
    [order[i], order[smallest]] = [order[smallest], order[i]];
    frames.push({ order: [...order], comparing: [order[i]], sorted: i + 1 });
  }
  frames.push({ order: [...order], comparing: [], sorted: order.length });
  return frames;
};

const FRAMES = selectionSort(START);

/** Stacks of blocks sorting themselves, shortest first. */
const BlockSort = () => {
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [at, setAt] = useState(reduced ? FRAMES.length - 1 : 0);

  useEffect(() => {
    if (at >= FRAMES.length - 1) return undefined;
    const timer = window.setTimeout(() => setAt(at + 1), at === 0 ? 700 : FRAME_MS);
    return () => window.clearTimeout(timer);
  }, [at]);

  const frame = FRAMES[at];

  return (
    <div className="d5-sort" aria-hidden="true">
      {START.map((value) => {
        const position = frame.order.indexOf(value);
        const state = frame.comparing.includes(value)
          ? 'comparing'
          : position < frame.sorted
            ? 'sorted'
            : undefined;
        return (
          <span
            key={value}
            className="d5-stack"
            data-state={state}
            style={{ '--at': position, '--size': value } as CSSProperties}
          />
        );
      })}
    </div>
  );
};

const config: LandingConfig = {
  base: '/5',
  className: 'd5',
  heading: 'Structs.sh',
  tagline: 'Data structures, block by block.',
  art: <BlockSort />,
};

const Landing = () => <LandingPage config={config} />;

export default Landing;
