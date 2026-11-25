import { expect, type Locator, type Page } from '@playwright/test';
import type { DailyStageView } from './daily-stage-view';

/**
 * One drawn number on a stage, where the player sees it: the centre of its shape (the circle or bar drawn
 * just before the number, or the number itself) relative to the stage's top-left corner, in CSS pixels.
 */
export interface PlacedNode {
  value: number;
  x: number;
  y: number;
  /** The on-screen width of the node's shape (a list node's circle), in CSS pixels. */
  width: number;
  /** The on-screen height of the number's text box, in CSS pixels. */
  height: number;
  /** The node's shape lies wholly inside the stage's box (within 1px). */
  inside: boolean;
  /** The number's computed fill colour. */
  fill: string;
}

/** What one stage shows at one moment. */
export interface StageFrame {
  stage: { width: number; height: number };
  /** Every visible drawn number, left to right. */
  nodes: PlacedNode[];
  /**
   * The linked list's `curr` pointer, when it is shown: the node it points at (the drawn node nearest it
   * left to right) and whether that node is inside the stage. Null when no `curr` is shown.
   */
  walked: { value: number; inside: boolean } | null;
}

/** Reads a stage (`role="application"` drawing) in the page. Passed to `evaluate`, so it must be self-contained. */
function readStage(app: Element): StageFrame {
  const round = (n: number) => Math.round(n * 10) / 10;
  const box = app.getBoundingClientRect();
  const svg = app.querySelector('svg');
  const shown = (el: Element) => {
    for (let node: Element | null = el; node && node !== svg; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (Number(style.opacity) === 0 || style.visibility === 'hidden' || style.display === 'none') return false;
    }
    return true;
  };
  const inside = (b: DOMRect) => b.left >= box.left - 1 && b.right <= box.right + 1 && b.top >= box.top - 1 && b.bottom <= box.bottom + 1;
  const nodes: PlacedNode[] = Array.from(svg?.querySelectorAll('text') ?? [])
    .filter((text) => /^\d+$/.test(text.textContent?.trim() ?? '') && shown(text))
    .map((text) => {
      const before = text.previousElementSibling;
      const shape = before && /^(circle|ellipse|rect)$/i.test(before.tagName) && shown(before) ? before : text;
      const b = shape.getBoundingClientRect();
      return {
        value: Number(text.textContent?.trim()),
        x: round(b.x + b.width / 2 - box.x),
        y: round(b.y + b.height / 2 - box.y),
        width: round(b.width),
        height: round(text.getBoundingClientRect().height),
        inside: inside(b),
        fill: getComputedStyle(text).fill,
        empty: b.width === 0 && b.height === 0,
      };
    })
    .filter((node) => !node.empty)
    .map(({ empty: _empty, ...node }) => node)
    .sort((a, b) => a.x - b.x || a.y - b.y);
  let walked: StageFrame['walked'] = null;
  const pointer = svg?.querySelector('#current');
  if (pointer && shown(pointer) && nodes.length > 0) {
    const p = pointer.getBoundingClientRect();
    const px = p.x + p.width / 2 - box.x;
    const nearest = nodes.reduce((best, node) => (Math.abs(node.x - px) < Math.abs(best.x - px) ? node : best));
    walked = { value: nearest.value, inside: nearest.inside };
  }
  return { stage: { width: round(box.width), height: round(box.height) }, nodes, walked };
}

/** `5@120,88 w24` for each node, for failure messages. */
export const describeNodes = (nodes: readonly PlacedNode[]): string =>
  nodes.map((n) => `${n.value}@${Math.round(n.x)},${Math.round(n.y)} w${n.width}${n.inside ? '' : ' (off-stage)'}`).join(' ');

/**
 * How `after` differs from `before` as the player sees it: a number missing, or drawn more than `tolerance`
 * pixels from where it was, or its text more than 3% bigger or smaller (zoom). Empty when the same.
 */
const placementDifferences = (before: readonly PlacedNode[], after: readonly PlacedNode[], tolerance = 3): string[] => {
  const now = new Map(after.map((node) => [node.value, node]));
  const differences: string[] = [];
  for (const was of before) {
    const is = now.get(was.value);
    if (!is) differences.push(`${was.value} was drawn at ${Math.round(was.x)},${Math.round(was.y)} and is no longer drawn`);
    else if (Math.abs(was.x - is.x) > tolerance || Math.abs(was.y - is.y) > tolerance || Math.abs(was.height - is.height) > was.height * 0.03) {
      differences.push(
        `${was.value} moved from ${Math.round(was.x)},${Math.round(was.y)} (text ${was.height}px tall) to ${Math.round(is.x)},${Math.round(is.y)} (text ${is.height}px tall)`,
      );
    }
  }
  return differences;
};

/**
 * Where a stage draws its numbers on screen, and the player's own pan and zoom of it: dragging the drawing,
 * the mouse wheel, and the visualiser's `Zoom in` button. Works on /daily and the visualiser pages, whose
 * stages are elements with `role="application"` and `aria-roledescription="drawing"`.
 */
export class StageGeometry {
  constructor(
    readonly page: Page,
    private readonly index = 0,
  ) {}

  private get stage(): Locator {
    return this.page.locator('[role="application"][aria-roledescription="drawing"]').nth(this.index);
  }

  private get playing(): Locator {
    return this.page.getByRole('toolbar', { name: 'Playback' }).getByRole('button', { name: 'Pause', exact: true });
  }

  /** What the stage shows now. */
  async frame(): Promise<StageFrame> {
    await expect(this.stage, 'the page should draw a stage (an element with role="application" and aria-roledescription="drawing")').toBeVisible();
    return this.stage.evaluate(readStage);
  }

  /** Waits until playback isn't playing and the drawing stops moving (two equal reads 150 ms apart), then returns it. */
  async settled(context: string): Promise<StageFrame> {
    let previous = '';
    let frame: StageFrame | null = null;
    await expect
      .poll(
        async () => {
          const playing = await this.playing.isVisible();
          frame = await this.frame();
          const now = JSON.stringify(frame);
          const still = !playing && now === previous;
          previous = now;
          return still;
        },
        { intervals: [150], timeout: 20_000, message: `${context}: playback should be paused or ended and the stage's drawing should stop moving` },
      )
      .toBe(true);
    if (!frame) throw new Error(`${context}: the stage was never read`);
    return frame;
  }

  /** Drags the drawing by (`dx`, `dy`) pixels with the mouse, starting at the stage's centre. */
  async drag(dx: number, dy: number): Promise<void> {
    const { x, y } = await this.centre();
    await this.page.mouse.move(x, y);
    await this.page.mouse.down();
    await this.page.mouse.move(x + dx, y + dy, { steps: 8 });
    await this.page.mouse.up();
  }

  /** Turns the mouse wheel over the stage's centre (negative `deltaY` zooms in). */
  async wheel(deltaY: number): Promise<void> {
    const { x, y } = await this.centre();
    await this.page.mouse.move(x, y);
    await this.page.mouse.wheel(0, deltaY);
  }

  /** Clicks the visualiser's `Zoom in` button (the /daily stage has none). */
  async clickZoomIn(context: string): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Zoom in', exact: true });
    await expect(button, `${context}: the visualiser should show a "Zoom in" button by the drawing`).toBeVisible();
    await button.click();
  }

  private async centre(): Promise<{ x: number; y: number }> {
    await this.stage.scrollIntoViewIfNeeded();
    const box = await this.stage.boundingBox();
    if (!box) throw new Error('the stage has no bounding box');
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
}

/** A player's pan and zoom of a stage: `how` says what was done, for failure messages. */
export interface PanAndZoom {
  how: string;
  apply: (stage: StageGeometry, context: string) => Promise<void>;
}

/**
 * Pans and zooms the stage with `zoom`, then switches light to dark: every drawn number should stay where the
 * pan and zoom put it, and the step readout as it was. Works on /daily and the visualiser pages.
 */
export async function expectPanAndZoomSurviveSwitch(stage: StageGeometry, view: DailyStageView, zoom: PanAndZoom, context: string): Promise<void> {
  const fitted = await stage.settled(`${context}, before panning`);
  const moved = `${context}, ${zoom.how}`;
  await zoom.apply(stage, moved);
  const panned = await stage.settled(moved);
  expect(
    placementDifferences(fitted.nodes, panned.nodes),
    `${moved}: panning and zooming should move the drawing, or this test checks nothing (drawn before: ${describeNodes(fitted.nodes)})`,
  ).not.toEqual([]);
  const step = await view.stepText(moved);
  const [{ background }] = await view.looks();

  const switched = `${moved}, then switching light to dark`;
  await view.switchTheme('dark', switched);
  await view.expectStageBackgroundChanged(background, `${switched}: the drawing should redraw in dark`);
  const after = await stage.settled(switched);
  expect(
    placementDifferences(panned.nodes, after.nodes),
    `${switched}: every drawn number should stay where the player's pan and zoom put it (within 3px, same size). Numbers back where the stage first fitted them (${describeNodes(fitted.nodes)}) mean the switch dropped the pan and zoom`,
  ).toEqual([]);
  await view.expectStepText(step, `${switched}: the playback should stay at "${step}"`);
}
