import { useCallback, useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Plays a `duration`-long animation once on mount and returns how far through it is, in milliseconds.
 * It replays when the returned `ref` scrolls back into view or `replay` is called, but never cuts
 * a run short. With reduced motion it jumps straight to the end.
 */
export const useTimeline = (duration: number) => {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const running = useRef(false);
  const [time, setTime] = useState(() => (prefersReducedMotion() ? duration : 0));

  const replay = useCallback(() => {
    if (running.current || prefersReducedMotion()) return;
    running.current = true;
    const start = performance.now();
    const tick = () => {
      const elapsed = Math.min(performance.now() - start, duration);
      setTime(elapsed);
      if (elapsed < duration) frame.current = requestAnimationFrame(tick);
      else running.current = false;
    };
    frame.current = requestAnimationFrame(tick);
  }, [duration]);

  useEffect(() => {
    replay();
    const node = ref.current;
    let visible = true;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !visible) replay();
        visible = entry.isIntersecting;
      },
      { threshold: 0.3 }
    );
    if (node) observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      running.current = false;
    };
  }, [replay]);

  return { ref, time, replay };
};

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export const easeInOut = (n: number) => {
  const p = clamp01(n);
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
};

/** Progress through the window that starts at `start` and lasts `length`, eased. */
export const progress = (time: number, start: number, length: number) =>
  easeInOut((time - start) / length);
