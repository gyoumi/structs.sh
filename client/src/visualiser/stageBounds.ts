import type { DrawingBounds } from '@/visualiser-src/common/AnimationProducer';

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
export const visibleBounds = (svg: SVGSVGElement) => {
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

/** Smallest box enclosing `a` and `b`, or whichever is present. */
export const unionBounds = (
  a: DrawingBounds | null,
  b: DrawingBounds | null
): DrawingBounds | null => {
  if (!a) return b;
  if (!b) return a;
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
};

export const insetOf = (element: Element, side: 'top' | 'right') =>
  parseFloat(getComputedStyle(element).getPropertyValue(`--fit-inset-${side}`)) || 0;

export type FitMode = 'always' | 'if-overflowing';
export type ViewTransition = 'instant' | 'smooth';

export type View =
  | { status: 'unfitted' }
  | { status: 'fitted'; x: number; y: number; scale: number; transition: ViewTransition };

const MIN_FIT_SCALE = 0.05;
const FIT_PADDING = 56;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export interface FitOptions {
  mode: FitMode;
  transition: ViewTransition;
  insetTop: number;
  insetRight: number;
}

/** Computes the transform that fits `box` inside a `width`×`height` viewport. */
export const fitView = (
  prev: View,
  box: DrawingBounds,
  viewport: { width: number; height: number },
  { mode, transition, insetTop, insetRight }: FitOptions
): View => {
  const { width, height } = viewport;
  const availableWidth = width - insetRight;
  const availableHeight = height - insetTop;
  const paddingX = Math.min(FIT_PADDING, availableWidth * 0.05);
  const paddingY = Math.min(FIT_PADDING, availableHeight * 0.08);
  const edgeMarginX = Math.min(12, paddingX * 0.5);
  const edgeMarginY = Math.min(12, paddingY * 0.5);
  if (mode === 'if-overflowing' && prev.status === 'fitted') {
    const left = prev.x + box.x * prev.scale;
    const top = prev.y + box.y * prev.scale;
    const right = left + box.width * prev.scale;
    const bottom = top + box.height * prev.scale;
    const inside =
      left >= edgeMarginX &&
      top >= insetTop + edgeMarginY &&
      right <= width - insetRight - edgeMarginX &&
      bottom <= height - edgeMarginY;
    if (inside) return prev;
  }
  const scale = clamp(
    Math.min(
      (availableWidth - paddingX * 2) / box.width,
      (availableHeight - paddingY * 2) / box.height
    ),
    MIN_FIT_SCALE,
    1.25
  );
  return {
    status: 'fitted',
    scale,
    x: availableWidth / 2 - scale * (box.x + box.width / 2),
    y: insetTop + availableHeight / 2 - scale * (box.y + box.height / 2),
    transition: transition === 'smooth' && prev.status === 'fitted' ? 'smooth' : 'instant',
  };
};
