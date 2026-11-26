import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { Visualiser } from './useVisualiser';

interface View {
  x: number;
  y: number;
  k: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;
const FIT_MAX_ZOOM = 1.2;
/** Breathing room around a fitted drawing, in drawing units. */
const FIT_MARGIN = 48;
const TREE_LAYOUT_WIDTH = 1000;

export interface StageHandle {
  hostRef: RefObject<HTMLDivElement | null>;
  frameRef: RefObject<HTMLDivElement | null>;
  svgRef: RefObject<SVGSVGElement | null>;
  insets: Insets;
  view: View;
  gliding: boolean;
  dragging: boolean;
  empty: boolean;
  zoomPercent: number;
  fit: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
}

/**
 * Pan, zoom and fit for the drawing. `insets` is the room floating panels take
 * from each edge, so a fit centres the drawing in what's left. They land on the
 * stage as `--sx-inset-*`, and the fit reads the `.sx-stage-frame` box they
 * shape, so a stylesheet can give a small screen a different frame.
 */
export const useStage = (visualiser: Visualiser, insets: Insets): StageHandle => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [gliding, setGliding] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [empty, setEmpty] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const drag = useRef<{ x: number; y: number } | null>(null);

  const measure = useCallback(() => {
    const frame = frameRef.current;
    const svg = svgRef.current;
    if (!frame || !svg) return null;
    const shapes = svg.querySelectorAll('circle, rect');
    const box = svg.getBBox();
    const room = {
      left: frame.offsetLeft,
      top: frame.offsetTop,
      width: frame.offsetWidth,
      height: frame.offsetHeight,
    };
    return { room, box, count: shapes.length };
  }, []);

  const fitNow = useCallback(
    (glide: boolean) => {
      const measured = measure();
      if (!measured) return;
      const { room, box, count } = measured;
      setEmpty(count === 0);
      const { width, height } = room;
      if (width <= 0 || height <= 0) return;
      // An empty linked list still draws its head pointer, so there's usually a box to centre.
      const boxWidth = Math.max(box.width, 1);
      const boxHeight = Math.max(box.height, 1);
      const k = Math.max(
        MIN_ZOOM,
        Math.min(FIT_MAX_ZOOM, width / (boxWidth + FIT_MARGIN), height / (boxHeight + FIT_MARGIN))
      );
      setGliding(glide);
      setView({
        k,
        x: room.left + (width - boxWidth * k) / 2 - box.x * k,
        y: room.top + (height - boxHeight * k) / 2 - box.y * k,
      });
    },
    [measure]
  );

  const fit = useCallback(() => fitNow(true), [fitNow]);

  // Refit only when the drawing has left the room it was given, so the camera stays put otherwise.
  const fitIfOutside = useCallback(() => {
    const measured = measure();
    if (!measured) return;
    const { room, box, count } = measured;
    setEmpty(count === 0);
    const { x, y, k } = viewRef.current;
    const left = box.x * k + x;
    const top = box.y * k + y;
    const outside =
      left < room.left - 4 ||
      top < room.top - 4 ||
      left + box.width * k > room.left + room.width + 4 ||
      top + box.height * k > room.top + room.height + 4;
    if (outside) fitNow(true);
  }, [measure, fitNow]);

  const first = useRef(true);
  useLayoutEffect(() => {
    if (visualiser.revision === 0) return;
    if (first.current || visualiser.status === 'idle') {
      first.current = false;
      fitNow(false);
    } else {
      fitIfOutside();
    }
    // Only a change to the drawing should move the camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualiser.revision]);

  useEffect(() => {
    if (visualiser.status === 'done') fitIfOutside();
  }, [visualiser.status, fitIfOutside]);

  // A panel opening over the stage can cover the drawing, so make room for it.
  const { top, right, bottom, left } = insets;
  useEffect(() => {
    fitIfOutside();
  }, [top, right, bottom, left, fitIfOutside]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const observer = new ResizeObserver(() => fitNow(false));
    observer.observe(host);
    return () => observer.disconnect();
  }, [fitNow]);

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const px = clientX === undefined ? rect.width / 2 : clientX - rect.left;
    const py = clientY === undefined ? rect.height / 2 : clientY - rect.top;
    setView((previous) => {
      const k = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, previous.k * factor));
      const ratio = k / previous.k;
      return { k, x: px - (px - previous.x) * ratio, y: py - (py - previous.y) * ratio };
    });
  }, []);

  // React attaches wheel listeners as passive, and this one has to stop the page from scrolling.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setGliding(false);
      if (event.ctrlKey || event.metaKey) {
        zoomAt(Math.exp(-event.deltaY * 0.01), event.clientX, event.clientY);
      } else {
        setView((previous) => ({
          ...previous,
          x: previous.x - event.deltaX,
          y: previous.y - event.deltaY,
        }));
      }
    };
    host.addEventListener('wheel', onWheel, { passive: false });
    return () => host.removeEventListener('wheel', onWheel);
  }, [zoomAt]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    // Panels floating over the stage keep their own presses.
    const onDrawing =
      event.target === event.currentTarget || svgRef.current?.contains(event.target as Node);
    if (event.button !== 0 || !onDrawing) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY };
    setGliding(false);
    setDragging(true);
  }, []);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const last = drag.current;
    if (!last) return;
    const dx = event.clientX - last.x;
    const dy = event.clientY - last.y;
    drag.current = { x: event.clientX, y: event.clientY };
    setView((previous) => ({ ...previous, x: previous.x + dx, y: previous.y + dy }));
  }, []);

  const onPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const zoomIn = useCallback(() => {
    setGliding(true);
    zoomAt(1.25);
  }, [zoomAt]);

  const zoomOut = useCallback(() => {
    setGliding(true);
    zoomAt(0.8);
  }, [zoomAt]);

  return useMemo(
    () => ({
      hostRef,
      frameRef,
      svgRef,
      insets: { top, right, bottom, left },
      view,
      gliding,
      dragging,
      empty,
      zoomPercent: Math.round(view.k * 100),
      fit,
      zoomIn,
      zoomOut,
      onPointerDown,
      onPointerMove,
      onPointerUp,
    }),
    [
      top,
      right,
      bottom,
      left,
      view,
      gliding,
      dragging,
      empty,
      fit,
      zoomIn,
      zoomOut,
      onPointerDown,
      onPointerMove,
      onPointerUp,
    ]
  );
};

interface StageProps {
  stage: StageHandle;
  label: string;
  /** `list`, `tree` or `sort`, for styles that differ by what's drawn. */
  kind?: string;
  className?: string;
  /** Shown over the stage while the structure has nothing in it. */
  emptyState?: ReactNode;
  children?: ReactNode;
}

/**
 * The drawing surface. The engine finds its two SVGs by id, so only one stage
 * can be mounted at a time.
 */
export const Stage = ({ stage, label, kind, className, emptyState, children }: StageProps) => {
  const { x, y, k } = stage.view;
  const style: CSSProperties = { transform: `translate(${x}px, ${y}px) scale(${k})` };
  const { top, right, bottom, left } = stage.insets;
  const frame = {
    '--sx-inset-top': `${top}px`,
    '--sx-inset-right': `${right}px`,
    '--sx-inset-bottom': `${bottom}px`,
    '--sx-inset-left': `${left}px`,
  } as CSSProperties;
  return (
    <div
      ref={stage.hostRef}
      className={['sx-stage', className].filter(Boolean).join(' ')}
      data-kind={kind}
      data-dragging={stage.dragging || undefined}
      data-gliding={stage.gliding || undefined}
      style={frame}
      onPointerDown={stage.onPointerDown}
      onPointerMove={stage.onPointerMove}
      onPointerUp={stage.onPointerUp}
      onPointerCancel={stage.onPointerUp}
    >
      <svg
        ref={stage.svgRef}
        id="visualiser-canvas"
        className="sx-stage-canvas"
        role="img"
        aria-label={label}
        style={style}
      />
      <div ref={stage.frameRef} className="sx-stage-frame" aria-hidden="true" />
      {/* Kept rendered, because the engine measures the code text it draws here. */}
      <div id="code-container" className="sx-offstage" aria-hidden="true">
        <svg id="code-canvas" />
        {/* The tree layout spreads across this element's width, whatever the window is. */}
        <div id="visualiser-container" style={{ position: 'absolute', width: TREE_LAYOUT_WIDTH }} />
      </div>
      {stage.empty && emptyState ? <div className="sx-stage-empty">{emptyState}</div> : null}
      {children}
    </div>
  );
};
