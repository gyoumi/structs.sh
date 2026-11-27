import { expect, type Page } from '@playwright/test';
import { isRed, readDrawing, type DrawnNode } from './visualiser-drawing';
import { operationLabels, topicLabels, topicTitles, type TopicSlug } from './topics';
import { TransportControls } from './transport-controls';

/**
 * Drives a data structure visualiser the way a user would.
 *
 * Together with `topics.ts` and `drawing.ts`, this is the only code that knows
 * about the visualiser's markup. Tests name operations by the engine's command
 * ("append", "inorderTraversal"), and `topics.ts` maps them to the labels the
 * UI shows.
 *
 * The drawing itself is read from the engine's SVG (#visualiser-canvas), which
 * every version of the UI renders into. The Playback toolbar, timeline and Speed
 * picker are driven through `transport` (`transport-controls.ts`), which /daily
 * shares.
 */
export class VisualiserPage {
  private topic: TopicSlug = 'linked-lists';
  /** Play, Pause, Replay, stepping, Back to the start, Skip to the end and Speed. */
  readonly transport: TransportControls;

  constructor(readonly page: Page) {
    this.transport = new TransportControls(page);
  }

  // ---------------------------------------------------------------- locators

  protected label(command: string): string {
    return topicLabels[this.topic]?.[command] ?? operationLabels[command] ?? command;
  }

  private command(label: string): string {
    const labels = { ...operationLabels, ...topicLabels[this.topic] };
    return Object.keys(labels).find((command) => labels[command] === label) ?? label;
  }

  // ------------------------------------------------------------- navigation

  /**
   * Opens a visualiser, optionally with share-link data: values such as [10, 20, 30] (two digits
   * each), or a raw link segment such as 'empty' or a hash table's 's--12xx23--------------'.
   */
  async open(topic: TopicSlug, data?: number[] | string): Promise<void> {
    this.topic = topic;
    const encoded =
      typeof data === 'string' ? data : (data?.map((value) => String(value).padStart(2, '0')).join('') ?? '');
    const path = `/visualiser/${topic}${encoded ? `/${encoded}` : ''}`;
    await this.page.goto(path);
    await expect(
      this.page.locator('#visualiser-canvas'),
      `${path}: the visualiser drawing (#visualiser-canvas) should be on the page; an unknown topic redirects to /`,
    ).toBeAttached();
    await expect.poll(() => this.operations(), { message: `${path}: the Operations radio group should offer operations` }).not.toEqual([]);
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

  async openDaily(): Promise<void> {
    const link = this.page.getByRole('link', { name: 'Daily', exact: true });
    await expect(
      link,
      `/visualiser/${this.topic}: the top <header> should contain a link named "Daily" (to /daily) beside Debugger`,
    ).toBeVisible();
    await link.click();
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
    await this.transport.skipToEnd();
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

  /** How far through the current animation playback is, rounded, from 0 to 100. */
  async progress(): Promise<number> {
    return this.transport.roundedProgress();
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

  /**
   * Steps the running traversal to its end, and returns the values in the order it visited them.
   * `context` (the page, data, operation and speed) prefixes the error thrown when one step visits several nodes.
   */
  async visitOrder(context?: string): Promise<number[]> {
    const steps = await this.stepThrough();
    const resting = new Map(steps[steps.length - 1].map((node) => [node.value, node.fill]));
    const order: number[] = [];
    for (const [index, step] of steps.entries()) {
      const visited = step.filter((node) => node.fill !== resting.get(node.value) && !order.includes(node.value));
      if (visited.length > 1) {
        const fills = visited.map((node) => `${node.value} fill ${node.fill} (${resting.get(node.value)} once the traversal ends)`);
        throw new Error(
          `${context ? `${context}: ` : ''}Several nodes were visited in one step: ${visited.map((node) => node.value)}. ` +
            `Next step press ${index + 1} of ${steps.length} left ${visited.length} nodes coloured as visited at once (${fills.join('; ')}); ` +
            `each Next step should visit at most one node. Visited in earlier steps: [${order.join(', ')}]`,
        );
      }
      order.push(...visited.map((node) => node.value));
    }
    return order;
  }

  /** Steps the running operation to its end, and returns the drawing after each step. */
  private async stepThrough(): Promise<DrawnNode[][]> {
    const steps: DrawnNode[][] = [];
    while ((await this.progress()) < 100) {
      const before = await this.progress();
      await this.transport.stepForward();
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
