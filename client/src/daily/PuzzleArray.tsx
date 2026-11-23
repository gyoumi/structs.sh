import { CSSProperties, KeyboardEvent, useLayoutEffect, useRef, useState } from 'react';
import { LockIcon } from '@/ui/icons';
import { nextFreeSlot } from './puzzle';
import styles from './PuzzleArray.module.css';

type Props = {
  values: number[];
  fixed: Set<number>;
  /** Locks every slot, as while a run animates. */
  frozen?: boolean;
  onSwap: (a: number, b: number) => void;
};

const slideValueBetweenSlots = (value: HTMLElement, to: HTMLElement, from: HTMLElement) => {
  if (typeof value.animate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const dx = from.getBoundingClientRect().left - to.getBoundingClientRect().left;
  value.animate(
    [
      { transform: `translateX(${dx}px)` },
      { transform: `translate(${dx / 2}px, -0.6rem)`, offset: 0.5 },
      { transform: 'none' },
    ],
    { duration: 240, easing: 'ease-out' }
  );
};

const PuzzleArray = ({ values, fixed, frozen = false, onSwap }: Props) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const slots = useRef<(HTMLButtonElement | null)[]>([]);
  const valueEls = useRef<(HTMLSpanElement | null)[]>([]);
  const focusAfterSwap = useRef<number | null>(null);

  if (frozen && selected !== null) setSelected(null);

  useLayoutEffect(() => {
    if (focusAfterSwap.current === null) return;
    slots.current[focusAfterSwap.current]?.focus();
    focusAfterSwap.current = null;
  });

  const swap = (a: number, b: number) => {
    const first = slots.current[a];
    const second = slots.current[b];
    const firstValue = valueEls.current[a];
    const secondValue = valueEls.current[b];
    if (first && second && firstValue && secondValue) {
      slideValueBetweenSlots(firstValue, first, second);
      slideValueBetweenSlots(secondValue, second, first);
    }
    setAnnouncement(`Swapped ${values[a]} and ${values[b]}`);
    onSwap(a, b);
  };

  const handleClick = (index: number) => {
    if (selected === null) setSelected(index);
    else if (selected === index) setSelected(null);
    else {
      swap(selected, index);
      setSelected(null);
    }
  };

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key === 'Escape') {
      setSelected(null);
      return;
    }
    if (selected !== index) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const target = nextFreeSlot(fixed, values.length, index, event.key === 'ArrowRight' ? 1 : -1);
    if (target === null) return;
    swap(index, target);
    setSelected(target);
    focusAfterSwap.current = target;
  };

  return (
    <>
      <div
        role="group"
        aria-label="Puzzle array"
        className={styles.array}
        style={{ '--slots': values.length } as CSSProperties}
      >
        {values.map((value, index) => {
          const locked = fixed.has(index);
          return (
            <button
              key={index}
              ref={(element) => {
                slots.current[index] = element;
              }}
              type="button"
              className={frozen && !locked ? `${styles.slot} ${styles.frozen}` : styles.slot}
              disabled={locked || frozen}
              aria-pressed={locked ? undefined : selected === index}
              onClick={() => handleClick(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              <span
                ref={(element) => {
                  valueEls.current[index] = element;
                }}
                className={styles.value}
              >
                {value}
              </span>
              {locked && <LockIcon size={12} className={styles.lock} />}
            </button>
          );
        })}
      </div>
      <p className={styles.srOnly} aria-live="polite">
        {announcement}
      </p>
    </>
  );
};

export default PuzzleArray;
