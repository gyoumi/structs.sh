import { expect, type Locator, type Page } from '@playwright/test';

export type TopicSlug = 'linked-lists' | 'binary-search-trees' | 'avl-trees' | 'sorting-algorithms';

export const topicTitles: Record<TopicSlug, string> = {
  'linked-lists': 'Linked Lists',
  'binary-search-trees': 'Binary Search Trees',
  'avl-trees': 'AVL Trees',
  'sorting-algorithms': 'Sorting Algorithms',
};

/**
 * Drives a data structure visualiser the way a user would.
 *
 * This is the only file that knows about the visualiser's markup. Tests name
 * operations by the engine's command ("append", "inorderTraversal"), so a UI
 * that shows friendlier labels maps them here, not in the tests.
 *
 * The drawing itself is read from the engine's SVG (#visualiser-canvas), which
 * every version of the UI renders into.
 */
export class VisualiserPage {
  constructor(readonly page: Page) {}

  // ---------------------------------------------------------------- locators

  private operationRow(command: string): Locator {
    return this.page
      .locator('li')
      .filter({ has: this.page.getByRole('button', { name: command, exact: true }) });
  }

  private iconButton(testId: string): Locator {
    return this.page.getByRole('button').filter({ has: this.page.getByTestId(testId) });
  }

  private get timeline(): Locator {
    return this.page.locator('#timelineSlider');
  }

  private get speedButton(): Locator {
    return this.iconButton('KeyboardArrowUpIcon');
  }

  // ------------------------------------------------------------- navigation

  /** Opens a visualiser, optionally with share-link data such as [10, 20, 30]. */
  async open(topic: TopicSlug, data?: number[]): Promise<void> {
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
    await this.page.getByRole('button', { name: /^Topic/ }).click();
    await this.page.getByRole('menuitem', { name: topicTitles[topic] }).click();
  }

  async goHome(): Promise<void> {
    await this.page.getByRole('link', { name: /Structs\.sh/ }).click();
  }

  async openDebugger(): Promise<void> {
    await this.page.getByRole('link', { name: 'Debugger' }).click();
  }

  // -------------------------------------------------------------- operations

  /** The engine commands offered for the current topic. */
  async operations(): Promise<string[]> {
    // Collapsed rows hide their Run button, which role queries skip.
    const rows = this.page.locator('li:has(button:text-is("Run"))');
    return rows.evaluateAll((items) =>
      items.map((item) => item.querySelector('button')?.textContent?.trim() ?? ''),
    );
  }

  /** Fills in an operation's arguments, in the engine's order, and runs it. */
  async run(command: string, ...args: (number | string)[]): Promise<void> {
    const row = this.operationRow(command);
    const inputs = row.locator('input');
    if (!(await row.getByRole('button', { name: 'Run' }).isVisible())) {
      await row.getByRole('button', { name: command, exact: true }).click();
    }
    // The row slides open, moving Run; a click before it settles can miss on a slow machine.
    await expect(row.locator('.MuiCollapse-entered')).toBeAttached();
    for (const [index, value] of args.entries()) {
      await inputs.nth(index).fill(String(value));
    }
    await row.getByRole('button', { name: 'Run' }).click();
  }

  /** Runs an operation and skips its animation to the end. */
  async runToEnd(command: string, ...args: (number | string)[]): Promise<void> {
    await this.run(command, ...args);
    await this.skipToEnd();
  }

  /** The error shown for the last operation, or '' if there is none. */
  async operationError(command: string): Promise<string> {
    const error = this.operationRow(command).getByRole('button', { name: 'Run' }).locator('xpath=following-sibling::p');
    return ((await error.textContent()) ?? '').trim();
  }

  async createNew(): Promise<void> {
    await this.page.getByRole('button', { name: 'Create New' }).click();
  }

  async clear(): Promise<void> {
    await this.page.getByRole('button', { name: 'Reset All' }).click();
  }

  /** Copies a link to the current data and returns it. */
  async copyLink(): Promise<string> {
    await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    const button = this.page.getByRole('button', { name: 'Create Link' });
    await expect(button).toBeVisible();
    await button.click();
    return this.page.evaluate(() => navigator.clipboard.readText());
  }

  // ---------------------------------------------------------------- playback

  async play(): Promise<void> {
    await this.iconButton('PlayCircleOutlineIcon').click();
  }

  async pause(): Promise<void> {
    await this.iconButton('PauseCircleOutlineIcon').click();
  }

  async replay(): Promise<void> {
    await this.iconButton('ReplayIcon').click();
  }

  async stepForward(): Promise<void> {
    await this.iconButton('SkipNextIcon').click();
  }

  async stepBack(): Promise<void> {
    await this.iconButton('SkipPreviousIcon').click();
  }

  async rewind(): Promise<void> {
    await this.iconButton('FastRewindIcon').click();
  }

  async skipToEnd(): Promise<void> {
    await this.iconButton('FastForwardIcon').click();
    await expect.poll(() => this.progress()).toBe(100);
  }

  /** Clicks the timeline at a fraction (0 to 1) of its length. */
  async seekTo(fraction: number): Promise<void> {
    const box = await this.timeline.boundingBox();
    if (!box) throw new Error('The timeline is not visible');
    await this.page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
  }

  /** How far through the current animation playback is, from 0 to 100. */
  async progress(): Promise<number> {
    return Number(await this.timeline.inputValue());
  }

  async isPlaying(): Promise<boolean> {
    return this.iconButton('PauseCircleOutlineIcon').isVisible();
  }

  /** The speeds on offer, as multipliers of the default speed. */
  async speeds(): Promise<number[]> {
    await this.speedButton.click();
    const options = await this.page.getByRole('menuitem').allTextContents();
    await this.page.keyboard.press('Escape');
    return options.map(Number);
  }

  async setSpeed(speed: number): Promise<void> {
    await this.speedButton.click();
    await this.page.getByRole('menuitem').filter({ hasText: new RegExp(`^${speed}$`) }).click();
  }

  async speed(): Promise<number> {
    return Number((await this.speedButton.textContent())?.trim());
  }

  // ------------------------------------------------------------------ output

  /** The C code shown for the last operation, one entry per line. */
  async codeLines(): Promise<string[]> {
    const lines = await this.page.locator('#code-canvas text').allTextContents();
    return lines.map((line) => line.trim()).filter(Boolean);
  }

  /** The values in the drawing, left to right (in-order for a tree). */
  async values(): Promise<number[]> {
    return (await this.drawnValues()).sort((a, b) => a.x - b.x || a.y - b.y).map((node) => node.value);
  }

  /** The value at the top of a tree. */
  async root(): Promise<number | undefined> {
    return (await this.drawnValues()).sort((a, b) => a.y - b.y)[0]?.value;
  }

  private drawnValues(): Promise<{ value: number; x: number; y: number }[]> {
    return this.page.locator('#visualiser-canvas text').evaluateAll((texts) =>
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
          return { value: Number(text.textContent), x: box.x + box.width / 2, y: box.y };
        })
        .filter((node) => node.x !== 0 || node.y !== 0),
    );
  }
}
