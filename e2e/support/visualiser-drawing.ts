import type { Locator, Page } from '@playwright/test';

/** A value in the drawing, with its circle's computed colours. */
export interface DrawnNode {
  value: number;
  x: number;
  y: number;
  fill: string;
  stroke: string;
}

/** Whether a computed colour such as "rgb(255, 0, 0)" has a red hue. A search marks the nodes it passes in red. */
export const isRed = (colour: string): boolean => {
  const [r, g, b] = (colour.match(/\d+/g) ?? []).map(Number);
  if (r <= Math.max(g, b)) return false;
  const hue = (60 * (g - b)) / (r - Math.min(g, b));
  return Math.abs(hue) < 20;
};

/** The numbered nodes currently visible among `texts`, the `<text>` elements of one drawing. */
export const readDrawnTexts = (texts: Locator): Promise<DrawnNode[]> =>
  texts.evaluateAll((texts) =>
    texts
      .filter((text) => /^\d+$/.test(text.textContent?.trim() ?? ''))
      .filter((text) => {
        // The engine hides removed nodes with opacity="0" rather than deleting them.
        for (let el: Element | null = text; el; el = el.parentElement) {
          const style = getComputedStyle(el);
          if (Number(style.opacity) === 0 || style.visibility === 'hidden' || style.display === 'none') return false;
        }
        return true;
      })
      .map((text) => {
        const box = text.getBoundingClientRect();
        // The engine draws each node's circle just before its value.
        const shape = getComputedStyle(text.previousElementSibling ?? text);
        return { value: Number(text.textContent), x: box.x + box.width / 2, y: box.y, fill: shape.fill, stroke: shape.stroke };
      })
      .filter((node) => node.x !== 0 || node.y !== 0),
  );

/** The numbered nodes currently visible inside `svg`, with coordinates relative to `svg` read atomically. */
export const readSvgDrawnTexts = (svg: Locator): Promise<DrawnNode[]> =>
  svg.evaluate((svgEl) => {
    const origin = svgEl.getBoundingClientRect();
    return Array.from(svgEl.querySelectorAll('text'))
      .filter((text) => /^\d+$/.test(text.textContent?.trim() ?? ''))
      .filter((text) => {
        for (let el: Element | null = text; el; el = el.parentElement) {
          const style = getComputedStyle(el);
          if (Number(style.opacity) === 0 || style.visibility === 'hidden' || style.display === 'none') return false;
        }
        return true;
      })
      .map((text) => {
        const box = text.getBoundingClientRect();
        const shape = getComputedStyle(text.previousElementSibling ?? text);
        return {
          value: Number(text.textContent),
          x: box.x + box.width / 2 - origin.x,
          y: box.y - origin.y,
          fill: shape.fill,
          stroke: shape.stroke,
          zeroRect: box.x === 0 && box.y === 0 && box.width === 0 && box.height === 0,
        };
      })
      .filter((node) => !node.zeroRect)
      .map(({ value, x, y, fill, stroke }) => ({ value, x, y, fill, stroke }));
  });

/** The numbered nodes currently visible in the engine's drawing. */
export const readDrawing = (page: Page): Promise<DrawnNode[]> => readDrawnTexts(page.locator('#visualiser-canvas text'));
