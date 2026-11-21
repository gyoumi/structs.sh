import { expect, type Locator } from '@playwright/test';

/** A pointer-name label and the value of the node it is drawn beside, or null if it is beside none. */
export type PointerLabel = { name: string; node: string | null };

/** One step's drawing: the highlighted line, every label, and the labels that are node values. */
export type DrawnStep = { line: number | null; labels: string[]; nodes: string[] };

type LabelWithOpacity = { text: string; opacity: number };
type LabelWithPlace = LabelWithOpacity & { x: number; y: number };

/** How far apart, in pixels, two label centres can be and still count as one column. */
const SAME_COLUMN_PX = 4;

/**
 * The labels that are node values: a number, or "??" for a node whose value
 * isn't set yet. The others are pointer names ("list", "head, n").
 */
export const nodeValues = (labels: string[]): string[] =>
  labels.filter((label) => /^(-?\d+|\?\?)$/.test(label));

/**
 * Reads what the visual debugger's visualiser has drawn. DebuggerPage uses it;
 * tests go through DebuggerPage.
 */
export class Drawing {
  constructor(private readonly visualiser: Locator) {}

  /** Labels drawn in the visualiser: node values and pointer names. */
  async labels(): Promise<string[]> {
    return this.visualiser.locator('svg text').allTextContents();
  }

  /**
   * The labels a user can see once the drawing has stopped changing. The
   * visualiser redraws a moment after a step and fades nodes in and out, and
   * a node it hides stays in the page at opacity 0, so this counts a label
   * only when it is at least half opaque. Settled means the same labels, at
   * the same opacity, in reads `stableMs` apart.
   */
  async settledVisibleLabels(stableMs = 500, timeoutMs = 10_000): Promise<string[]> {
    const settled = await this.settled(() => this.labelsWithOpacity(), stableMs, timeoutMs, 'changing', ' and opacities');
    return settled.filter(({ opacity }) => opacity >= 0.5).map(({ text }) => text);
  }

  /**
   * The pointer names drawn once the drawing has stopped moving, each with
   * the node it points at, sorted by name. The visualiser draws a pointer as
   * an arrow below its node with the name under it, so a name belongs to the
   * nearest node above it in its column. Labels whose centres are within
   * SAME_COLUMN_PX share a column: one digit's box can sit a pixel off
   * another's. Names stacked for one node ("head," over "n") each count,
   * without the comma.
   */
  async settledPointerLabels(stableMs = 500, timeoutMs = 10_000): Promise<PointerLabel[]> {
    const settled = await this.settled(() => this.labelsWithPlace(), stableMs, timeoutMs, 'moving', '');
    const visible = settled.filter(({ opacity }) => opacity >= 0.5);
    const isNode = (text: string) => nodeValues([text]).length === 1;
    const nodes = visible.filter(({ text }) => isNode(text));
    return visible
      .filter(({ text }) => !isNode(text) && text.trim() !== '')
      .map((label) => {
        const above = nodes.filter((node) => node.y < label.y);
        const nearestX = Math.min(...above.map((node) => Math.abs(node.x - label.x)));
        const owner = above
          .filter((node) => Math.abs(node.x - label.x) <= nearestX + SAME_COLUMN_PX)
          .sort((a, b) => b.y - a.y)[0];
        return { name: label.text.replace(/,$/, ''), node: owner?.text ?? null };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Reads `read` every `stableMs` until two reads in a row match, and returns
   * that read. Both start unread, so settling takes two real reads.
   */
  private async settled<T>(
    read: () => Promise<T>,
    stableMs: number,
    timeoutMs: number,
    kept: string,
    what: string,
  ): Promise<T> {
    let previous: string | undefined;
    let current: string | undefined;
    try {
      await expect
        .poll(
          async () => {
            previous = current;
            current = JSON.stringify(await read());
            return previous !== undefined && current === previous;
          },
          { intervals: [stableMs], timeout: timeoutMs },
        )
        .toBe(true);
    } catch {
      throw new Error(`the visualiser's drawing kept ${kept} for ${timeoutMs}ms; last labels${what}: ${current}`);
    }
    return JSON.parse(current ?? '[]') as T;
  }

  /**
   * Each label in the visualiser with how opaque it is, counting its
   * ancestors' opacity, rounded to 0.01. Hidden or undisplayed counts as 0.
   */
  private async labelsWithOpacity(): Promise<LabelWithOpacity[]> {
    return this.visualiser.locator('svg text').evaluateAll((labels) =>
      labels.map((label) => {
        let opacity = 1;
        for (let el: Element | null = label; el; el = el.parentElement) {
          const style = getComputedStyle(el);
          opacity *= style.display === 'none' || style.visibility === 'hidden' ? 0 : Number(style.opacity);
        }
        return { text: label.textContent ?? '', opacity: Math.round(opacity * 100) / 100 };
      }),
    );
  }

  /** Each label with its opacity (as in labelsWithOpacity) and the centre of its box on screen, rounded to 1px. */
  private async labelsWithPlace(): Promise<LabelWithPlace[]> {
    return this.visualiser.locator('svg text').evaluateAll((labels) =>
      labels.map((label) => {
        let opacity = 1;
        for (let el: Element | null = label; el; el = el.parentElement) {
          const style = getComputedStyle(el);
          opacity *= style.display === 'none' || style.visibility === 'hidden' ? 0 : Number(style.opacity);
        }
        const box = label.getBoundingClientRect();
        return {
          text: label.textContent ?? '',
          opacity: Math.round(opacity * 100) / 100,
          x: Math.round(box.x + box.width / 2),
          y: Math.round(box.y + box.height / 2),
        };
      }),
    );
  }
}
