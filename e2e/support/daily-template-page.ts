import { expect, type Locator, type Page } from '@playwright/test';
import type { DailyPage } from './daily-page';
import { DailyLocators } from './daily-locators';
import { DailyOperationBuilder } from './daily-operations';

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;
const wholeNumber = (n: number) => new RegExp(`(?<![\\d.])${n}(?![\\d.])`);

/**
 * Checkpoint 2 additions to the /daily page object: the template-specific readouts, try outcomes
 * (solved or unsolved), the two-stage layout, the target tree and the Index drift operation builder.
 * Checkpoint 1 behaviour (slots, Run, Skip, Playback, Goal, Score, Tries left) stays in `DailyPage`.
 * See "The daily game" in e2e/README.md for the contract these locators rely on.
 */
export class DailyTemplatePage {
  private readonly ui: DailyLocators;
  readonly operations: DailyOperationBuilder;

  constructor(readonly page: Page) {
    this.ui = new DailyLocators(page);
    this.operations = new DailyOperationBuilder(page);
  }

  private get tryChips(): Locator {
    return this.page.getByRole('list', { name: 'Tries', exact: true }).getByRole('listitem');
  }

  private stage(name: string): Locator {
    return this.page.getByRole('region', { name, exact: true });
  }

  /** The first number in the named status readout, after checking it is visible. */
  async statusNumber(name: string, context: string): Promise<number> {
    return this.ui.readNumber(this.ui.status(name), `"${name}" status readout`, context);
  }

  /** Polls the named readout until its first number rises above `floor`, for counters that animate after Run. */
  async expectStatusRisesAbove(name: string, floor: number, context: string): Promise<void> {
    await expect
      .poll(() => this.statusNumber(name, context), {
        intervals: [50],
        message: `${context}: after Run, the "${name}" readout should animate above ${floor} by itself, before the try ends`,
      })
      .toBeGreaterThan(floor);
  }

  /** Puzzle rules must include each pattern, and must not still describe the quicksort puzzle. */
  async expectRules(patterns: readonly RegExp[], context: string): Promise<void> {
    const rules = this.ui.rulesRegion;
    await expect(rules, `${context}: /daily should show a Puzzle rules region`).toBeVisible();
    for (const pattern of patterns) {
      await expect(rules, `${context}: Puzzle rules should contain text matching ${pattern}`).toContainText(pattern);
    }
    await expect(
      rules,
      `${context}: Puzzle rules must describe this template, not quicksort (no text matching /quicksort|pivot/i)`,
    ).not.toContainText(/quicksort|pivot/i);
  }

  /** `Score` shows no number: it is hidden, or its text has no digits (for example `–` or `✗`). */
  async expectNoScore(context: string): Promise<void> {
    const score = this.ui.status('Score');
    await expect
      .poll(async () => ((await score.isVisible()) ? ((await score.textContent()) ?? '').trim() : '(hidden)'), {
        message: `${context}: Score must not show a number when the try it reports is unsolved (no solved try to rank)`,
      })
      .not.toMatch(/\d/);
  }

  /** `Goal reached` is visible (`expected` true) or absent/hidden (`expected` false). */
  async expectGoalReached(expected: boolean, context: string): Promise<void> {
    const badge = this.ui.status('Goal reached');
    if (expected) {
      await expect(badge, `${context}: "Goal reached" status should be visible`).toBeVisible();
    } else {
      await expect(badge, `${context}: "Goal reached" status must not be visible`).toBeHidden();
    }
  }

  /**
   * The spent try chips in the `Tries` list, in order: `✗` for an unsolved try, `<score>` or `<score> ⭐`
   * for a solved one. Unspent chips are left out, so pass the chips expected so far.
   */
  async expectTryChips(expected: readonly string[], context: string): Promise<void> {
    await expect(this.tryChips, `${context}: the Tries list should always show 3 chips`).toHaveCount(3);
    await expect
      .poll(
        async () => {
          const texts = await this.tryChips.allTextContents();
          return texts.slice(0, expected.length).map((text) => text.replace(/\s+/g, ' ').trim());
        },
        { message: `${context}: the first ${expected.length} chip(s) in the Tries list should read ${JSON.stringify(expected)}` },
      )
      .toEqual([...expected]);
  }

  /**
   * The `Try result` readout explains an unsolved try. `numbers` must each appear as a whole number,
   * and `words` must each match, in any order.
   */
  async expectTryResult(numbers: readonly number[], words: readonly RegExp[], context: string): Promise<void> {
    const result = this.ui.status('Try result');
    await expect(result, `${context}: a "Try result" status should explain why the try is unsolved`).toBeVisible();
    for (const n of numbers) {
      await expect(result, `${context}: "Try result" should mention ${n} as a whole number`).toHaveText(wholeNumber(n));
    }
    for (const word of words) {
      await expect(result, `${context}: "Try result" should contain text matching ${word}`).toContainText(word);
    }
  }

  /** Exactly one `Playback` toolbar on the page, shared by every stage. */
  async expectOnePlaybackToolbar(context: string): Promise<void> {
    await expect(
      this.page.getByRole('toolbar', { name: 'Playback', exact: true }),
      `${context}: both stages must share one Playback toolbar, so exactly one should exist`,
    ).toHaveCount(1);
  }

  /** Both stage regions are visible, each drawing an <svg>, with `first` fully left of `second` and overlapping it vertically. */
  async expectStagesSideBySide(first: string, second: string, context: string): Promise<void> {
    const [a, b] = await this.stageBoxes(first, second, context);
    const sideBySide = a.x + a.width <= b.x + 1 && a.y < b.y + b.height && b.y < a.y + a.height;
    expect(
      sideBySide,
      `${context}: on desktop the "${first}" stage (x ${Math.round(a.x)}-${Math.round(a.x + a.width)}, y ${Math.round(a.y)}-${Math.round(a.y + a.height)}) should sit left of the "${second}" stage (x ${Math.round(b.x)}-${Math.round(b.x + b.width)}, y ${Math.round(b.y)}-${Math.round(b.y + b.height)}) on the same row`,
    ).toBe(true);
  }

  /** Both stage regions are visible, `first` fully above `second`, and both fit the viewport's width. */
  async expectStagesStacked(first: string, second: string, context: string): Promise<void> {
    const [a, b] = await this.stageBoxes(first, second, context);
    const width = this.page.viewportSize()?.width ?? 0;
    expect(
      a.y + a.height <= b.y + 1,
      `${context}: on a phone the "${first}" stage (bottom ${Math.round(a.y + a.height)}) should be stacked above the "${second}" stage (top ${Math.round(b.y)})`,
    ).toBe(true);
    for (const [name, box] of [[first, a], [second, b]] as const) {
      expect(
        box.x >= -1 && box.x + box.width <= width + 1,
        `${context}: the "${name}" stage (x ${Math.round(box.x)}-${Math.round(box.x + box.width)}) should fit the ${width}px viewport width`,
      ).toBe(true);
    }
  }

  /** The `Target tree` figure is visible, draws an <svg>, and lists the target's preorder as `6, 3, 1, ...`. */
  async expectTargetTree(preorder: readonly number[], context: string): Promise<void> {
    const figure = this.page.getByRole('figure', { name: 'Target tree', exact: true });
    await expect(figure, `${context}: /daily should show a figure named "Target tree"`).toBeVisible();
    await expect(figure.locator('svg').first(), `${context}: the Target tree figure should draw the tree in an <svg>`).toBeVisible();
    await expect(
      figure,
      `${context}: the Target tree figure should include its preorder "${preorder.join(', ')}" as text (a caption or visually hidden text)`,
    ).toContainText(preorder.join(', '));
  }

  /** Swaps free slots until Puzzle array reads `target`, then checks it does. */
  async arrange(dailyPage: DailyPage, target: readonly number[], context: string): Promise<void> {
    const values = await dailyPage.values();
    for (let i = 0; i < target.length; i += 1) {
      if (values[i] === target[i]) continue;
      const from = values.indexOf(target[i], i + 1);
      if (from < 0) throw new Error(`${context}: cannot arrange ${fmt(values)} into ${fmt(target)}: ${target[i]} is not after slot ${i}`);
      await dailyPage.swap(i, from);
      [values[i], values[from]] = [values[from], values[i]];
    }
    expect(await dailyPage.values(), `${context}: swapping free slots should arrange Puzzle array as ${fmt(target)}`).toEqual([...target]);
  }

  private async stageBoxes(first: string, second: string, context: string) {
    const boxes = [];
    for (const name of [first, second]) {
      const region = this.stage(name);
      await expect(region, `${context}: a region named "${name}" should show that algorithm's stage`).toBeVisible();
      await expect(region.locator('svg').first(), `${context}: the "${name}" stage should draw into an <svg>`).toBeVisible();
      const box = await region.boundingBox();
      if (!box) throw new Error(`${context}: the "${name}" stage has no bounding box`);
      boxes.push(box);
    }
    return boxes;
  }
}
