import { expect, type Locator, type Page } from '@playwright/test';
import type { DailyPuzzle } from './daily-fixtures';
import { readDrawing } from './visualiser-drawing';

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

  async expectRulesToContain(expected: string, context: string): Promise<void> {
    await expect(this.rulesRegion, `${context}: /daily should show a Puzzle rules region`).toBeVisible();
    await expect(
      this.rulesRegion,
      `${context}: Puzzle rules region should contain "${expected}"`,
    ).toContainText(expected);
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

  /** Scrolls Puzzle array vertically into view (keeping scrollX at 0) and asserts every slot button fits fully in the viewport without clipping. */
  async expectAllSlotsInViewport(context: string, expectedCount: number): Promise<void> {
    await this.arrayGroup.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const offset = Math.max(0, (window.innerHeight - rect.height) / 2);
      window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - offset), left: 0, behavior: 'instant' });
    });
    const scrollX = await this.page.evaluate(() => window.scrollX);
    expect(
      scrollX,
      `${context}: window.scrollX should remain 0 after vertically scrolling Puzzle array into view`,
    ).toBe(0);
    await expect(this.slots, `${context}: Puzzle array should render all ${expectedCount} slots`).toHaveCount(
      expectedCount,
    );
    for (let i = 0; i < expectedCount; i += 1) {
      const slot = this.slot(i);
      const text = ((await slot.textContent()) ?? '').trim();
      const match = text.match(/-?\d+/);
      const value = match ? match[0] : text;
      await expect(
        slot,
        `${context}: slot ${i} (value ${value}) in Puzzle array must be fully visible in the viewport without clipping or horizontal overflow`,
      ).toBeInViewport({ ratio: 1 });
    }
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

  /** 0-based index of the focused slot in Puzzle array, or null if no slot has focus. */
  async focusedSlotIndex(): Promise<number | null> {
    const count = await this.slots.count();
    for (let i = 0; i < count; i += 1) {
      if (await this.slot(i).evaluate((el) => el === document.activeElement)) return i;
    }
    return null;
  }

  /** The values drawn in the sorting visualiser's #visualiser-canvas SVG, left to right. */
  async drawnValues(): Promise<number[]> {
    return (await readDrawing(this.page)).sort((a, b) => a.x - b.x || a.y - b.y).map((node) => node.value);
  }

  async par(context?: string): Promise<number> {
    return this.readNumber(this.status('Par'), 'Par status', context);
  }

  async counter(context?: string): Promise<number> {
    return this.readNumber(this.status('Comparisons'), 'Comparisons counter', context);
  }

  async score(context?: string): Promise<number> {
    return this.readNumber(this.status('Score'), 'Score status', context);
  }

  async triesLeft(context?: string): Promise<number> {
    return this.readNumber(this.status('Tries left'), 'Tries left status', context);
  }

  async best(context?: string): Promise<number> {
    return this.readNumber(this.status('Best'), 'Best status', context);
  }

  /** Auto-retrying assertion that a named status readout is visible and its first number is `expected`. */
  async expectStatusNumber(name: string, expected: number, message: string): Promise<void> {
    const locator = this.status(name);
    await expect(locator, message).toBeVisible();
    await expect(
      locator,
      `${message} (the first number in the "${name}" readout must be ${expected})`,
    ).toHaveText(new RegExp(`^[^\\d-]*${expected}(?!\\d)`));
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
    const ariaNow = await this.timeline.getAttribute('aria-valuenow');
    if (ariaNow !== null && ariaNow.trim() !== '') return Number(ariaNow);
    return Number(await this.timeline.inputValue());
  }

  // --------------------------------------------------------------- editing

  async select(index: number): Promise<void> {
    await this.slot(index).click();
  }

  async swap(first: number, second: number): Promise<void> {
    await this.slot(first).click();
    await this.slot(second).click();
  }

  async tapSlot(index: number): Promise<void> {
    await this.slot(index).tap();
  }

  /** Swaps two slots using touch tap events (for mobile viewports). */
  async tapSwap(first: number, second: number): Promise<void> {
    await this.slot(first).tap();
    await this.slot(second).tap();
  }

  /** Clicks the center of a slot by coordinates so disabled/fixed slots can be clicked like a user would. */
  async trySelectFixed(index: number): Promise<void> {
    const target = this.slot(index);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error(`Slot ${index} has no bounding box`);
    await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  /** Taps the center of a slot by coordinates so disabled/fixed slots can be tapped on touch viewports. */
  async tryTapFixed(index: number): Promise<void> {
    const target = this.slot(index);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error(`Slot ${index} has no bounding box`);
    await this.page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  }

  /** Reaches a free slot by pressing Tab from the page, then selects it with Enter. */
  async keyboardSelectByTab(index: number, context: string, maxTabs = 50): Promise<void> {
    let tabs = 0;
    while ((await this.focusedSlotIndex()) !== index && tabs < maxTabs) {
      await this.page.keyboard.press('Tab');
      tabs += 1;
    }
    const active = await this.describeActiveElement();
    expect(
      await this.focusedSlotIndex(),
      `${context}: expected Tab to reach free slot ${index} within ${maxTabs} presses (pressed Tab ${tabs} time(s); focus is on ${active})`,
    ).toBe(index);
    await this.page.keyboard.press('Enter');
  }

  async keyboardMove(direction: 'ArrowLeft' | 'ArrowRight'): Promise<void> {
    await this.page.keyboard.press(direction);
  }

  // -------------------------------------------------------------- playback

  async run(): Promise<void> {
    await this.runButton.click();
  }

  async skip(context?: string): Promise<void> {
    const prefix = context ? `${context}: ` : '';
    await this.skipButton.click();
    await expect
      .poll(() => this.progress(), {
        intervals: [50],
        timeout: 1_000,
        message: `${prefix}Skip must jump Animation progress to 100 within 1000 ms, not play through the remaining animation`,
      })
      .toBe(100);
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
      .poll(() => this.progress(), { message: 'Back to the start should move Animation progress to 0' })
      .toBe(0);
    await this.waitTwoFrames();
  }

  async stepForward(): Promise<void> {
    await this.playback.getByRole('button', { name: 'Next step' }).click();
  }

  /**
   * Clicks Next step, waits for Animation progress to move (unless already at 100),
   * then waits for playback to pause and for both Animation progress and
   * Comparisons counter to settle.
   */
  async stepForwardAndSettle(context?: string): Promise<{ counter: number; progress: number; atEnd: boolean }> {
    const prefix = context ? `${context}: ` : '';
    const before = await this.progress();
    await this.stepForward();
    if (before < 100) {
      await expect
        .poll(() => this.progress(), {
          intervals: [50],
          message: `${prefix}Next step should move Animation progress from ${before}`,
        })
        .not.toBe(before);
    }
    const settled = await this.waitForStepToSettle('Next step', context);
    return { ...settled, atEnd: settled.progress === 100 };
  }

  /**
   * Presses Next step repeatedly until the timeline reaches 100 or `maxSteps` is hit,
   * waiting for the timeline and counter to settle after each step and invoking `onStep`.
   */
  async stepToEnd(
    maxSteps: number,
    onStep: (reading: StepReading) => void | Promise<void>,
    context?: string,
  ): Promise<{ steps: number; counter: number; atEnd: boolean }> {
    let previousCounter = await this.counter(context);
    let atEnd = (await this.progress()) === 100;
    let steps = 0;
    while (!atEnd && steps < maxSteps) {
      steps += 1;
      const stepCtx = context ? `${context} step ${steps}` : undefined;
      const settled = await this.stepForwardAndSettle(stepCtx);
      await onStep({ step: steps, before: previousCounter, after: settled.counter, progress: settled.progress });
      previousCounter = settled.counter;
      atEnd = settled.atEnd;
    }
    return { steps, counter: previousCounter, atEnd };
  }

  async stepBack(): Promise<void> {
    await this.playback.getByRole('button', { name: 'Previous step' }).click();
  }

  /**
   * Clicks Previous step, waits for Animation progress to move (unless already at 0),
   * then waits for playback to pause and for both Animation progress and
   * Comparisons counter to settle.
   */
  async stepBackAndSettle(context?: string): Promise<{ counter: number; progress: number; atStart: boolean }> {
    const prefix = context ? `${context}: ` : '';
    const before = await this.progress();
    await this.stepBack();
    if (before > 0) {
      await expect
        .poll(() => this.progress(), {
          intervals: [50],
          message: `${prefix}Previous step should move Animation progress from ${before}`,
        })
        .not.toBe(before);
    }
    const settled = await this.waitForStepToSettle('Previous step', context);
    return { ...settled, atStart: settled.progress === 0 };
  }

  /**
   * Clicks Previous step until the comparison counter drops below `from` (up to `maxSteps` times,
   * to step past any trailing non-comparison frames such as the final swap or solved highlight).
   */
  async stepBackUntilCounterDrops(
    from: number,
    context?: string,
    maxSteps = 20,
  ): Promise<{ counter: number; progress: number; steps: number }> {
    let counter = await this.counter(context);
    let progress = await this.progress();
    for (let steps = 1; steps <= maxSteps; steps += 1) {
      const stepCtx = context ? `${context} step back ${steps}` : undefined;
      const settled = await this.stepBackAndSettle(stepCtx);
      counter = settled.counter;
      progress = settled.progress;
      if (counter < from || settled.atStart) return { counter, progress, steps };
    }
    return { counter, progress, steps: maxSteps };
  }

  /** Grants clipboard permissions, clears the clipboard, clicks Share, and returns the copied share text. */
  async shareText(): Promise<string> {
    await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await this.page.evaluate(() => navigator.clipboard.writeText(''));
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

  private async waitForStepToSettle(action: string, context?: string): Promise<{ counter: number; progress: number }> {
    const prefix = context ? `${context}: ` : '';
    const pauseButton = this.playback.getByRole('button', { name: 'Pause' });
    let prevProgress = await this.progress();
    let prevCounter = await this.counter(context);
    await expect
      .poll(
        async () => {
          await this.waitTwoFrames();
          const playing =
            (await pauseButton.isVisible()) && (await pauseButton.isEnabled({ timeout: 250 }).catch(() => false));
          const progress = await this.progress();
          const counter = await this.counter(context);
          const settled = !playing && progress === prevProgress && counter === prevCounter;
          prevProgress = progress;
          prevCounter = counter;
          return settled;
        },
        { intervals: [50], message: `${prefix}Animation progress and Comparisons counter should settle after ${action}` },
      )
      .toBe(true);
    return { counter: prevCounter, progress: prevProgress };
  }

  private async describeActiveElement(): Promise<string> {
    return this.page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return 'none';
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role');
      const label = el.getAttribute('aria-label');
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
      const parts = [tag];
      if (role) parts.push(`role="${role}"`);
      if (label) parts.push(`aria-label="${label}"`);
      if (text) parts.push(`"${text}"`);
      return parts.join(' ');
    });
  }

  private async readNumber(locator: Locator, label: string, context?: string): Promise<number> {
    const prefix = context ? `${context}: ` : '';
    await expect(locator, `${prefix}${label} should be visible`).toBeVisible();
    const text = ((await locator.textContent()) ?? '').trim();
    const match = text.match(/-?\d+/);
    if (!match) throw new Error(`${prefix}Expected ${label} to contain a number, got "${text}"`);
    return Number(match[0]);
  }

  private async waitTwoFrames(): Promise<void> {
    await this.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
  }
}
