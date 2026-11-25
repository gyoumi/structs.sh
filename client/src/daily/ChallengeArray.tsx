import { CSSProperties, KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { LockIcon } from '@/ui/icons';
import styles from './ChallengeArray.module.css';

type Selection = { kind: 'idle' } | { kind: 'selected'; index: number; focusNonce: number };

type Props = {
  values: number[];
  fixed: Set<number>;
  /** Locks every slot, as while a run animates. */
  frozen?: boolean;
  onSwap: (a: number, b: number) => void;
};

/** The slot to swap with: the nearest free one from `from` in `direction`, skipping fixed slots. */
const nextFreeSlot = (fixed: Set<number>, length: number, from: number, direction: 1 | -1) => {
  for (let slot = from + direction; slot >= 0 && slot < length; slot += direction) {
    if (!fixed.has(slot)) return slot;
  }
  return null;
};

const slideValueBetweenSlots = (value: HTMLElement, to: HTMLElement, from: HTMLElement) => {
  if (typeof value.animate !== 'function') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const fromRect = from.getBoundingClientRect();
  const toRect = to.getBoundingClientRect();
  const dx = fromRect.left - toRect.left;
  const dy = fromRect.top - toRect.top;
  value.animate(
    [
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: `translate(${dx / 2}px, calc(${dy / 2}px - 0.6rem))`, offset: 0.5 },
      { transform: 'none' },
    ],
    { duration: 240, easing: 'ease-out' }
  );
};

const ChallengeArray = ({ values, fixed, frozen = false, onSwap }: Props) => {
  const [selection, setSelection] = useState<Selection>({ kind: 'idle' });
  const [announcement, setAnnouncement] = useState('');
  const slots = useRef<(HTMLButtonElement | null)[]>([]);
  const valueEls = useRef<(HTMLSpanElement | null)[]>([]);

  const selected = !frozen && selection.kind === 'selected' ? selection.index : null;

  useEffect(() => {
    if (frozen) setSelection({ kind: 'idle' });
  }, [frozen]);

  useLayoutEffect(() => {
    if (selection.kind !== 'selected' || selection.focusNonce === 0) return;
    slots.current[selection.index]?.focus();
  }, [selection]);

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
    if (selected === null) setSelection({ kind: 'selected', index, focusNonce: 0 });
    else if (selected === index) setSelection({ kind: 'idle' });
    else {
      swap(selected, index);
      setSelection({ kind: 'idle' });
    }
  };

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    if (event.key === 'Escape') {
      setSelection({ kind: 'idle' });
      return;
    }
    if (selected !== index) return;
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const target = nextFreeSlot(fixed, values.length, index, event.key === 'ArrowRight' ? 1 : -1);
    if (target === null) return;
    swap(index, target);
    setSelection((prev) => ({
      kind: 'selected',
      index: target,
      focusNonce: prev.kind === 'selected' ? prev.focusNonce + 1 : 1,
    }));
  };

  return (
    <>
      <div
        role="group"
        aria-label="Challenge array"
        className={styles.array}
        style={
          {
            '--slots': values.length,
            '--mobile-slots': values.length > 10 ? Math.ceil(values.length / 2) : values.length,
          } as CSSProperties
        }
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
                style={
                  String(value).length > 2
                    ? ({ '--chars': String(value).length } as CSSProperties)
                    : undefined
                }
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

export default ChallengeArray;
