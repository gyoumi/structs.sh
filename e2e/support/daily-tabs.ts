import { expect, type BrowserContext, type Page } from '@playwright/test';
import type { DailyChallenge } from './daily-fixtures';
import { HISTORY_STORAGE_KEY, type StoredHistory } from './daily-history';
import { DailyLocators } from './daily-locators';
import { DailyMidRun, viewDifferences, type TryView } from './daily-mid-run';
import { DailyPage } from './daily-page';
import { DailyStageView } from './daily-stage-view';
import { DailyTemplatePage } from './daily-template-page';

/** Where one tab's playback is: the `Step N of M` readout, the play button, the Speed and Animation progress. */
export interface PlaybackReading {
  /** `Step N of M` or `No steps yet`. */
  step: string;
  /** The Playback toolbar's play button: `Play`, `Pause` or `Replay`, with ` (disabled)` when disabled. */
  button: string;
  speed: number;
  /** Animation progress, rounded. */
  progress: number;
}

/** A counter readout and the count it ends the run at. */
export interface CounterGoal {
  name: string;
  final: number;
}

const STEP = /^Step (\d+) of (\d+)$/;
const stepOf = (text: string) => {
  const match = text.match(STEP);
  return match ? { n: Number(match[1]), of: Number(match[2]) } : null;
};
export const describePlayback = (r: PlaybackReading) =>
  `"${r.step}", play button ${r.button}, Speed ${r.speed}×, Animation progress ${r.progress}`;

/**
 * One /daily tab in a browser context where several tabs share `localStorage` and `BroadcastChannel`, as
 * real tabs of one browser do. `name` ("tab A", "tab B") goes into every failure message.
 * Playing and reading the page reuse `DailyPage`, `DailyTemplatePage`, `DailyMidRun` and `DailyStageView`.
 */
export class DailyTab {
  readonly daily: DailyPage;
  readonly template: DailyTemplatePage;
  readonly midRun: DailyMidRun;
  readonly stage: DailyStageView;
  private readonly ui: DailyLocators;

  constructor(readonly page: Page, readonly name: string) {
    this.daily = new DailyPage(page);
    this.template = new DailyTemplatePage(page);
    this.midRun = new DailyMidRun(page);
    this.stage = new DailyStageView(page);
    this.ui = new DailyLocators(page);
  }

  /** Answers this tab's GET /api/daily with `challenge`. */
  async serve(challenge: DailyChallenge): Promise<void> {
    await this.page.route('**/api/daily', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(challenge) }),
    );
  }

  /** Opens /daily and waits for the challenge (its Goal and Tries list) to show, for any template. */
  async open(context: string): Promise<void> {
    await this.page.goto('/daily');
    await this.waitLoaded(`${context}: after opening /daily in ${this.name}`);
  }

  /** Reloads /daily in this tab and waits for the challenge to show again. */
  async reload(context: string): Promise<void> {
    await this.page.reload();
    await this.waitLoaded(`${context}: after reloading /daily in ${this.name}`);
  }

  /** Reads the playback once. */
  async playback(context: string): Promise<PlaybackReading> {
    const label = `${context} (${this.name})`;
    let button = '(none)';
    for (const name of ['Play', 'Pause', 'Replay']) {
      const locator = this.ui.playback.getByRole('button', { name, exact: true });
      if (await locator.isVisible()) {
        button = (await locator.isEnabled()) ? name : `${name} (disabled)`;
        break;
      }
    }
    return {
      step: await this.stage.stepText(label),
      button,
      speed: await this.daily.transport.speed(),
      progress: await this.ui.roundedProgress(label),
    };
  }

  /** Everything a player sees about the day's tries in this tab (see `TryView`). */
  async view(counters: readonly string[], context: string): Promise<TryView> {
    return this.midRun.view(counters, `${context} (${this.name})`);
  }

  /** Clicks the Skip action button, which must be enabled while a run plays in this tab, even one started in another tab. */
  async skip(context: string): Promise<void> {
    const skip = this.ui.button('Skip');
    await expect(skip, `${context}: ${this.name} should show the Skip button`).toBeVisible();
    await expect(skip, `${context}: Skip should be enabled in ${this.name}, because the run is playing on its stage`).toBeEnabled();
    await skip.click();
  }

  /** Clicks the Animation progress slider's track at `fraction` (0 to 1) of its length, as a player seeking does. */
  async seek(fraction: number, context: string): Promise<void> {
    const track = this.page.locator('[data-slot="slider-control"]').filter({ has: this.ui.timeline });
    await expect(this.ui.timeline, `${context}: ${this.name} should show the Animation progress slider`).toBeEnabled();
    const box = await track.boundingBox();
    if (!box) throw new Error(`${context}: the Animation progress slider in ${this.name} has no bounding box`);
    await this.page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
  }

  /** Whether the input can't be edited: every Challenge array slot is disabled, or the Operation builder's buttons are. */
  async editorFrozen(): Promise<boolean> {
    if (await this.ui.arrayGroup.isVisible()) {
      const slots = this.ui.slots;
      for (let i = 0; i < (await slots.count()); i += 1) if (await slots.nth(i).isEnabled()) return false;
      return true;
    }
    const builder = this.page.getByRole('group', { name: 'Operation builder', exact: true });
    return !(await builder.getByRole('button', { name: 'Add operation', exact: true }).isEnabled());
  }

  async runEnabled(): Promise<boolean> {
    return this.ui.isReady(this.ui.button('Run'));
  }

  async skipEnabled(): Promise<boolean> {
    return this.ui.isReady(this.ui.button('Skip'));
  }

  /** The first number in the named status readout. */
  async statusNumber(name: string, context: string): Promise<number> {
    return this.ui.readNumber(this.ui.status(name), `"${name}" status readout in ${this.name}`, context);
  }

  /** The page shows no "Updated from another tab." notice: this tab played the run, so it shows the result as the running tab does. */
  async expectNoSyncedNotice(context: string): Promise<void> {
    await expect(
      this.page.getByText('Updated from another tab.'),
      `${context}: ${this.name} played the run itself, so it should show the result as the tab that pressed Run does, not "Updated from another tab."`,
    ).toHaveCount(0);
  }

  /** The page shows the "Updated from another tab." notice, as tabs without a shared run do today. */
  async expectSyncedNotice(context: string): Promise<void> {
    await expect(this.page.getByText('Updated from another tab.'), `${context}: ${this.name} should show "Updated from another tab."`).toBeVisible();
  }

  /** How many tries `localStorage['daily.history']` holds for `date` (shared by every tab of the browser). */
  async savedTries(date: string): Promise<number> {
    const raw = await this.page.evaluate((key) => window.localStorage.getItem(key), HISTORY_STORAGE_KEY);
    if (!raw) return 0;
    return (JSON.parse(raw) as StoredHistory).results?.[date]?.tries?.length ?? 0;
  }

  /** `BroadcastChannel` is missing in this tab (see `withoutBroadcastChannel`). Test setup. */
  async expectNoBroadcastChannel(context: string): Promise<void> {
    const kind = await this.page.evaluate(() => typeof (window as { BroadcastChannel?: unknown }).BroadcastChannel);
    expect(kind, `${context}: test setup: BroadcastChannel should be unavailable in ${this.name}`).toBe('undefined');
  }

  private async waitLoaded(context: string): Promise<void> {
    await expect(this.ui.status('Goal'), `${context}: the Goal readout should show`).toBeVisible();
    await expect(
      this.page.getByRole('list', { name: 'Tries', exact: true }).getByRole('listitem'),
      `${context}: the Tries list should show 3 chips`,
    ).toHaveCount(3);
  }
}

/** Opens another tab in the same browser context (shared `localStorage` and `BroadcastChannel`), serves `challenge` and opens /daily. */
export async function openTab(context: BrowserContext, challenge: DailyChallenge, name: string, label: string): Promise<DailyTab> {
  const tab = new DailyTab(await context.newPage(), name);
  await tab.serve(challenge);
  await tab.open(label);
  return tab;
}

/** Removes `BroadcastChannel` from every page the context opens from now on, as in a browser without it. */
export async function withoutBroadcastChannel(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    delete (window as { BroadcastChannel?: unknown }).BroadcastChannel;
  });
}

/** Polls until `tab` reads exactly as `other` does (both read on each poll, Animation progress within 1), listing each field that differs. */
export async function expectSameView(tab: DailyTab, other: DailyTab, counters: readonly string[], context: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const expected = await other.view(counters, context);
        const actual = await tab.view(counters, context);
        // The same step can round to Animation progress 1 apart in two tabs; the step readout is compared exactly.
        if (Math.abs(actual.progress - expected.progress) <= 1) actual.progress = expected.progress;
        return viewDifferences(actual, expected, `in ${tab.name}`, `in ${other.name}`);
      },
      { intervals: [250], message: `${context}: ${tab.name} should look exactly as ${other.name} does (each line is a difference)` },
    )
    .toEqual([]);
}

/**
 * Polls until every tab's playback is paused (or complete) at the same point: the same `Step N of M`, play
 * button and Speed, and Animation progress within 1 of the first tab's. Returns the first tab's reading.
 */
export async function expectPausedTogether(tabs: readonly DailyTab[], context: string): Promise<PlaybackReading> {
  let readings: PlaybackReading[] = [];
  await expect
    .poll(
      async () => {
        readings = [];
        for (const tab of tabs) readings.push(await tab.playback(context));
        const problems: string[] = [];
        readings.forEach((reading, i) => {
          if (reading.button === 'Pause') problems.push(`${tabs[i].name} is still playing (${describePlayback(reading)})`);
          const [first] = readings;
          const apart = reading.step !== first.step || reading.button !== first.button || reading.speed !== first.speed || Math.abs(reading.progress - first.progress) > 1;
          if (i > 0 && apart) {
            problems.push(`${tabs[i].name} shows ${describePlayback(reading)}, but ${tabs[0].name} shows ${describePlayback(readings[0])}`);
          }
        });
        return problems;
      },
      { intervals: [100], message: `${context}: every tab should be paused at the same step, with the same play button, Speed and Animation progress (each line is a difference)` },
    )
    .toEqual([]);
  return readings[0];
}

/**
 * Polls until every tab is playing (`Pause` offered), at the same Speed and step count, and each tab's
 * `Step N` has moved past where it was when this was called.
 */
export async function expectPlayingTogether(tabs: readonly DailyTab[], context: string): Promise<void> {
  const start: (number | null)[] = [];
  for (const tab of tabs) start.push(stepOf((await tab.playback(context)).step)?.n ?? null);
  await expect
    .poll(
      async () => {
        const readings: PlaybackReading[] = [];
        for (const tab of tabs) readings.push(await tab.playback(context));
        const problems: string[] = [];
        readings.forEach((reading, i) => {
          const name = tabs[i].name;
          const step = stepOf(reading.step);
          if (reading.button !== 'Pause') problems.push(`${name} should be playing (offering Pause), but shows ${describePlayback(reading)}`);
          if (!step || start[i] === null || step.n <= (start[i] ?? 0)) problems.push(`${name}'s step should climb past Step ${start[i] ?? '(none)'} by itself, but shows ${describePlayback(reading)}`);
          if (i > 0 && reading.speed !== readings[0].speed) problems.push(`${name} plays at Speed ${reading.speed}×, but ${tabs[0].name} at ${readings[0].speed}×`);
          if (i > 0 && step?.of !== stepOf(readings[0].step)?.of) problems.push(`${name} shows "${reading.step}", but ${tabs[0].name} shows "${readings[0].step}" (a different run)`);
        });
        return problems;
      },
      { intervals: [100], message: `${context}: every tab should play the same run together (each line is a difference)` },
    )
    .toEqual([]);
}

/**
 * While the run plays in `source`, polls `tab` until it has been seen playing the same run on its stage:
 * the editor shows `input` and is frozen, Run is disabled and Skip enabled, the playback offers Pause at
 * `source`'s Speed with `Step N of <steps>` climbing past 0, and each counter has been read strictly between
 * 0 and its final count while Animation progress was below 100.
 */
export async function expectPlaysRun(
  tab: DailyTab,
  source: DailyTab,
  run: { input: string; steps: number; speed: number; counters: readonly CounterGoal[] },
  context: string,
): Promise<void> {
  const climbed = new Set<string>();
  const last = new Map<string, string>();
  await expect
    .poll(
      async () => {
        const problems: string[] = [];
        const reading = await tab.playback(context);
        const step = stepOf(reading.step);
        for (const { name, final } of run.counters) {
          const value = await tab.statusNumber(name, context);
          if (value > 0 && value < final && reading.progress < 100) climbed.add(name);
          last.set(name, `${value} at Animation progress ${reading.progress}`);
          if (!climbed.has(name)) problems.push(`"${name}" should climb through a value between 0 and ${final} while the run plays (last read ${last.get(name)})`);
        }
        const view = await tab.view([], context);
        if (view.editor !== run.input) problems.push(`the input should be ${source.name}'s ${run.input}, but is ${view.editor}`);
        if (!(await tab.editorFrozen())) problems.push('the input should be frozen (not editable) while the run plays');
        if (await tab.runEnabled()) problems.push('Run should be disabled while the run plays');
        if (!(await tab.skipEnabled())) problems.push('Skip should be enabled while the run plays');
        if (reading.button !== 'Pause') problems.push(`the playback should be playing (offering Pause), but shows ${describePlayback(reading)}`);
        if (reading.speed !== run.speed) problems.push(`Speed should be ${source.name}'s ${run.speed}×, but is ${reading.speed}×`);
        if (!step || step.of !== run.steps || step.n === 0) problems.push(`the step readout should read "Step N of ${run.steps}" with N above 0, as in ${source.name}, but reads "${reading.step}"`);
        return problems;
      },
      {
        intervals: [100],
        timeout: 20_000,
        message: `${context}: ${tab.name} should play ${source.name}'s run on its own stage (each line is what ${tab.name} still doesn't show)`,
      },
    )
    .toEqual([]);
}

/** Waits until `tab`'s playback shows `Step N of M` and returns M, the run's step count. Test setup. */
export async function stepCount(tab: DailyTab, context: string): Promise<number> {
  let steps = 0;
  await expect
    .poll(async () => (steps = stepOf((await tab.playback(context)).step)?.of ?? 0), {
      message: `${context}: test setup: ${tab.name} should show a "Step N of M" readout once Run is pressed`,
    })
    .toBeGreaterThan(0);
  return steps;
}

/** Polls until `localStorage` holds `tries` tries for `date`, so each run was recorded once and not again by another tab. */
export async function expectRecorded(tab: DailyTab, date: string, tries: number, context: string): Promise<void> {
  await expect
    .poll(() => tab.savedTries(date), {
      message: `${context}: localStorage['${HISTORY_STORAGE_KEY}'] should hold ${tries} saved tries for ${date}: each run recorded once, not once per tab`,
    })
    .toBe(tries);
}

/** A tab's view while it ignores another tab's run: nothing it shows may change. */
export function expectViewUnchanged(now: TryView, before: TryView, tab: DailyTab, context: string): void {
  expect(
    viewDifferences(now, before, 'now', 'before the other tab pressed Run'),
    `${context}: ${tab.name} should ignore the run and look exactly as it did before (each line is a difference)`,
  ).toEqual([]);
}
