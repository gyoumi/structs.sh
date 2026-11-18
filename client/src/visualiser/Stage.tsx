import {
  CSSProperties,
  KeyboardEvent,
  PointerEvent,
  ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useSnapshot } from './useVisualiser';
import styles from './Stage.module.css';

interface View {
  x: number;
  y: number;
  k: number;
}

const MIN_SCALE = 0.3;
const MIN_FIT_SCALE = 0.05;
const MAX_SCALE = 3;
const FIT_PADDING = 56;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const SHAPES = 'circle, ellipse, line, path, polygon, polyline, rect, text, image';

const isShown = (element: Element, root: Element) => {
  if (element.closest('defs, marker, clipPath, mask, pattern, symbol')) return false;
  for (let node: Element | null = element; node && node !== root; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
  }
  return true;
};

/**
 * The bounds of what is visible in the drawing, in its own units. Deleted nodes are faded out rather
 * than removed so playback can rewind, and `getBBox()` would still count them.
 */
const visibleBounds = (svg: SVGSVGElement) => {
  const toSvg = svg.getCTM()?.inverse();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  svg.querySelectorAll<SVGGraphicsElement>(SHAPES).forEach((shape) => {
    if (!isShown(shape, svg)) return;
    const box = shape.getBBox();
    const ctm = shape.getCTM();
    if (!ctm || !toSvg || (box.width === 0 && box.height === 0)) return;
    const matrix = toSvg.multiply(ctm);
    [
      [box.x, box.y],
      [box.x + box.width, box.y],
      [box.x, box.y + box.height],
      [box.x + box.width, box.y + box.height],
    ].forEach(([x, y]) => {
      const point = new DOMPoint(x, y).matrixTransform(matrix);
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
  });
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

/** Space kept clear of the drawing when fitting, set in CSS as `--fit-inset-top` and `--fit-inset-right` in px. */
const insetOf = (element: Element, side: 'top' | 'right') =>
  parseFloat(getComputedStyle(element).getPropertyValue(`--fit-inset-${side}`)) || 0;

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
}

const Stage = ({ label, className, style, children }: StageProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const [smooth, setSmooth] = useState(false);
  const [dragging, setDragging] = useState(false);
  const userMoved = useRef(false);
  const lastPointer = useRef<{ x: number; y: number } | null>(null);

  const layoutVersion = useSnapshot((s) => s.layoutVersion);
  const complete = useSnapshot((s) => s.complete);
  const step = useSnapshot((s) => s.step);

  const zoomAround = useCallback((factor: number, cx: number, cy: number, animate: boolean) => {
    userMoved.current = true;
    setSmooth(animate);
    setView((prev) => {
      const k = clamp(prev.k * factor, Math.min(MIN_SCALE, prev.k), MAX_SCALE);
      const ratio = k / prev.k;
      return { k, x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio };
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

  const fit = useCallback((onlyIfOverflowing = false) => {
    const svg = svgRef.current;
    const container = containerRef.current;
    if (!svg || !container) return;
    const box = visibleBounds(svg);
    const { width, height } = container.getBoundingClientRect();
    if (!box || box.width === 0 || box.height === 0 || width === 0) return;
    const insetTop = insetOf(container, 'top');
    const insetRight = insetOf(container, 'right');
    setView((prev) => {
      if (onlyIfOverflowing) {
        const left = prev.x + box.x * prev.k;
        const top = prev.y + box.y * prev.k;
        const right = left + box.width * prev.k;
        const bottom = top + box.height * prev.k;
        const inside =
          left >= 0 && top >= insetTop && right <= width - insetRight && bottom <= height;
        if (inside) return prev;
      }
      const padding = Math.min(FIT_PADDING, width * 0.05);
      const roomX = width - insetRight;
      const roomY = height - insetTop;
      const k = clamp(
        Math.min((roomX - padding * 2) / box.width, (roomY - padding * 2) / box.height),
        MIN_FIT_SCALE,
        1.25
      );
      return {
        k,
        x: roomX / 2 - k * (box.x + box.width / 2),
        y: insetTop + roomY / 2 - k * (box.y + box.height / 2),
      };
    });
    setSmooth(true);
    userMoved.current = false;
  }, []);

  useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => fit()));
    return () => cancelAnimationFrame(id);
  }, [layoutVersion, fit]);

  // Some runs move values outside the start's bounds, like merge sort's working row, so check each step.
  useEffect(() => {
    if (!userMoved.current) fit(true);
  }, [step, complete, fit]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const observer = new ResizeObserver(() => {
      if (!userMoved.current) fit();
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
    userMoved.current = true;
    setSmooth(false);
    setView((prev) => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
  };

  const endDrag = () => {
    lastPointer.current = null;
    setDragging(false);
  };

  const panBy = (dx: number, dy: number) => {
    userMoved.current = true;
    setView((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
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
      setSmooth(true);
      move();
    }
  };

  const stageView: StageView = {
    zoomIn: () => zoomFromCentre(1.2),
    zoomOut: () => zoomFromCentre(1 / 1.2),
    fit: () => fit(),
    scale: view.k,
  };

  return (
    <div className={[styles.frame, className].filter(Boolean).join(' ')} style={style}>
      {/* The engine measures #visualiser-container and draws into #visualiser-canvas. */}
      {/* Focusable so keyboard users can pan and zoom; the zoom buttons cover pointer-free use too. */}
      {/* eslint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      <div
        id="visualiser-container"
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
          id="visualiser-canvas"
          ref={svgRef}
          className={styles.canvas}
          data-smooth={smooth || undefined}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        />
      </div>
      <div id="code-container" className={styles.hiddenCode} aria-hidden="true">
        <svg id="code-canvas" />
      </div>
      {children?.(stageView)}
    </div>
  );
};

export default Stage;
