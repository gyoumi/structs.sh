import { expect, type Locator, type Page } from '@playwright/test';
import type { DailyChallenge } from './daily-fixtures';
import {
  expectAllSlotsInViewport,
  expectNoBestShown,
  expectVisualiserInViewport,
} from './daily-layout';
import { DailyLocators } from './daily-locators';
import { stepAndSettle, stepBackUntilCounterDrops, stepToEnd, type StepReading } from './daily-stepping';
import type { TransportControls } from './transport-controls';
import { readDrawing } from './visualiser-drawing';

export type { StepReading } from './daily-stepping';

/**
 * Drives the /daily challenge page using only ARIA roles and accessible names. Locators live in
 * `daily-locators.ts`, layout/a11y checks in `daily-layout.ts`, stepping in `daily-stepping.ts`.
 * The Playback toolbar and Speed picker are driven through `transport` (shared with the visualisers).
 * See "The daily game" in e2e/README.md for the page contract these locators rely on.
 */
export class DailyPage {
  private readonly ui: DailyLocators;
  /** Play, Pause, Replay, Back to the start, Skip to the end and Speed (see `transport-controls.ts`). */
  readonly transport: TransportControls;

  constructor(readonly page: Page) {
    this.ui = new DailyLocators(page);
    this.transport = this.ui.transport;
  }

  // -------------------------------------------------------- setup / opening

  /** Serves `challenge` in response to GET /api/daily. */
  async serve(challenge: DailyChallenge): Promise<void> {
    await this.page.route('**/api/daily', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(challenge) }),
    );
  }

  /** Opens /daily and waits for the challenge array to appear. */
  async open(): Promise<void> {
    await this.page.goto('/daily');
    await expect(this.ui.arrayGroup, '/daily should render the Challenge array group').toBeVisible();
    await expect(this.ui.slots.first(), '/daily should render slot buttons inside Challenge array').toBeVisible();
  }

  /** Clicks the `Go back` button in the /daily header to return to the previous page. */
  async goBack(): Promise<void> {
    const button = this.page.getByRole('button', { name: 'Go back', exact: true });
    await expect(button, '/daily header should contain a "Go back" button').toBeVisible();
    await button.click();
  }

  /** Clicks the `structs.sh` home brand link in the /daily header. */
  async goHome(): Promise<void> {
    const link = this.page.getByRole('link', { name: 'structs.sh home', exact: true });
    await expect(link, '/daily header should contain a "structs.sh home" link').toBeVisible();
    await link.click();
  }

  // --------------------------------------------------------------- reading

  async expectRulesToContain(expected: string, context: string): Promise<void> {
    const rules = this.ui.rulesRegion;
    await expect(rules, `${context}: /daily should show a Challenge rules region`).toBeVisible();
    await expect(rules, `${context}: Challenge rules region should contain "${expected}"`).toContainText(expected);
  }

  /** Asserts the rules say quicksort picks the leftmost number in each range as the pivot. */
  async expectRulesToExplainPivot(context: string): Promise<void> {
    const rules = this.ui.rulesRegion;
    await expect(rules, `${context}: /daily should show a Challenge rules region`).toBeVisible();
    await expect(
      rules,
      `${context}: Challenge rules region must state that quicksort picks the leftmost number in each range as the pivot (expected text matching /leftmost.*pivot/i, e.g. "Quicksort always picks the leftmost number in each range as the pivot.")`,
    ).toContainText(/\bleftmost\b.*\bpivot\b/i);
  }

  /**
   * Asserts Challenge rules drops the hand-holding prose: no "You have N tries" sentence and no
   * "Tap or click two unlocked numbers..." instructions. The lock icons, slots, Tries left and
   * Run already say this.
   */
  async expectRulesWithoutHandHolding(context: string): Promise<void> {
    const rules = this.ui.rulesRegion;
    await expect(rules, `${context}: /daily should show a Challenge rules region`).toBeVisible();
    await expect(
      rules,
      `${context}: Challenge rules must not repeat the tries count in prose (no text matching /you have \\d+ tries/i); Tries left already shows it`,
    ).not.toContainText(/you have \d+ tries/i);
    await expect(
      rules,
      `${context}: Challenge rules must not include "Tap or click..." swap instructions (no text matching /tap or click/i)`,
    ).not.toContainText(/tap or click/i);
  }

  /**
   * Asserts the keyboard help sits in a native <details> inside Challenge rules whose <summary> reads
   * "Keyboard controls": closed on load with the /Enter or Space/i text hidden, opened by clicking
   * the summary, and closed again by a second click.
   */
  async expectKeyboardControlsCollapsed(context: string): Promise<void> {
    const rules = this.ui.rulesRegion;
    const summary = rules.locator('details > summary').filter({ hasText: /^\s*Keyboard controls\s*$/ });
    // `has:` resolves relative to each <details>, so pass a page-rooted locator, not one under `rules`.
    const details = rules
      .locator('details')
      .filter({ has: this.page.locator('summary', { hasText: /^\s*Keyboard controls\s*$/ }) });
    const help = details.getByText(/Enter or Space/i);
    await expect(
      summary,
      `${context}: Challenge rules should contain one <details> whose <summary> text is "Keyboard controls"`,
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
   * Asserts Challenge array carries no static `Pivot` label. Slot 0 is only the first pivot;
   * the pivot moves as quicksort recurses, so a fixed tag over slot 0 would mislead.
   */
  async expectNoStaticPivotLabel(context: string): Promise<void> {
    await expect(
      this.ui.arrayGroup,
      `${context}: Challenge array must not show a static "Pivot" label (the pivot changes as quicksort recurses, so a tag fixed over slot 0 is misleading)`,
    ).not.toContainText(/pivot/i);
  }

  /** The values shown in Challenge array from left to right. */
  async values(): Promise<number[]> {
    const count = await this.ui.slots.count();
    const result: number[] = [];
    for (let i = 0; i < count; i += 1) {
      const text = ((await this.ui.slot(i).textContent()) ?? '').trim();
      const match = text.match(/-?\d+/);
      if (!match) throw new Error(`Expected slot ${i} in Challenge array to start with a number, got "${text}"`);
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

  /** 0-based index of the focused slot in Challenge array, or null if no slot has focus. */
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
    await this.ui.clickWhenReady(this.ui.button('Run'), 'Run button', 'running the challenge');
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

  /** Asserts the Play button is disabled and visually dimmed before the first Run. */
  async expectPlayDisabledBeforeRun(context: string): Promise<void> {
    const play = this.ui.playbackButton('Play');
    await expect(play, `${context}: Play button should be visible before Run`).toBeVisible();
    await expect(play, `${context}: Play button should be disabled before Run`).toBeDisabled();
    const { opacity, cursor } = await play.evaluate((el) => {
      const style = getComputedStyle(el);
      return { opacity: Number(style.opacity), cursor: style.cursor };
    });
    expect(opacity, `${context}: disabled Play button should be visually dimmed (opacity < 0.8)`).toBeLessThan(0.8);
    expect(cursor, `${context}: disabled Play button should not show pointer cursor`).not.toBe('pointer');
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

  /** Steps forward from the start until an active comparison with its true/false result is exposed to assistive tech. */
  async expectAccessibleStepComparison(context: string, maxSteps = 10): Promise<void> {
    const stepComparison = this.page.getByRole('status', { name: /, (true|false)$/ });
    for (let step = 1; step <= maxSteps; step += 1) {
      await stepAndSettle(this.ui, 'Next step', 100, `${context} step ${step}`);
      if ((await stepComparison.count()) > 0) return;
    }
    expect(
      await stepComparison.count(),
      `${context}: stepping forward up to ${maxSteps} steps must expose an active comparison status (e.g. "1 <= 8, true") to assistive technology`,
    ).toBeGreaterThan(0);
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
