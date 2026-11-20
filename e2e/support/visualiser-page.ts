import { expect, type Locator, type Page } from '@playwright/test';
import { isRed, readDrawing, type DrawnNode } from './drawing';
import { operationLabels, topicLabels, topicTitles, type TopicSlug } from './topics';

/**
 * Drives a data structure visualiser the way a user would.
 *
 * Together with `topics.ts` and `drawing.ts`, this is the only code that knows
 * about the visualiser's markup. Tests name operations by the engine's command
 * ("append", "inorderTraversal"), and `topics.ts` maps them to the labels the
 * UI shows.
 *
 * The drawing itself is read from the engine's SVG (#visualiser-canvas), which
 * every version of the UI renders into.
 */
export class VisualiserPage {
  private topic: TopicSlug = 'linked-lists';

  constructor(readonly page: Page) {}

  // ---------------------------------------------------------------- locators

  private label(command: string): string {
    return topicLabels[this.topic]?.[command] ?? operationLabels[command] ?? command;
  }

  private command(label: string): string {
    const labels = { ...operationLabels, ...topicLabels[this.topic] };
    return Object.keys(labels).find((command) => labels[command] === label) ?? label;
  }

  private get playback(): Locator {
    return this.page.getByRole('toolbar', { name: 'Playback' });
  }

  private get timeline(): Locator {
    return this.page.getByRole('slider', { name: 'Animation progress' });
  }

  private get speedPicker(): Locator {
    return this.page.getByRole('combobox', { name: 'Speed' });
  }

  // ------------------------------------------------------------- navigation

  /** Opens a visualiser, optionally with share-link data such as [10, 20, 30]. */
  async open(topic: TopicSlug, data?: number[]): Promise<void> {
    this.topic = topic;
    const encoded = data?.map((value) => String(value).padStart(2, '0')).join('') ?? '';
    await this.page.goto(`/visualiser/${topic}${encoded ? `/${encoded}` : ''}`);
    await expect(this.page.locator('#visualiser-canvas')).toBeAttached();
    await expect.poll(() => this.operations()).not.toEqual([]);
    await this.waitForDrawingToSettle();
  }

  /**
   * Waits for the drawing to stop moving. An operation started while the
   * opening animation is still fading nodes in can leave removed nodes visible.
   */
  async waitForDrawingToSettle(): Promise<void> {
    const snapshot = () =>
      this.page.locator('#visualiser-canvas text').evaluateAll((texts) =>
        texts
          .map((text) => {
            const box = text.getBoundingClientRect();
            return `${text.textContent}@${Math.round(box.x)},${Math.round(box.y)}:${getComputedStyle(text).opacity}`;
          })
          .join(' '),
      );
    let previous = '';
    await expect
      .poll(async () => {
        const current = await snapshot();
        const settled = current === previous && !/:0\.\d/.test(current);
        previous = current;
        return settled;
      }, { intervals: [250] })
      .toBe(true);
  }

  async switchTopic(topic: TopicSlug): Promise<void> {
    this.topic = topic;
    const nav = this.page.getByRole('navigation', { name: 'Data structures' });
    const link = nav.getByRole('link', { name: topicTitles[topic] });
    if (await link.isVisible()) {
      await link.click();
    } else {
      await nav.getByRole('button', { name: /more structures/ }).click();
      await this.page.getByRole('menuitem', { name: topicTitles[topic] }).click();
    }
  }

  async goHome(): Promise<void> {
    await this.page.getByRole('link', { name: 'structs.sh home' }).click();
  }

  async openDebugger(): Promise<void> {
    await this.page.getByRole('link', { name: 'Debugger' }).click();
  }

  // -------------------------------------------------------------- operations

  /** The engine commands offered for the current topic. */
  async operations(): Promise<string[]> {
    const labels = await this.page
      .getByRole('radiogroup', { name: 'Operations' })
      .getByRole('radio')
      .allTextContents();
    return labels.map((label) => this.command(label.trim()));
  }

  /** Fills in an operation's arguments, in the engine's order, and runs it. */
  async run(command: string, ...args: (number | string)[]): Promise<void> {
    const label = this.label(command);
    await this.page.getByRole('radio', { name: label, exact: true }).click();
    const ops = this.page.getByRole('region', { name: 'Operations' });
    const inputs = ops.getByRole('textbox');
    for (const [index, value] of args.entries()) {
      await inputs.nth(index).fill(String(value));
    }
    await ops.getByRole('button', { name: `Run ${label.toLowerCase()}` }).click();
  }

  /** Runs an operation and skips its animation to the end. */
  async runToEnd(command: string, ...args: (number | string)[]): Promise<void> {
    await this.run(command, ...args);
    await this.skipToEnd();
  }

  /** The error shown for the last operation, or '' if there is none. */
  async operationError(_command: string): Promise<string> {
    const error = this.page.getByRole('region', { name: 'Operations' }).getByRole('status');
    return ((await error.textContent()) ?? '').trim();
  }

  async createNew(): Promise<void> {
    await this.page.getByRole('button', { name: /^New / }).click();
  }

  async clear(): Promise<void> {
    await this.page.getByRole('button', { name: 'Clear' }).click();
  }

  /** Copies a link to the current data and returns it. */
  async copyLink(): Promise<string> {
    await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await this.page.getByRole('button', { name: 'Copy link' }).click();
    await expect(this.page.getByText('Link copied')).toBeVisible();
    return this.page.evaluate(() => navigator.clipboard.readText());
  }

  // ---------------------------------------------------------------- playback

  async play(): Promise<void> {
    await this.playback.getByRole('button', { name: 'Play' }).click();
  }

  async pause(): Promise<void> {
    await this.playback.getByRole('button', { name: 'Pause' }).click();
  }

  async replay(): Promise<void> {
    await this.playback.getByRole('button', { name: 'Replay' }).click();
  }

  async stepForward(): Promise<void> {
    await this.playback.getByRole('button', { name: 'Next step' }).click();
  }

  async stepBack(): Promise<void> {
    await this.playback.getByRole('button', { name: 'Previous step' }).click();
  }

  async rewind(): Promise<void> {
    await this.playback.getByRole('button', { name: 'Back to the start' }).click();
  }

  async skipToEnd(): Promise<void> {
    await this.playback.getByRole('button', { name: 'Skip to the end' }).click();
    await expect.poll(() => this.progress()).toBe(100);
  }

  /** Clicks the timeline at a fraction (0 to 1) of its length. */
  async seekTo(fraction: number): Promise<void> {
    const track = this.page.locator('[data-slot="slider-control"]').filter({ has: this.timeline });
    const box = await track.boundingBox();
    if (!box) throw new Error('The timeline is not visible');
    await this.page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
  }

  /** How far through the current animation playback is, from 0 to 100. */
  async progress(): Promise<number> {
    return Math.round(Number(await this.timeline.inputValue()));
  }

  async isPlaying(): Promise<boolean> {
    return this.playback.getByRole('button', { name: 'Pause' }).isVisible();
  }

  /** The speeds on offer, as multipliers of the default speed. */
  async speeds(): Promise<number[]> {
    await this.speedPicker.click();
    const options = await this.page.getByRole('option').allTextContents();
    await this.page.keyboard.press('Escape');
    return options.map((option) => parseFloat(option));
  }

  async setSpeed(speed: number): Promise<void> {
    await this.speedPicker.click();
    await this.page.getByRole('option', { name: `${speed}×`, exact: true }).click();
  }

  async speed(): Promise<number> {
    return parseFloat((await this.speedPicker.textContent()) ?? '');
  }

  // ------------------------------------------------------------------ output

  /** The C code shown for the last operation, one entry per line. */
  async codeLines(): Promise<string[]> {
    const list = this.page.getByRole('list', { name: 'Code for this operation' });
    if (!(await list.isVisible())) return [];
    const lines = await list.locator('code').allTextContents();
    return lines.map((line) => line.trim()).filter(Boolean);
  }

  /** The values in the drawing, left to right (in-order for a tree). */
  async values(): Promise<number[]> {
    return (await readDrawing(this.page)).sort((a, b) => a.x - b.x || a.y - b.y).map((node) => node.value);
  }

  /** The value at the top of a tree. */
  async root(): Promise<number | undefined> {
    return (await readDrawing(this.page)).sort((a, b) => a.y - b.y)[0]?.value;
  }

  /** Steps the running search to its end, and returns the values it marked as found. */
  async foundValues(): Promise<number[]> {
    const steps = await this.stepThrough();
    const resting = new Map(steps[steps.length - 1].map((node) => [node.value, node.stroke]));
    const found = steps.flat().filter((node) => node.stroke !== resting.get(node.value) && !isRed(node.stroke));
    return [...new Set(found.map((node) => node.value))];
  }

  /** Steps the running traversal to its end, and returns the values in the order it visited them. */
  async visitOrder(): Promise<number[]> {
    const steps = await this.stepThrough();
    const resting = new Map(steps[steps.length - 1].map((node) => [node.value, node.fill]));
    const order: number[] = [];
    for (const step of steps) {
      const visited = step.filter((node) => node.fill !== resting.get(node.value) && !order.includes(node.value));
      if (visited.length > 1) throw new Error(`Several nodes were visited in one step: ${visited.map((node) => node.value)}`);
      order.push(...visited.map((node) => node.value));
    }
    return order;
  }

  /** Steps the running operation to its end, and returns the drawing after each step. */
  private async stepThrough(): Promise<DrawnNode[][]> {
    const steps: DrawnNode[][] = [];
    while ((await this.progress()) < 100) {
      const before = await this.progress();
      await this.stepForward();
      await expect.poll(() => this.progress()).not.toBe(before);
      await this.waitForProgressToSettle();
      steps.push(await readDrawing(this.page));
    }
    return steps;
  }

  private async waitForProgressToSettle(): Promise<void> {
    let previous = -1;
    await expect
      .poll(async () => {
        const now = await this.progress();
        const still = now === previous;
        previous = now;
        return still;
      }, { intervals: [150] })
      .toBe(true);
  }
}
