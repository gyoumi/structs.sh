import { expect, type Locator, type Page } from '@playwright/test';
import type { DailyPuzzle } from './daily-fixtures';
import { readDrawing } from './visualiser-drawing';

export interface StepReading {
  step: number;
  before: number;
  after: number;
  /** Rounded Animation progress (0-100). */
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

  private get rulesRegion(): Locator { return this.page.getByRole('region', { name: 'Puzzle rules' }); }
  private get arrayGroup(): Locator { return this.page.getByRole('group', { name: 'Puzzle array' }); }
  private get slots(): Locator { return this.arrayGroup.getByRole('button'); }
  private slot(index: number): Locator { return this.slots.nth(index); }
  private get pivotMarker(): Locator {
    return this.arrayGroup
      .getByText('Pivot', { exact: true })
      .and(this.page.locator('xpath=self::*[not(ancestor-or-self::button)]'));
  }
  private button(name: string): Locator { return this.page.getByRole('button', { name, exact: true }); }
  private get playback(): Locator { return this.page.getByRole('toolbar', { name: 'Playback' }); }
  private playbackButton(name: string): Locator { return this.playback.getByRole('button', { name }); }
  private get timeline(): Locator { return this.page.getByRole('slider', { name: 'Animation progress' }); }
  private get speedPicker(): Locator { return this.page.getByRole('combobox', { name: 'Speed' }); }
  private status(name: string): Locator { return this.page.getByRole('status', { name, exact: true }); }

  // -------------------------------------------------------- setup / opening

  /** Serves `puzzle` in response to GET /puzzles/today.json. */
  async serve(puzzle: DailyPuzzle): Promise<void> {
    await this.page.route('**/puzzles/today.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(puzzle) }),
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
    await expect(this.rulesRegion, `${context}: Puzzle rules region should contain "${expected}"`).toContainText(expected);
  }

  /** Asserts the rules say quicksort picks the first number in each range as the pivot. */
  async expectRulesToExplainPivot(context: string): Promise<void> {
    await expect(this.rulesRegion, `${context}: /daily should show a Puzzle rules region`).toBeVisible();
    await expect(
      this.rulesRegion,
      `${context}: Puzzle rules region must state that quicksort picks the first number in each range as the pivot (expected text matching /first number.*pivot/i)`,
    ).toContainText(/first number.*pivot/i);
  }

  /**
   * Asserts a visible `Pivot` indicator in Puzzle array, outside the slot buttons,
   * horizontally aligned with slot 0 and not overflowing the viewport width.
   */
  async expectPivotMarkerOnFirstSlot(context: string): Promise<void> {
    const marker = this.pivotMarker;
    await expect(
      marker,
      `${context}: Puzzle array should contain exactly one element with text "Pivot" outside the slot buttons`,
    ).toHaveCount(1);
    await expect(marker, `${context}: the Pivot indicator in Puzzle array should be visible`).toBeVisible();
    const firstText = ((await this.slot(0).textContent()) ?? '').trim();
    expect(
      firstText,
      `${context}: slot 0's button text must still start with its number (the Pivot indicator belongs outside the button); got "${firstText}"`,
    ).toMatch(/^-?\d+/);
    const markerBox = await marker.boundingBox();
    const slotBox = await this.slot(0).boundingBox();
    if (!markerBox || !slotBox) {
      throw new Error(`${context}: could not measure the Pivot indicator (${JSON.stringify(markerBox)}) or slot 0 (${JSON.stringify(slotBox)})`);
    }
    const centre = markerBox.x + markerBox.width / 2;
    const slotRange = `${Math.round(slotBox.x)}..${Math.round(slotBox.x + slotBox.width)}`;
    expect(
      centre >= slotBox.x - 1 && centre <= slotBox.x + slotBox.width + 1,
      `${context}: the Pivot indicator's horizontal centre (${Math.round(centre)}px) should lie within slot 0's box (x ${slotRange}px)`,
    ).toBe(true);
    const viewportWidth = await this.page.evaluate(() => window.innerWidth);
    expect(
      markerBox.x >= -1 && markerBox.x + markerBox.width <= viewportWidth + 1,
      `${context}: the Pivot indicator (x ${Math.round(markerBox.x)}..${Math.round(markerBox.x + markerBox.width)}px) must fit within the viewport width ${viewportWidth}px`,
    ).toBe(true);
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
    expect(scrollX, `${context}: window.scrollX should remain 0 after vertically scrolling Puzzle array into view`).toBe(0);
    await expect(this.slots, `${context}: Puzzle array should render all ${expectedCount} slots`).toHaveCount(expectedCount);
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
    return this.matchingSlotIndices((slot) => slot.isDisabled());
  }

  /** 0-based indices of slots currently selected (`aria-pressed="true"`). */
  async selectedIndices(): Promise<number[]> {
    return this.matchingSlotIndices(async (slot) => (await slot.getAttribute('aria-pressed')) === 'true');
  }

  /** Asserts every free slot has aria-pressed="false" and no slot has aria-pressed="true". */
  async expectNoSelection(context: string): Promise<void> {
    const count = await this.slots.count();
    for (let i = 0; i < count; i += 1) {
      const slot = this.slot(i);
      const pressed = await slot.getAttribute('aria-pressed');
      if (await slot.isDisabled()) {
        expect(pressed, `${context}: fixed slot ${i} must not have aria-pressed="true"`).not.toBe('true');
      } else {
        expect(pressed, `${context}: free slot ${i} must have aria-pressed="false" when selection is cleared`).toBe('false');
      }
    }
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

  async goal(context?: string): Promise<number> {
    return this.readNumber(this.status('Goal'), 'Goal status', context);
  }

  async counter(context?: string): Promise<number> {
    return this.readNumber(this.status('Comparisons'), 'Comparisons counter', context);
  }

  /** Auto-retrying assertion that a named status readout is visible and its first number is `expected`. */
  async expectStatusNumber(name: string, expected: number, message: string): Promise<void> {
    const locator = this.status(name);
    await expect(locator, `${message} ("${name}" status readout should be visible)`).toBeVisible();
    await expect(
      locator,
      `${message} (the first number in the "${name}" readout must be ${expected})`,
    ).toHaveText(new RegExp(`^[^\\d-]*${expected}(?!\\d)`));
  }

  async goalReached(): Promise<boolean> {
    return this.status('Goal reached').isVisible();
  }

  /**
   * Asserts the page reveals no best score: no `Best` or `Best reached` status, and no
   * "highest possible" / "best possible" / "best score" / "out of <number>" wording anywhere on the page.
   */
  async expectNoBestShown(context: string): Promise<void> {
    for (const name of ['Best', 'Best reached']) {
      await expect(
        this.status(name),
        `${context}: the page must never show a "${name}" status (the solver's best stays hidden)`,
      ).toHaveCount(0);
    }
    const body = (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
    const leak = body.match(/highest possible|best possible|best score|best reached|maximum possible|out of \d+/i);
    expect(
      leak?.[0] ?? null,
      `${context}: the page text must not hint at the solver's best score, but contains "${leak?.[0]}"`,
    ).toBeNull();
  }

  async canRun(): Promise<boolean> {
    return this.isReady(this.button('Run'));
  }

  async canShare(): Promise<boolean> {
    return this.isReady(this.button('Share'));
  }

  async progress(context?: string): Promise<number> {
    const prefix = context ? `${context}: ` : '';
    await this.expectVisible(this.timeline, `${prefix}Animation progress slider`, 'reading playback progress');
    const ariaNow = await this.timeline.getAttribute('aria-valuenow');
    if (ariaNow !== null && ariaNow.trim() !== '') return Number(ariaNow);
    return Number(await this.timeline.inputValue());
  }

  async roundedProgress(context?: string): Promise<number> {
    return Math.round(await this.progress(context));
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
    const { x, y } = await this.slotCenter(index);
    await this.page.mouse.click(x, y);
  }

  /** Taps the center of a slot by coordinates so disabled/fixed slots can be tapped on touch viewports. */
  async tryTapFixed(index: number): Promise<void> {
    const { x, y } = await this.slotCenter(index);
    await this.page.touchscreen.tap(x, y);
  }

  /** Reaches a free slot by pressing Tab from the page, then selects it with Enter or Space. */
  async keyboardSelectByTab(
    index: number,
    context: string,
    key: 'Enter' | 'Space' = 'Enter',
    maxTabs = 50,
  ): Promise<void> {
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
    await this.page.keyboard.press(key);
  }

  async pressKey(key: 'ArrowLeft' | 'ArrowRight' | 'Enter' | 'Space' | 'Escape' | 'Tab'): Promise<void> {
    await this.page.keyboard.press(key);
  }

  // -------------------------------------------------------------- playback

  async run(): Promise<void> {
    await this.clickWhenReady(this.button('Run'), 'Run button', 'running the puzzle');
  }

  /**
   * Waits (briefly, for smooth scrolling to settle) until the sorting visualiser's
   * #visualiser-canvas is fully inside the vertical viewport, allowing 1px rounding.
   * On failure the received value spells out the canvas rect, viewport height and scrollY.
   */
  async expectVisualiserCanvasInViewport(context: string, timeout = 2_000): Promise<void> {
    const inView = 'fully in the viewport';
    await expect
      .poll(
        () =>
          this.page.evaluate((ok) => {
            const el = document.querySelector('#visualiser-canvas');
            if (!el) return '#visualiser-canvas not found on the page';
            const rect = el.getBoundingClientRect();
            const top = Math.round(rect.top);
            const bottom = Math.round(rect.bottom);
            const viewportHeight = window.innerHeight;
            if (top >= -1 && bottom <= viewportHeight + 1) return ok;
            return `canvas rect top ${top}, bottom ${bottom}, viewport height ${viewportHeight}, scrollY ${Math.round(window.scrollY)}`;
          }, inView),
        {
          intervals: [100],
          timeout,
          message: `${context}: clicking Run should scroll the page so #visualiser-canvas is fully in the viewport (top >= 0 and bottom <= viewport height, 1px tolerance) within ${timeout} ms`,
        },
      )
      .toBe(inView);
  }

  async skip(context?: string): Promise<void> {
    const prefix = context ? `${context}: ` : '';
    await this.expectVisible(this.timeline, `${prefix}Animation progress slider`, 'skipping the animation');
    await this.clickWhenReady(this.button('Skip'), `${prefix}Skip button`, 'skipping the animation');
    await expect
      .poll(() => this.roundedProgress(context), {
        intervals: [50],
        timeout: 1_000,
        message: `${prefix}Skip must jump rounded Animation progress to 100 within 1000 ms, not play through the remaining animation`,
      })
      .toBe(100);
  }

  async waitForRunToFinish(timeout = 60_000): Promise<void> {
    await this.expectVisible(this.timeline, 'Animation progress slider', 'waiting for Run to finish');
    await expect
      .poll(() => this.roundedProgress(), {
        intervals: [100],
        timeout,
        message: 'Run should animate to rounded Animation progress 100',
      })
      .toBe(100);
  }

  async playPlayback(): Promise<void> {
    await this.clickWhenReady(this.playbackButton('Play'), 'Play button in Playback toolbar', 'resuming playback');
  }

  async pausePlayback(): Promise<void> {
    await this.clickWhenReady(this.playbackButton('Pause'), 'Pause button in Playback toolbar', 'pausing playback');
  }

  async replayPlayback(): Promise<void> {
    await this.clickWhenReady(this.playbackButton('Replay'), 'Replay button in Playback toolbar', 'replaying the sort');
  }

  async skipToEnd(context?: string): Promise<void> {
    const prefix = context ? `${context}: ` : '';
    await this.clickWhenReady(
      this.playbackButton('Skip to the end'),
      `${prefix}Skip to the end button in Playback toolbar`,
      'skipping to the end of playback',
    );
    await expect
      .poll(() => this.roundedProgress(context), {
        message: `${prefix}Skip to the end should move rounded Animation progress to 100`,
      })
      .toBe(100);
  }

  async speeds(): Promise<number[]> {
    await this.clickWhenReady(this.speedPicker, 'Speed combobox', 'listing playback speeds');
    const options = await this.page.getByRole('option').allTextContents();
    await this.page.keyboard.press('Escape');
    return options.map((option) => parseFloat(option));
  }

  async setSpeed(speed: number): Promise<void> {
    await this.clickWhenReady(this.speedPicker, 'Speed combobox', `selecting ${speed}× playback speed`);
    await this.clickWhenReady(
      this.page.getByRole('option', { name: `${speed}×`, exact: true }),
      `Speed option "${speed}×"`,
      `selecting ${speed}× playback speed`,
    );
  }

  async speed(): Promise<number> {
    await this.expectVisible(this.speedPicker, 'Speed combobox', 'reading the selected playback speed');
    return parseFloat((await this.speedPicker.textContent()) ?? '');
  }

  async rewind(): Promise<void> {
    await this.clickWhenReady(
      this.playbackButton('Back to the start'),
      'Back to the start button in Playback toolbar',
      'rewinding playback to the start',
    );
    await expect
      .poll(() => this.progress(), { message: 'Back to the start should move Animation progress to 0' })
      .toBe(0);
    await this.waitTwoFrames();
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
    let atEnd = (await this.roundedProgress(context)) === 100;
    let steps = 0;
    while (!atEnd && steps < maxSteps) {
      steps += 1;
      const stepCtx = context ? `${context} step ${steps}` : undefined;
      const settled = await this.stepAndSettle('Next step', 100, stepCtx);
      const rounded = Math.round(settled.progress);
      await onStep({ step: steps, before: previousCounter, after: settled.counter, progress: rounded });
      previousCounter = settled.counter;
      atEnd = rounded === 100;
    }
    return { steps, counter: previousCounter, atEnd };
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
    let rawProgress = await this.progress(context);
    for (let steps = 1; steps <= maxSteps; steps += 1) {
      const stepCtx = context ? `${context} step back ${steps}` : undefined;
      const settled = await this.stepAndSettle('Previous step', 0, stepCtx);
      counter = settled.counter;
      rawProgress = settled.progress;
      if (counter < from || rawProgress === 0) return { counter, progress: Math.round(rawProgress), steps };
    }
    return { counter, progress: Math.round(rawProgress), steps: maxSteps };
  }

  /** Grants clipboard permissions, clears the clipboard, clicks Share, and returns the copied share text. */
  async shareText(): Promise<string> {
    await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await this.page.evaluate(() => navigator.clipboard.writeText(''));
    await this.clickWhenReady(this.button('Share'), 'Share button', 'copying the share text');
    let copied = '';
    await expect
      .poll(async () => (copied = await this.page.evaluate(() => navigator.clipboard.readText())), {
        message: 'Clicking Share should copy non-empty share text to the clipboard',
      })
      .not.toBe('');
    return copied;
  }

  // --------------------------------------------------------------- helpers

  private async matchingSlotIndices(pred: (slot: Locator) => Promise<boolean>): Promise<number[]> {
    const count = await this.slots.count();
    const indices: number[] = [];
    for (let i = 0; i < count; i += 1) {
      if (await pred(this.slot(i))) indices.push(i);
    }
    return indices;
  }

  private async slotCenter(index: number): Promise<{ x: number; y: number }> {
    const target = this.slot(index);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error(`Slot ${index} has no bounding box`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }

  private async stepAndSettle(
    action: 'Next step' | 'Previous step',
    boundary: 0 | 100,
    context?: string,
  ): Promise<{ counter: number; progress: number }> {
    const prefix = context ? `${context}: ` : '';
    const before = await this.progress(context);
    await this.clickWhenReady(
      this.playbackButton(action),
      `${prefix}${action} button in Playback toolbar`,
      action === 'Next step' ? 'stepping forward' : 'stepping back',
    );
    const atBoundary = boundary === 100 ? Math.round(before) === 100 : before === 0;
    if (!atBoundary) {
      await expect
        .poll(() => this.progress(context), {
          intervals: [50],
          message: `${prefix}${action} should move Animation progress from ${before}`,
        })
        .not.toBe(before);
    }
    return this.waitForStepToSettle(action, context);
  }

  private async waitForStepToSettle(action: string, context?: string): Promise<{ counter: number; progress: number }> {
    const prefix = context ? `${context}: ` : '';
    const pauseButton = this.playbackButton('Pause');
    let prevProgress = await this.progress(context);
    let prevCounter = await this.counter(context);
    await expect
      .poll(
        async () => {
          await this.waitTwoFrames();
          const playing = await this.isReady(pauseButton);
          const progress = await this.progress(context);
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

  private async expectVisible(locator: Locator, label: string, action: string): Promise<void> {
    await expect(locator, `${label} should be visible when ${action}`).toBeVisible();
  }

  private async clickWhenReady(locator: Locator, label: string, action: string): Promise<void> {
    await expect(locator, `${label} should be visible before ${action}`).toBeVisible();
    await expect(locator, `${label} should be enabled before ${action}`).toBeEnabled();
    await locator.click();
  }

  private async isReady(locator: Locator): Promise<boolean> {
    return (await locator.isVisible()) && (await locator.isEnabled({ timeout: 250 }).catch(() => false));
  }

  private async readNumber(locator: Locator, label: string, context?: string): Promise<number> {
    const prefix = context ? `${context}: ` : '';
    await this.expectVisible(locator, `${prefix}${label}`, 'reading its value');
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
