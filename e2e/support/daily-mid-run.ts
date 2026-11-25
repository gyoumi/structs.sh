import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import type { DailyChallenge } from './daily-fixtures';
import { HISTORY_STORAGE_KEY, type StoredHistory } from './daily-history';
import { DailyLocators } from './daily-locators';
import { DailyPage } from './daily-page';
import { contentDifferences, DailyStageView, type StageContent, type StageLook } from './daily-stage-view';
import { DailyTemplatePage } from './daily-template-page';
import { isLastStep } from './transport-controls';

/**
 * Everything a player sees about the day's tries on /daily, read in one go so two pages can be compared:
 * the readouts, the `Tries` chips, the editor (Challenge array or Operation list), the playback position,
 * the actions, the line under the actions, the `Streak`, and what each stage draws.
 */
export interface TryView {
  triesLeft: string;
  score: string;
  goalReached: boolean;
  tryResult: string;
  chips: string[];
  /** Each counter as `<name>: <text>`, for example `Comparisons: 34`. */
  counters: string[];
  /** The Challenge array's values, or the Operation list's items. */
  editor: string;
  /** The playback's `Step N of M` readout. */
  step: string;
  progress: number;
  /** The Playback toolbar's play button: `Play`, `Pause` or `Replay`, and whether it is enabled. */
  playButton: string;
  run: string;
  share: string;
  /** The line under the actions (for example `You reached the goal! Your highest score was 36.`). */
  message: string;
  streak: string;
  contents: StageContent[];
  looks: StageLook[];
}

const FIELDS: { key: keyof TryView; label: string }[] = [
  { key: 'triesLeft', label: 'Tries left' },
  { key: 'chips', label: 'Tries list chips' },
  { key: 'score', label: 'Score' },
  { key: 'goalReached', label: 'Goal reached shown' },
  { key: 'tryResult', label: 'Try result' },
  { key: 'counters', label: 'counters' },
  { key: 'editor', label: 'the input (Challenge array or Operation list)' },
  { key: 'step', label: 'the playback step readout' },
  { key: 'progress', label: 'Animation progress' },
  { key: 'playButton', label: 'the Playback play button' },
  { key: 'run', label: 'Run' },
  { key: 'share', label: 'Share' },
  { key: 'message', label: 'the line under the actions' },
  { key: 'streak', label: 'Streak' },
  { key: 'looks', label: 'stage colours' },
];

const show = (value: unknown) => JSON.stringify(value);

/** How `actual` (`actualLabel`) differs from `expected` (`expectedLabel`), one line per field that differs. */
export const viewDifferences = (actual: TryView, expected: TryView, actualLabel: string, expectedLabel: string): string[] => {
  const lines = FIELDS.filter(({ key }) => show(actual[key]) !== show(expected[key])).map(
    ({ key, label }) => `${label}: ${show(actual[key])} ${actualLabel}, but ${show(expected[key])} ${expectedLabel}`,
  );
  const drawn = contentDifferences(expected.contents, actual.contents);
  if (drawn.length > 0) lines.push(`stage drawing (${expectedLabel} -> ${actualLabel}): ${drawn.join('; ')}`);
  return lines;
};

const OPERATION_TEXT = /insert\(\s*-?\d+\s*,\s*-?\d+\s*\)|delete\(\s*-?\d+\s*\)/;

/**
 * Reloading /daily part-way through a run, and reading the page as a `TryView`.
 * Works for every template, including Index drift, which has no Challenge array.
 */
export class DailyMidRun {
  private readonly ui: DailyLocators;
  private readonly stage: DailyStageView;

  constructor(readonly page: Page) {
    this.ui = new DailyLocators(page);
    this.stage = new DailyStageView(page);
  }

  private get chipItems(): Locator {
    return this.page.getByRole('list', { name: 'Tries', exact: true }).getByRole('listitem');
  }

  private get messageLine(): Locator {
    return this.ui.button('Run').locator('xpath=..').locator('xpath=following-sibling::*[@aria-live][1]');
  }

  /** Reloads /daily and waits for the challenge (its Goal and Tries list) to show again. */
  async reload(context: string): Promise<void> {
    await this.page.reload();
    await expect(this.ui.status('Goal'), `${context}: after reloading /daily the Goal readout should show again`).toBeVisible();
    await expect(this.chipItems, `${context}: after reloading /daily the Tries list should show 3 chips again`).toHaveCount(3);
  }

  /**
   * Waits until the run is visibly under way: Animation progress is above 0 and below 100 (and, with
   * `counter`, that readout has climbed above 0), and Skip is still enabled, so the player has seen part
   * of the run but it hasn't ended.
   */
  async waitUntilPartWay(context: string, counter?: string): Promise<void> {
    await expect
      .poll(
        async () => {
          const value = counter ? await this.ui.readNumber(this.ui.status(counter), `"${counter}" status readout`, context) : 1;
          const progress = await this.ui.progress(context);
          const reading = `${counter ? `${counter} ${value}, ` : ''}Animation progress ${progress}`;
          return value > 0 && progress > 0 && progress < 100 ? 'part-way' : reading;
        },
        {
          intervals: [25],
          message: `${context}: test setup: the run should get part-way${counter ? ` ("${counter}" above 0)` : ''} with Animation progress between 0 and 100 (received: the last reading)`,
        },
      )
      .toBe('part-way');
    await this.expectStillRunning(context);
  }

  /** The run hasn't ended: Animation progress is below 100 and Skip is enabled. Test setup, checked just before a reload. */
  async expectStillRunning(context: string): Promise<void> {
    const progress = await this.ui.progress(context);
    expect(progress, `${context}: test setup: the run should still be part-way (Animation progress below 100) just before the reload`).toBeLessThan(100);
    await expect(this.ui.button('Skip'), `${context}: test setup: Skip should still be enabled, because the run hasn't ended`).toBeEnabled();
  }

  /** Clicks Next step or Previous step on the paused playback and waits for Animation progress to move and settle below 100. */
  async step(action: 'Next step' | 'Previous step', context: string): Promise<void> {
    const before = await this.ui.progress(context);
    await this.ui.clickWhenReady(this.ui.playbackButton(action), `${context}: ${action} button in Playback toolbar`, `pressing ${action} mid-run`);
    await expect
      .poll(() => this.ui.progress(context), { intervals: [50], message: `${context}: ${action} should move Animation progress from ${before}` })
      .not.toBe(before);
    let previous = -1;
    await expect
      .poll(
        async () => {
          await this.ui.waitTwoFrames();
          const now = await this.ui.progress(context);
          const settled = now === previous;
          previous = now;
          return settled;
        },
        { intervals: [50], message: `${context}: Animation progress should settle after ${action}` },
      )
      .toBe(true);
    expect(previous, `${context}: test setup: after ${action} the run should still be part-way (Animation progress below 100)`).toBeLessThan(100);
  }

  /**
   * Waits until the page shows `tries` spent tries (Tries left is 3 - `tries`) and localStorage holds that
   * many saved tries, so a reload that follows reads them back rather than racing the save.
   */
  async waitForSave(tries: number, context: string): Promise<void> {
    await expect
      .poll(
        async () => {
          const left = ((await this.ui.status('Tries left').textContent()) ?? '').trim();
          const raw = await this.page.evaluate((key) => window.localStorage.getItem(key), HISTORY_STORAGE_KEY);
          const results = raw ? Object.values((JSON.parse(raw) as StoredHistory).results ?? {}) : [];
          const saved = Math.max(0, ...results.map((result) => result.tries?.length ?? 0));
          return `Tries left ${left}, ${saved} saved`;
        },
        { message: `${context}: Tries left should read ${3 - tries} and localStorage['${HISTORY_STORAGE_KEY}'] should hold ${tries} saved tries before the reload` },
      )
      .toBe(`Tries left ${3 - tries}, ${tries} saved`);
  }

  /** Reads everything in `TryView` once. */
  async view(counters: readonly string[], context: string): Promise<TryView> {
    const optionalText = async (locator: Locator) =>
      (await locator.isVisible()) ? ((await locator.textContent()) ?? '').replace(/\s+/g, ' ').trim() : '(hidden)';
    const state = async (locator: Locator) =>
      !(await locator.isVisible()) ? 'hidden' : (await locator.isEnabled()) ? 'enabled' : 'disabled';
    const playButton = async () => {
      const play = await this.ui.transport.playButton();
      return play ? `${play.name} ${play.enabled ? 'enabled' : 'disabled'}` : '(none)';
    };
    const editor = async () => {
      if (await this.ui.arrayGroup.isVisible()) {
        const texts = await this.ui.slots.allTextContents();
        return `Challenge array [${texts.map((text) => text.match(/-?\d+/)?.[0] ?? text.trim()).join(', ')}]`;
      }
      const ops = await this.page.getByRole('list', { name: 'Operation list', exact: true }).getByRole('listitem').allTextContents();
      return `Operation list [${ops.map((text) => text.match(OPERATION_TEXT)?.[0].replace(/\s+/g, '') ?? text.trim()).join(', ')}]`;
    };
    await this.ui.waitTwoFrames();
    return {
      triesLeft: await optionalText(this.ui.status('Tries left')),
      score: await optionalText(this.ui.status('Score')),
      goalReached: await this.ui.status('Goal reached').isVisible(),
      tryResult: await optionalText(this.ui.status('Try result')),
      chips: (await this.chipItems.allTextContents()).map((text) => text.replace(/\s+/g, ' ').trim()),
      counters: await Promise.all(counters.map(async (name) => `${name}: ${await optionalText(this.ui.status(name))}`)),
      editor: await editor(),
      step: await this.stage.stepText(context),
      progress: await this.ui.roundedProgress(context),
      playButton: await playButton(),
      run: await state(this.ui.button('Run')),
      share: await state(this.ui.button('Share')),
      message: (await this.messageLine.count()) > 0 ? await optionalText(this.messageLine) : '(no line under the actions)',
      streak: await optionalText(this.ui.status('Streak')),
      contents: await this.stage.contents(),
      looks: await this.stage.looks(),
    };
  }

  /** Polls until the page reads the same as `expected`, listing every field that still differs. */
  async expectSameAs(expected: TryView, counters: readonly string[], actualLabel: string, expectedLabel: string, context: string): Promise<void> {
    await expect
      .poll(async () => viewDifferences(await this.view(counters, context), expected, actualLabel, expectedLabel), {
        intervals: [250],
        message: `${context}: the page ${actualLabel} should look exactly as it does ${expectedLabel} (each line is a difference)`,
      })
      .toEqual([]);
  }

  /**
   * While the run plays by itself, samples the page `samples` times and checks that Tries left, Score, the
   * spent chips in the Tries list (the first `spent`), Goal reached, Share and the line under the actions read
   * as in `before`. The running try's chip (chip `spent + 1`) shows the live count as today: a whole number
   * no higher than `final` and with no ⭐, never the try's final score early.
   */
  async expectUnchangedWhilePlaying(before: TryView, spent: number, final: number, counters: readonly string[], samples: number, context: string): Promise<void> {
    for (let i = 1; i <= samples; i += 1) {
      const now = await this.view(counters, `${context}, sample ${i}`);
      const playing = now.progress < 100 && (await this.ui.button('Skip').isEnabled());
      expect(playing, `${context}: test setup: sample ${i} of ${samples} should be taken while the run still plays (progress ${now.progress}); slow the Speed if this fails`).toBe(true);
      this.expectSavedStateUnchanged(now, before, spent, final, `${context}, sample ${i} of ${samples} while the run plays (progress ${now.progress})`);
    }
  }

  /** See `expectUnchangedWhilePlaying`: one reading of the page mid-run against `before` (read before Run). */
  expectSavedStateUnchanged(now: TryView, before: TryView, spent: number, final: number, context: string): void {
    const pick = (view: TryView) => ({
      triesLeft: view.triesLeft,
      score: view.score,
      spentChips: view.chips.slice(0, spent),
      laterChips: view.chips.slice(spent + 1),
      goalReached: view.goalReached,
      share: view.share,
      message: view.message,
    });
    expect(
      pick(now),
      `${context}: Tries left, Score, the spent chips in the Tries list, Goal reached, Share and the line under the actions should stay as they were before Run until the run ends or Skip is pressed`,
    ).toEqual(pick(before));
    const running = now.chips[spent] ?? '(missing)';
    expect(
      /^\d+$/.test(running) && Number(running) <= final,
      `${context}: the running try's chip (chip ${spent + 1}) should show the live count as it climbs (a whole number up to ${final}, no ⭐), not the try's final score early, got ${JSON.stringify(running)}`,
    ).toBe(true);
  }
}

/**
 * Opens /daily in a new browser context with nothing saved, serves `challenge`, lets `play` open the page
 * and finish its `tries` tries with Skip, waits for them to be saved, reloads, and returns the settled `TryView`: what the page should look
 * like after a reload once those tries are saved.
 */
export async function skipThenReloadView(
  browser: Browser,
  challenge: DailyChallenge,
  counters: readonly string[],
  tries: number,
  play: (daily: DailyPage, template: DailyTemplatePage) => Promise<void>,
  context: string,
): Promise<TryView> {
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  try {
    const page = await fresh.newPage();
    const daily = new DailyPage(page);
    const midRun = new DailyMidRun(page);
    await daily.serve(challenge);
    await play(daily, new DailyTemplatePage(page));
    await midRun.waitForSave(tries, `${context} (reference page, after Skip)`);
    await midRun.reload(`${context} (reference page: Skip, then reload)`);
    let previous = '';
    let view: TryView | undefined;
    await expect
      .poll(
        async () => {
          view = await midRun.view(counters, `${context} (reference page)`);
          const now = JSON.stringify(view);
          const settled = now === previous && isLastStep(view.step);
          previous = now;
          return settled;
        },
        { intervals: [200], message: `${context} (reference page): after Skip and reload, the restored run should settle at "Step N of N"` },
      )
      .toBe(true);
    if (!view) throw new Error(`${context} (reference page): no view was read`);
    return view;
  } finally {
    await fresh.close();
  }
}
