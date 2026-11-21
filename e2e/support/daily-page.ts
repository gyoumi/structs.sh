import { expect, type Locator, type Page } from '@playwright/test';
import type { DailyPuzzle } from './daily-fixtures';

export interface SlotBounds {
  index: number;
  value: number;
  x: number;
  width: number;
}

export interface StepReading {
  step: number;
  before: number;
  after: number;
  progress: number;
}

/**
 * Drives the /daily puzzle page using only ARIA roles and accessible names.
 *
 * See "The daily game" in e2e/README.md for the page contract these locators rely on.
 */
export class DailyPage {
  constructor(readonly page: Page) {}

  // ---------------------------------------------------------------- locators

  private get rulesRegion(): Locator {
    return this.page.getByRole('region', { name: 'Puzzle rules' });
  }

  private get arrayGroup(): Locator {
    return this.page.getByRole('group', { name: 'Puzzle array' });
  }

  private get slots(): Locator {
    return this.arrayGroup.getByRole('button');
  }

  private slot(index: number): Locator {
    return this.slots.nth(index);
  }

  private get runButton(): Locator {
    return this.page.getByRole('button', { name: 'Run', exact: true });
  }

  private get skipButton(): Locator {
    return this.page.getByRole('button', { name: 'Skip', exact: true });
  }

  private get shareButton(): Locator {
    return this.page.getByRole('button', { name: 'Share', exact: true });
  }

  private get playback(): Locator {
    return this.page.getByRole('toolbar', { name: 'Playback' });
  }

  private get timeline(): Locator {
    return this.page.getByRole('slider', { name: 'Animation progress' });
  }

  private status(name: string): Locator {
    return this.page.getByRole('status', { name, exact: true });
  }

  // -------------------------------------------------------- setup / opening

  /** Serves `puzzle` in response to GET /puzzles/today.json. */
  async serve(puzzle: DailyPuzzle): Promise<void> {
    await this.page.route('**/puzzles/today.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(puzzle),
      }),
    );
  }

  /** Opens /daily and waits for the puzzle array to appear. */
  async open(): Promise<void> {
    await this.page.goto('/daily');
    await expect(this.arrayGroup, '/daily should render the Puzzle array group').toBeVisible();
    await expect(this.slots.first(), '/daily should render slot buttons inside Puzzle array').toBeVisible();
  }

  // --------------------------------------------------------------- reading

  async rulesText(): Promise<string> {
    await expect(this.rulesRegion, '/daily should show a Puzzle rules region').toBeVisible();
    return ((await this.rulesRegion.textContent()) ?? '').replace(/\s+/g, ' ').trim();
  }

  /** The values shown in Puzzle array from left to right. */
  async values(): Promise<number[]> {
    const count = await this.slots.count();
    const result: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const text = ((await this.slot(i).textContent()) ?? '').trim();
      const match = text.match(/-?\d+/);
      if (!match) throw new Error(`Expected slot ${i} in Puzzle array to start with a number, got "${text}"`);
      result.push(Number(match[0]));
    }
    return result;
  }

  /** Bounding boxes of every slot button in Puzzle array, left to right. */
  async slotBounds(): Promise<SlotBounds[]> {
    const count = await this.slots.count();
    const bounds: SlotBounds[] = [];
    for (let i = 0; i < count; i += 1) {
      const slot = this.slot(i);
      const box = await slot.boundingBox();
      if (!box) throw new Error(`Slot ${i} in Puzzle array has no bounding box`);
      const text = ((await slot.textContent()) ?? '').trim();
      const match = text.match(/-?\d+/);
      if (!match) throw new Error(`Expected slot ${i} in Puzzle array to start with a number, got "${text}"`);
      bounds.push({ index: i, value: Number(match[0]), x: box.x, width: box.width });
    }
    return bounds;
  }

  /** 0-based indices of slots marked disabled (fixed). */
  async fixedIndices(): Promise<number[]> {
    const count = await this.slots.count();
    const fixed: number[] = [];
    for (let i = 0; i < count; i += 1) {
      if (await this.slot(i).isDisabled()) fixed.push(i);
    }
    return fixed;
  }

  /** 0-based indices of slots currently selected (`aria-pressed="true"`). */
  async selectedIndices(): Promise<number[]> {
    const count = await this.slots.count();
    const selected: number[] = [];
    for (let i = 0; i < count; i += 1) {
      if ((await this.slot(i).getAttribute('aria-pressed')) === 'true') selected.push(i);
    }
    return selected;
  }

  async par(): Promise<number> {
    return this.readNumber(this.status('Par'), 'Par status');
  }

  async counter(): Promise<number> {
    return this.readNumber(this.status('Comparisons'), 'Comparisons counter');
  }

  async score(): Promise<number> {
    return this.readNumber(this.status('Score'), 'Score status');
  }

  async triesLeft(): Promise<number> {
    return this.readNumber(this.status('Tries left'), 'Tries left status');
  }

  async best(): Promise<number> {
    return this.readNumber(this.status('Best'), 'Best status');
  }

  async bestVisible(): Promise<boolean> {
    return this.status('Best').isVisible();
  }

  async parReached(): Promise<boolean> {
    return this.status('Par reached').isVisible();
  }

  async bestReached(): Promise<boolean> {
    return this.status('Best reached').isVisible();
  }

  async canRun(): Promise<boolean> {
    return (await this.runButton.isVisible()) && (await this.runButton.isEnabled());
  }

  async canShare(): Promise<boolean> {
    return (await this.shareButton.isVisible()) && (await this.shareButton.isEnabled());
  }

  async progress(): Promise<number> {
    return Math.round(Number(await this.timeline.inputValue()));
  }

  // --------------------------------------------------------------- editing

  async select(index: number): Promise<void> {
    await this.slot(index).click();
  }

  async swap(first: number, second: number): Promise<void> {
    await this.slot(first).click();
    await this.slot(second).click();
  }

  /** Swaps two slots using touch tap events (for mobile viewports). */
  async tapSwap(first: number, second: number): Promise<void> {
    await this.slot(first).tap();
    await this.slot(second).tap();
  }

  /** Clicks the center of a slot by coordinates so disabled/fixed slots can be clicked like a user would. */
  async trySelectFixed(index: number): Promise<void> {
    const box = await this.slot(index).boundingBox();
    if (!box) throw new Error(`Slot ${index} has no bounding box`);
    await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  /** Taps the center of a slot by coordinates so disabled/fixed slots can be tapped on touch viewports. */
  async tryTapFixed(index: number): Promise<void> {
    const box = await this.slot(index).boundingBox();
    if (!box) throw new Error(`Slot ${index} has no bounding box`);
    await this.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }

  /** Focuses a free slot and selects it from the keyboard with Enter. */
  async keyboardSelect(index: number): Promise<void> {
    await this.slot(index).focus();
    await this.page.keyboard.press('Enter');
  }

  async keyboardMove(direction: 'ArrowLeft' | 'ArrowRight'): Promise<void> {
    await this.page.keyboard.press(direction);
  }

  // -------------------------------------------------------------- playback

  async run(): Promise<void> {
    await this.runButton.click();
  }

  async skip(): Promise<void> {
    await this.skipButton.click();
    await expect.poll(() => this.progress(), { message: 'Skip should advance Animation progress to 100' }).toBe(100);
  }

  async waitForRunToFinish(timeout = 60_000): Promise<void> {
    await expect
      .poll(() => this.progress(), { intervals: [100], timeout, message: 'Run should animate to Animation progress 100' })
      .toBe(100);
  }

  async pausePlayback(): Promise<void> {
    await this.playback.getByRole('button', { name: 'Pause' }).click();
  }

  async rewind(): Promise<void> {
    await this.playback.getByRole('button', { name: 'Back to the start' }).click();
    await expect
      .poll(() => this.rawProgress(), { message: 'Back to the start should move Animation progress to 0' })
      .toBe(0);
    await this.waitTwoFrames();
  }

  async stepForward(): Promise<void> {
    await this.playback.getByRole('button', { name: 'Next step' }).click();
  }

  /**
   * Clicks Next step, waits for playback to pause and for both Animation progress
   * and Comparisons counter to settle, then returns the readings.
   */
  async stepForwardAndSettle(): Promise<{ counter: number; progress: number; atEnd: boolean }> {
    const pauseButton = this.playback.getByRole('button', { name: 'Pause' });
    await this.stepForward();
    await this.waitTwoFrames();
    await expect(pauseButton, 'Next step should pause again after finishing a step').toBeHidden();
    let prevProgress = await this.rawProgress();
    let prevCounter = await this.counter();
    await expect
      .poll(
        async () => {
          await this.waitTwoFrames();
          const playing = await pauseButton.isVisible();
          const progress = await this.rawProgress();
          const counter = await this.counter();
          const settled = !playing && progress === prevProgress && counter === prevCounter;
          prevProgress = progress;
          prevCounter = counter;
          return settled;
        },
        { intervals: [50], message: 'Animation progress and Comparisons counter should settle after Next step' },
      )
      .toBe(true);
    const atEnd =
      prevProgress >= 100 || (await this.playback.getByRole('button', { name: 'Replay' }).isVisible());
    return { counter: prevCounter, progress: prevProgress, atEnd };
  }

  /**
   * Presses Next step repeatedly until the timeline reaches the end or `maxSteps` is hit,
   * waiting for the timeline and counter to settle after each step and invoking `onStep`.
   */
  async stepToEnd(
    maxSteps: number,
    onStep: (reading: StepReading) => void,
  ): Promise<{ steps: number; counter: number; atEnd: boolean }> {
    let previousCounter = await this.counter();
    let atEnd = false;
    let steps = 0;
    while (!atEnd && steps < maxSteps) {
      steps += 1;
      const settled = await this.stepForwardAndSettle();
      onStep({ step: steps, before: previousCounter, after: settled.counter, progress: settled.progress });
      previousCounter = settled.counter;
      atEnd = settled.atEnd;
    }
    return { steps, counter: previousCounter, atEnd };
  }

  async stepBack(): Promise<void> {
    await this.playback.getByRole('button', { name: 'Previous step' }).click();
  }

  /**
   * Clicks Previous step until the comparison counter drops below `from` (up to `maxSteps` times,
   * to step past any trailing non-comparison frames such as the final swap or solved highlight).
   */
  async stepBackUntilCounterDrops(
    from: number,
    maxSteps = 20,
  ): Promise<{ counter: number; progress: number; steps: number }> {
    let counter = await this.counter();
    let progress = await this.progress();
    for (let steps = 1; steps <= maxSteps; steps += 1) {
      await this.stepBack();
      await this.waitTwoFrames();
      counter = await this.counter();
      progress = await this.progress();
      if (counter < from) return { counter, progress, steps };
    }
    return { counter, progress, steps: maxSteps };
  }

  /** Clicks Share, grants clipboard permissions, and returns the copied share text. */
  async shareText(): Promise<string> {
    await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await this.shareButton.click();
    let copied = '';
    await expect
      .poll(
        async () => {
          copied = await this.page.evaluate(() => navigator.clipboard.readText());
          return copied;
        },
        { message: 'Clicking Share should copy non-empty share text to the clipboard' },
      )
      .not.toBe('');
    return copied;
  }

  // --------------------------------------------------------------- helpers

  private async rawProgress(): Promise<number> {
    return Number(await this.timeline.inputValue());
  }

  private async readNumber(locator: Locator, label: string): Promise<number> {
    await expect(locator, `${label} should be visible`).toBeVisible();
    const text = ((await locator.textContent()) ?? '').trim();
    const match = text.match(/-?\d+/);
    if (!match) throw new Error(`Expected ${label} to contain a number, got "${text}"`);
    return Number(match[0]);
  }

  private async waitTwoFrames(): Promise<void> {
    await this.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
  }
}
