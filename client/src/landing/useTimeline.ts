import { useCallback, useEffect, useRef, useState } from 'react';

const reducedMotionQuery = () =>
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : undefined;

const prefersReducedMotion = () => reducedMotionQuery()?.matches ?? false;

/**
 * Plays a `duration`-long animation once on mount and returns how far through it is, in milliseconds.
 * It replays when the returned `ref` scrolls back into view or `replay` is called, but never cuts
 * a run short. With reduced motion, including when it is turned on mid-run, it jumps straight to the end.
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
    const motion = reducedMotionQuery();
    const onMotionChange = () => {
      if (!motion?.matches) return;
      cancelAnimationFrame(frame.current);
      running.current = false;
      setTime(duration);
    };
    motion?.addEventListener('change', onMotionChange);
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
      motion?.removeEventListener('change', onMotionChange);
      observer.disconnect();
      cancelAnimationFrame(frame.current);
      running.current = false;
    };
  }, [replay, duration]);

  return { ref, time, replay };
};

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

export const easeInOut = (n: number) => {
  const p = clamp01(n);
  return p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
};

export const easedProgress = (time: number, start: number, duration: number) =>
  easeInOut((time - start) / duration);
