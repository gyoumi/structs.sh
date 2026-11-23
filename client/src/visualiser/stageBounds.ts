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

export const insetOf = (element: Element, side: 'top' | 'right') =>
  parseFloat(getComputedStyle(element).getPropertyValue(`--fit-inset-${side}`)) || 0;
