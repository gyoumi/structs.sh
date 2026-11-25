import {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { DrawingBounds } from '@/visualiser-src/common/AnimationProducer';
import { CanvasTarget, DEFAULT_CANVAS_TARGET } from '@/visualiser-src/common/canvasTarget';
import {
  clamp,
  FitMode,
  fitView,
  insetOf,
  unionBounds,
  View,
  ViewTransition,
  visibleBounds,
} from './stageBounds';
import { useSnapshot } from './useVisualiser';
import styles from './Stage.module.css';

const MIN_SCALE = 0.3;
const MAX_SCALE = 3;

export interface StageView {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  scale: number;
}

interface StageProps {
  label: string;
  className?: string;
  style?: CSSProperties;
  children?: (view: StageView) => ReactNode;
  /** The elements this stage's session draws into. */
  target?: CanvasTarget;
  /** The smallest scale fitting draws at: a bigger drawing is panned to follow the step's focus. */
  minScale?: number;
}

/** Where a playing run is heading: the drawing's upcoming bounds and the part the step works on. */
type Ahead = { bounds: DrawingBounds | null; focus: DrawingBounds | null };

/** Whether the stage fits the drawing automatically or stays where the user panned or zoomed it. */
type CameraControl = 'auto' | 'manual';

const idOf = (selector: string) => selector.replace(/^#/, '');

const Stage = ({
  label,
  className,
  style,
  children,
  target = DEFAULT_CANVAS_TARGET,
  minScale,
}: StageProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ status: 'unfitted' });
  const [dragging, setDragging] = useState(false);
  const cameraControl = useRef<CameraControl>('auto');
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  const layoutVersion = useSnapshot((s) => s.layoutVersion);
  const complete = useSnapshot((s) => s.playback === 'complete');
  const step = useSnapshot((s) => s.step);
  const targetBounds = useSnapshot((s) => s.bounds);
  const focus = useSnapshot((s) => s.focus);
  const aheadRef = useRef<Ahead>({ bounds: targetBounds, focus });
  aheadRef.current = { bounds: targetBounds, focus };
  const prevStep = useRef(step);

  const zoomAround = useCallback((factor: number, cx: number, cy: number, animate: boolean) => {
    cameraControl.current = 'manual';
    const transition = animate ? 'smooth' : 'instant';
    setView((prev) => {
      if (prev.status !== 'fitted') return prev;
      const scale = clamp(prev.scale * factor, Math.min(MIN_SCALE, prev.scale), MAX_SCALE);
      const ratio = scale / prev.scale;
      return {
        status: 'fitted',
        scale,
        x: cx - (cx - prev.x) * ratio,
        y: cy - (cy - prev.y) * ratio,
        transition,
      };
    });
  }, []);

  const zoomFromCentre = useCallback(
    (factor: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      zoomAround(factor, rect.width / 2, rect.height / 2, true);
    },
    [zoomAround]
  );

  const fit = useCallback(
    (
      mode: FitMode = 'always',
      transition: ViewTransition = 'smooth',
      ahead: Ahead | null = null
    ) => {
      const svg = svgRef.current;
      const container = containerRef.current;
      if (!svg || !container) return;
      const box = unionBounds(visibleBounds(svg), ahead?.bounds ?? null);
      const { width, height } = container.getBoundingClientRect();
      if (!box || box.width === 0 || box.height === 0 || width === 0) {
        if (mode === 'always') {
          cameraControl.current = 'auto';
          setView({ status: 'unfitted' });
        }
        return;
      }
      const insetTop = insetOf(container, 'top');
      const insetRight = insetOf(container, 'right');
      const options = { mode, transition, insetTop, insetRight, minScale, focus: ahead?.focus };
      setView((prev) => fitView(prev, box, { width, height }, options));
      cameraControl.current = 'auto';
    },
    [minScale]
  );

  useLayoutEffect(() => {
    prevStep.current = 0;
    fit('always', 'instant', aheadRef.current);
  }, [layoutVersion, fit]);

  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => fit('always', 'instant', aheadRef.current));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [layoutVersion, fit]);

  useLayoutEffect(() => {
    const jumped = Math.abs(step - prevStep.current) > 1;
    prevStep.current = step;
    if (cameraControl.current === 'auto' || view.status === 'unfitted') {
      fit(
        complete ? 'always' : 'if-overflowing',
        jumped ? 'instant' : 'smooth',
        complete ? null : { bounds: targetBounds, focus }
      );
    }
  }, [step, complete, targetBounds, focus, fit, view.status]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const observer = new ResizeObserver(() => {
      if (cameraControl.current === 'auto') fit('always', 'instant');
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [fit]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = container.getBoundingClientRect();
      zoomAround(
        Math.exp(-event.deltaY * 0.0015),
        event.clientX - rect.left,
        event.clientY - rect.top,
        false
      );
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [zoomAround]);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    lastPointer.current = { x: event.clientX, y: event.clientY };
    setDragging(true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const last = lastPointer.current;
    if (!last) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    lastPointer.current = { x: event.clientX, y: event.clientY };
    cameraControl.current = 'manual';
    setView((prev) =>
      prev.status === 'fitted'
        ? { ...prev, x: prev.x + dx, y: prev.y + dy, transition: 'instant' }
        : prev
    );
  };

  const endDrag = () => {
    lastPointer.current = null;
    setDragging(false);
  };

  const panBy = (dx: number, dy: number) => {
    cameraControl.current = 'manual';
    setView((p) =>
      p.status === 'fitted' ? { ...p, x: p.x + dx, y: p.y + dy, transition: 'smooth' } : p
    );
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const pan = 40;
    const moves: Record<string, () => void> = {
      '+': () => zoomFromCentre(1.2),
      '=': () => zoomFromCentre(1.2),
      '-': () => zoomFromCentre(1 / 1.2),
      '0': () => fit(),
      w: () => panBy(0, pan),
      s: () => panBy(0, -pan),
      a: () => panBy(pan, 0),
      d: () => panBy(-pan, 0),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      move();
    }
  };

  const stageView: StageView = {
    zoomIn: () => zoomFromCentre(1.2),
    zoomOut: () => zoomFromCentre(1 / 1.2),
    fit: () => fit(),
    scale: view.status === 'fitted' ? view.scale : 1,
  };

  return (
    <div className={[styles.frame, className].filter(Boolean).join(' ')} style={style}>
      {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div
        id={target.container}
        ref={containerRef}
        className={styles.surface}
        data-dragging={dragging || undefined}
        role="application"
        aria-roledescription="drawing"
        aria-label={`${label}. Drag to pan, scroll to zoom, or focus and use plus, minus and 0 to fit.`}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        {/* eslint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
        <svg
          id={idOf(target.canvas)}
          ref={svgRef}
          className={styles.canvas}
          data-smooth={(view.status === 'fitted' && view.transition === 'smooth') || undefined}
          style={
            view.status === 'fitted'
              ? { transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }
              : { opacity: 0 }
          }
        />
      </div>
      <div id={target.codeContainer} className={styles.hiddenCode} aria-hidden="true">
        <svg id={idOf(target.code)} />
      </div>
      {children?.(stageView)}
    </div>
  );
};

export default Stage;
