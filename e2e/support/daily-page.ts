import { expect, type Locator, type Page } from '@playwright/test';
import type { DailyPuzzle } from './daily-fixtures';
import {
  expectAllSlotsInViewport,
  expectNoBestShown,
  expectVisualiserInViewport,
} from './daily-layout';
import { DailyLocators } from './daily-locators';
import { stepBackUntilCounterDrops, stepToEnd, type StepReading } from './daily-stepping';
import { readDrawing } from './visualiser-drawing';

export type { StepReading } from './daily-stepping';

/**
 * Drives the /daily puzzle page using only ARIA roles and accessible names. Locators live in
 * `daily-locators.ts`, layout/a11y checks in `daily-layout.ts`, stepping in `daily-stepping.ts`.
 * See "The daily game" in e2e/README.md for the page contract these locators rely on.
 */
export class DailyPage {
  private readonly ui: DailyLocators;

  constructor(readonly page: Page) {
    this.ui = new DailyLocators(page);
  }

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
    await expect(this.ui.arrayGroup, '/daily should render the Puzzle array group').toBeVisible();
    await expect(this.ui.slots.first(), '/daily should render slot buttons inside Puzzle array').toBeVisible();
  }

  // --------------------------------------------------------------- reading

  async expectRulesToContain(expected: string, context: string): Promise<void> {
    const rules = this.ui.rulesRegion;
    await expect(rules, `${context}: /daily should show a Puzzle rules region`).toBeVisible();
    await expect(rules, `${context}: Puzzle rules region should contain "${expected}"`).toContainText(expected);
  }

  /** Asserts the rules say quicksort picks the leftmost number in each range as the pivot. */
  async expectRulesToExplainPivot(context: string): Promise<void> {
    const rules = this.ui.rulesRegion;
    await expect(rules, `${context}: /daily should show a Puzzle rules region`).toBeVisible();
    await expect(
      rules,
      `${context}: Puzzle rules region must state that quicksort picks the leftmost number in each range as the pivot (expected text matching /leftmost.*pivot/i, e.g. "Quicksort always picks the leftmost number in each range as the pivot.")`,
    ).toContainText(/\bleftmost\b.*\bpivot\b/i);
  }

  /**
   * Asserts Puzzle rules drops the hand-holding prose: no "You have N tries" sentence and no
   * "Tap or click two unlocked numbers..." instructions. The lock icons, slots, Tries left and
   * Run already say this.
   */
  async expectRulesWithoutHandHolding(context: string): Promise<void> {
    const rules = this.ui.rulesRegion;
    await expect(rules, `${context}: /daily should show a Puzzle rules region`).toBeVisible();
    await expect(
      rules,
      `${context}: Puzzle rules must not repeat the tries count in prose (no text matching /you have \\d+ tries/i); Tries left already shows it`,
    ).not.toContainText(/you have \d+ tries/i);
    await expect(
      rules,
      `${context}: Puzzle rules must not include "Tap or click..." swap instructions (no text matching /tap or click/i)`,
    ).not.toContainText(/tap or click/i);
  }

  /**
   * Asserts the keyboard help sits in a native <details> inside Puzzle rules whose <summary> reads
   * "Keyboard controls": closed on load with the /Enter or Space/i text hidden, opened by clicking
   * the summary, and closed again by a second click.
   */
  async expectKeyboardControlsCollapsed(context: string): Promise<void> {
    const rules = this.ui.rulesRegion;
    const summary = rules.locator('details > summary').filter({ hasText: /^\s*Keyboard controls\s*$/ });
    const details = rules.locator('details').filter({ has: summary });
    const help = details.getByText(/Enter or Space/i);
    await expect(
      summary,
      `${context}: Puzzle rules should contain one <details> whose <summary> text is "Keyboard controls"`,
    ).toHaveCount(1);
    await expect(summary, `${context}: the "Keyboard controls" summary should be visible`).toBeVisible();
    await expect(details, `${context}: the Keyboard controls <details> should be closed on page load`).toHaveJSProperty('open', false);
    await expect(help.first(), `${context}: keyboard help matching /Enter or Space/i should be inside the Keyboard controls <details>`).toBeAttached();
    await expect(help.first(), `${context}: keyboard help (/Enter or Space/i) should be hidden while Keyboard controls is collapsed`).toBeHidden();

    await summary.click();
    await expect(details, `${context}: clicking "Keyboard controls" should open its <details>`).toHaveJSProperty('open', true);
    await expect(help.first(), `${context}: after opening Keyboard controls, the keyboard help (/Enter or Space/i) should be visible`).toBeVisible();

    await summary.click();
    await expect(details, `${context}: clicking "Keyboard controls" again should close its <details>`).toHaveJSProperty('open', false);
    await expect(help.first(), `${context}: after closing Keyboard controls again, the keyboard help should be hidden`).toBeHidden();
  }

  /**
   * Asserts Puzzle array carries no static `Pivot` label. Slot 0 is only the first pivot;
   * the pivot moves as quicksort recurses, so a fixed tag over slot 0 would mislead.
   */
  async expectNoStaticPivotLabel(context: string): Promise<void> {
    await expect(
      this.ui.arrayGroup,
      `${context}: Puzzle array must not show a static "Pivot" label (the pivot changes as quicksort recurses, so a tag fixed over slot 0 is misleading)`,
    ).not.toContainText(/pivot/i);
  }

  /** The values shown in Puzzle array from left to right. */
  async values(): Promise<number[]> {
    const count = await this.ui.slots.count();
    const result: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const text = ((await this.ui.slot(i).textContent()) ?? '').trim();
      const match = text.match(/-?\d+/);
      if (!match) throw new Error(`Expected slot ${i} in Puzzle array to start with a number, got "${text}"`);
      result.push(Number(match[0]));
    }
    return result;
  }

  /** See `expectAllSlotsInViewport` in daily-layout.ts. */
  async expectAllSlotsInViewport(context: string, expectedCount: number): Promise<void> {
    await expectAllSlotsInViewport(this.ui, context, expectedCount);
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
    const count = await this.ui.slots.count();
    for (let i = 0; i < count; i += 1) {
      const slot = this.ui.slot(i);
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
    const count = await this.ui.slots.count();
    for (let i = 0; i < count; i += 1) {
      if (await this.ui.slot(i).evaluate((el) => el === document.activeElement)) return i;
    }
    return null;
  }

  /** The values drawn in the sorting visualiser's #visualiser-canvas SVG, left to right. */
  async drawnValues(): Promise<number[]> {
    return (await readDrawing(this.page)).sort((a, b) => a.x - b.x || a.y - b.y).map((node) => node.value);
  }

  async goal(context?: string): Promise<number> {
    return this.ui.readNumber(this.ui.status('Goal'), 'Goal status', context);
  }

  async counter(context?: string): Promise<number> {
    return this.ui.counter(context);
  }

  /** Auto-retrying assertion that a named status readout is visible and its first number is `expected`. */
  async expectStatusNumber(name: string, expected: number, message: string): Promise<void> {
    const locator = this.ui.status(name);
    await expect(locator, `${message} ("${name}" status readout should be visible)`).toBeVisible();
    await expect(
      locator,
      `${message} (the first number in the "${name}" readout must be ${expected})`,
    ).toHaveText(new RegExp(`^[^\\d-]*${expected}(?!\\d)`));
  }

  async goalReached(): Promise<boolean> {
    return this.ui.status('Goal reached').isVisible();
  }

  /** See `expectNoBestShown` in daily-layout.ts. */
  async expectNoBestShown(context: string): Promise<void> {
    await expectNoBestShown(this.ui, context);
  }

  async canRun(): Promise<boolean> {
    return this.ui.isReady(this.ui.button('Run'));
  }

  async canShare(): Promise<boolean> {
    return this.ui.isReady(this.ui.button('Share'));
  }

  async progress(context?: string): Promise<number> {
    return this.ui.progress(context);
  }

  async roundedProgress(context?: string): Promise<number> {
    return this.ui.roundedProgress(context);
  }

  // --------------------------------------------------------------- editing

  async select(index: number): Promise<void> {
    await this.ui.slot(index).click();
  }

  async swap(first: number, second: number): Promise<void> {
    await this.ui.slot(first).click();
    await this.ui.slot(second).click();
  }

  async tapSlot(index: number): Promise<void> {
    await this.ui.slot(index).tap();
  }

  /** Swaps two slots using touch tap events (for mobile viewports). */
  async tapSwap(first: number, second: number): Promise<void> {
    await this.ui.slot(first).tap();
    await this.ui.slot(second).tap();
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
    const active = await this.ui.describeActiveElement();
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
    await this.ui.clickWhenReady(this.ui.button('Run'), 'Run button', 'running the puzzle');
  }

  /** See `expectVisualiserInViewport` in daily-layout.ts. */
  async expectVisualiserInViewport(context: string, timeout = 2_000): Promise<void> {
    await expectVisualiserInViewport(this.ui, context, timeout);
  }

  /** Focuses the named action button (for example `Run`) without clicking it. */
  async focusButton(name: 'Run' | 'Skip' | 'Share'): Promise<void> {
    const target = this.ui.button(name);
    await expect(target, `${name} button should be visible before focusing it`).toBeVisible();
    await expect(target, `${name} button should be enabled before focusing it`).toBeEnabled();
    await target.focus();
    await expect(target, `${name} button should take focus`).toBeFocused();
  }

  /** Asserts the named action button is enabled and has keyboard focus, naming the actual focused element on failure. */
  async expectButtonFocused(name: 'Run' | 'Skip' | 'Share', context: string): Promise<void> {
    const target = this.ui.button(name);
    await expect(target, `${context}: ${name} button should be enabled`).toBeEnabled();
    await expect
      .poll(async () => ((await target.evaluate((el) => el === document.activeElement)) ? 'focused' : `focus is on ${await this.ui.describeActiveElement()}`), {
        intervals: [50],
        timeout: 2_000,
        message: `${context}: keyboard focus should be on the ${name} button`,
      })
      .toBe('focused');
  }

  /** Polls until rounded Animation progress is 100 within `timeout` ms (for example after pressing Enter on Skip). */
  async expectProgressAtEnd(context: string, timeout = 1_000): Promise<void> {
    await expect
      .poll(() => this.roundedProgress(context), {
        intervals: [50],
        timeout,
        message: `${context}: rounded Animation progress should reach 100 within ${timeout} ms`,
      })
      .toBe(100);
  }

  async skip(context?: string): Promise<void> {
    const prefix = context ? `${context}: ` : '';
    await this.ui.expectVisible(this.ui.timeline, `${prefix}Animation progress slider`, 'skipping the animation');
    await this.ui.clickWhenReady(this.ui.button('Skip'), `${prefix}Skip button`, 'skipping the animation');
    await expect
      .poll(() => this.roundedProgress(context), {
        intervals: [50],
        timeout: 1_000,
        message: `${prefix}Skip must jump rounded Animation progress to 100 within 1000 ms, not play through the remaining animation`,
      })
      .toBe(100);
  }

  async waitForRunToFinish(timeout = 60_000): Promise<void> {
    await this.ui.expectVisible(this.ui.timeline, 'Animation progress slider', 'waiting for Run to finish');
    await expect
      .poll(() => this.roundedProgress(), {
        intervals: [100],
        timeout,
        message: 'Run should animate to rounded Animation progress 100',
      })
      .toBe(100);
  }

  async playPlayback(): Promise<void> {
    await this.ui.clickWhenReady(this.ui.playbackButton('Play'), 'Play button in Playback toolbar', 'resuming playback');
  }

  async pausePlayback(): Promise<void> {
    await this.ui.clickWhenReady(this.ui.playbackButton('Pause'), 'Pause button in Playback toolbar', 'pausing playback');
  }

  async replayPlayback(): Promise<void> {
    await this.ui.clickWhenReady(this.ui.playbackButton('Replay'), 'Replay button in Playback toolbar', 'replaying the sort');
  }

  async skipToEnd(context?: string): Promise<void> {
    const prefix = context ? `${context}: ` : '';
    await this.ui.clickWhenReady(
      this.ui.playbackButton('Skip to the end'),
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
    await this.ui.clickWhenReady(this.ui.speedPicker, 'Speed combobox', 'listing playback speeds');
    const options = await this.page.getByRole('option').allTextContents();
    await this.page.keyboard.press('Escape');
    return options.map((option) => parseFloat(option));
  }

  async setSpeed(speed: number): Promise<void> {
    await this.ui.clickWhenReady(this.ui.speedPicker, 'Speed combobox', `selecting ${speed}× playback speed`);
    await this.ui.clickWhenReady(
      this.page.getByRole('option', { name: `${speed}×`, exact: true }),
      `Speed option "${speed}×"`,
      `selecting ${speed}× playback speed`,
    );
  }

  async speed(): Promise<number> {
    await this.ui.expectVisible(this.ui.speedPicker, 'Speed combobox', 'reading the selected playback speed');
    return parseFloat((await this.ui.speedPicker.textContent()) ?? '');
  }

  async rewind(): Promise<void> {
    await this.ui.clickWhenReady(
      this.ui.playbackButton('Back to the start'),
      'Back to the start button in Playback toolbar',
      'rewinding playback to the start',
    );
    await expect
      .poll(() => this.progress(), { message: 'Back to the start should move Animation progress to 0' })
      .toBe(0);
    await this.ui.waitTwoFrames();
  }

  /** See `stepToEnd` in daily-stepping.ts. */
  async stepToEnd(
    maxSteps: number,
    onStep: (reading: StepReading) => void | Promise<void>,
    context?: string,
  ): Promise<{ steps: number; counter: number; atEnd: boolean }> {
    return stepToEnd(this.ui, maxSteps, onStep, context);
  }

  /** See `stepBackUntilCounterDrops` in daily-stepping.ts. */
  async stepBackUntilCounterDrops(
    from: number,
    context?: string,
    maxSteps = 20,
  ): Promise<{ counter: number; progress: number; steps: number }> {
    return stepBackUntilCounterDrops(this.ui, from, context, maxSteps);
  }

  /** Grants clipboard permissions, clears the clipboard, clicks Share, and returns the copied share text. */
  async shareText(): Promise<string> {
    await this.page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await this.page.evaluate(() => navigator.clipboard.writeText(''));
    await this.ui.clickWhenReady(this.ui.button('Share'), 'Share button', 'copying the share text');
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
    const count = await this.ui.slots.count();
    const indices: number[] = [];
    for (let i = 0; i < count; i += 1) {
      if (await pred(this.ui.slot(i))) indices.push(i);
    }
    return indices;
  }

  private async slotCenter(index: number): Promise<{ x: number; y: number }> {
    const target = this.ui.slot(index);
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error(`Slot ${index} has no bounding box`);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }
}
