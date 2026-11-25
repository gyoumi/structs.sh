import { expect, type BrowserContext, type Page } from '@playwright/test';
import type { DailyChallenge } from './daily-fixtures';
import { DailyHistoryPage, HISTORY_STORAGE_KEY } from './daily-history';
import { DailyLocators } from './daily-locators';
import { DailyMidRun, viewDifferences, type TryView } from './daily-mid-run';
import { DailyPage } from './daily-page';
import { DailyStageView } from './daily-stage-view';
import { DailyTemplatePage } from './daily-template-page';
import { controlTab } from './tab-lifecycle';
import { parseStep } from './transport-controls';

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

const describePlayback = (r: PlaybackReading) =>
  `"${r.step}", play button ${r.button}, Speed ${r.speed}×, Animation progress ${r.progress}`;

/**
 * One /daily tab in a browser context where several tabs share `localStorage` and `BroadcastChannel`, as
 * real tabs of one browser do. `name` ("tab A", "tab B") goes into every failure message.
 * Playing and reading the page reuse `DailyPage`, `DailyTemplatePage`, `DailyHistoryPage`, `DailyMidRun` and
 * `DailyStageView`; pass them a context that names the tab. Hiding and freezing it need `withTabLifecycle`.
 */
export class DailyTab {
  readonly daily: DailyPage;
  readonly template: DailyTemplatePage;
  readonly history: DailyHistoryPage;
  readonly midRun: DailyMidRun;
  readonly stage: DailyStageView;
  private readonly ui: DailyLocators;

  constructor(readonly page: Page, readonly name: string) {
    this.daily = new DailyPage(page);
    this.template = new DailyTemplatePage(page);
    this.history = new DailyHistoryPage(page);
    this.midRun = new DailyMidRun(page);
    this.stage = new DailyStageView(page);
    this.ui = new DailyLocators(page);
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
    const play = await this.daily.transport.playButton();
    return {
      step: await this.stage.stepText(label),
      button: !play ? '(none)' : play.enabled ? play.name : `${play.name} (disabled)`,
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

  async skipEnabled(): Promise<boolean> {
    return this.ui.isReady(this.ui.button('Skip'));
  }

  /**
   * The player switches away from this tab: `document.visibilityState` becomes "hidden", `visibilitychange`
   * fires, and `requestAnimationFrame` callbacks wait, as in a real background tab (see `withTabLifecycle`).
   */
  async hide(): Promise<void> {
    await controlTab(this.page, 'hide');
  }

  /** The player comes back to this tab: "visible" again, `visibilitychange` fires, and waiting animation frames run. */
  async show(): Promise<void> {
    await controlTab(this.page, 'show');
  }

  /**
   * The browser freezes this tab (as Chrome does to a background tab, or DevTools' `Page.setWebLifecycleState`
   * frozen): `freeze` fires, then nothing runs, so `BroadcastChannel` messages, timers and animation frames wait.
   * `document.visibilityState` stays as it is.
   */
  async freeze(): Promise<void> {
    await controlTab(this.page, 'freeze');
  }

  /** The browser unfreezes this tab: `resume` fires on `document`, then the messages, timers and frames that waited run in order. */
  async resume(): Promise<void> {
    await controlTab(this.page, 'resume');
  }

  /** Polls until this tab's `Step N of M` reaches at least `n`. Test setup. */
  async waitForStep(n: number, context: string): Promise<void> {
    await expect
      .poll(async () => parseStep((await this.playback(context)).step)?.step ?? -1, { timeout: 30_000, message: `${context}: test setup: ${this.name} should reach Step ${n}` })
      .toBeGreaterThanOrEqual(n);
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
  await tab.daily.serve(challenge);
  await tab.open(label);
  return tab;
}

/** Removes `BroadcastChannel` from every page the context opens from now on, as in a browser without it. */
export async function withoutBroadcastChannel(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    delete (window as { BroadcastChannel?: unknown }).BroadcastChannel;
  });
}

/**
 * Polls, for up to `timeout` ms, until `tab` has caught up with `other`: the same Speed and step count, and
 * either both playing (Pause offered) with `Step N` at most one apart, or both paused at exactly the same step.
 */
export async function expectCaughtUp(tab: DailyTab, other: DailyTab, playing: boolean, context: string, timeout = 1_000): Promise<void> {
  await expect
    .poll(
      async () => {
        const want = await other.playback(context);
        const got = await tab.playback(context);
        const [w, g] = [parseStep(want.step), parseStep(got.step)];
        const problems: string[] = [];
        const state = playing ? 'Pause' : 'Play';
        if (want.button !== state) problems.push(`test setup: ${other.name} should be ${playing ? 'playing' : 'paused'}, but shows ${describePlayback(want)}`);
        if (got.button !== state) problems.push(`${tab.name} should be ${playing ? 'playing (Pause offered)' : 'paused (Play offered)'} as ${other.name} is`);
        if (got.speed !== want.speed) problems.push(`${tab.name} should play at ${other.name}'s Speed ${want.speed}×`);
        const apart = !w || !g || w.of !== g.of ? Infinity : Math.abs(w.step - g.step);
        if (apart > (playing ? 1 : 0)) problems.push(`${tab.name} should be on ${other.name}'s step${playing ? ' (or one either side)' : ''}`);
        return problems.length ? [...problems, `${tab.name}: ${describePlayback(got)}`, `${other.name}: ${describePlayback(want)}`] : [];
      },
      { intervals: [100], timeout, message: `${context}: within about half a second, ${tab.name} should move to the step ${other.name} is on now, in the same playing or paused state and Speed (each line is a difference, then both readings)` },
    )
    .toEqual([]);
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
  for (const tab of tabs) start.push(parseStep((await tab.playback(context)).step)?.step ?? null);
  await expect
    .poll(
      async () => {
        const readings: PlaybackReading[] = [];
        for (const tab of tabs) readings.push(await tab.playback(context));
        const problems: string[] = [];
        readings.forEach((reading, i) => {
          const name = tabs[i].name;
          const step = parseStep(reading.step);
          if (reading.button !== 'Pause') problems.push(`${name} should be playing (offering Pause), but shows ${describePlayback(reading)}`);
          if (!step || start[i] === null || step.step <= (start[i] ?? 0)) problems.push(`${name}'s step should climb past Step ${start[i] ?? '(none)'} by itself, but shows ${describePlayback(reading)}`);
          if (i > 0 && reading.speed !== readings[0].speed) problems.push(`${name} plays at Speed ${reading.speed}×, but ${tabs[0].name} at ${readings[0].speed}×`);
          if (i > 0 && step?.of !== parseStep(readings[0].step)?.of) problems.push(`${name} shows "${reading.step}", but ${tabs[0].name} shows "${readings[0].step}" (a different run)`);
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
        const step = parseStep(reading.step);
        for (const { name, final } of run.counters) {
          const value = await tab.template.statusNumber(name, `${context} (${tab.name})`);
          if (value > 0 && value < final && reading.progress < 100) climbed.add(name);
          last.set(name, `${value} at Animation progress ${reading.progress}`);
          if (!climbed.has(name)) problems.push(`"${name}" should climb through a value between 0 and ${final} while the run plays (last read ${last.get(name)})`);
        }
        const view = await tab.view([], context);
        if (view.editor !== run.input) problems.push(`the input should be ${source.name}'s ${run.input}, but is ${view.editor}`);
        if (!(await tab.editorFrozen())) problems.push('the input should be frozen (not editable) while the run plays');
        if (await tab.daily.canRun()) problems.push('Run should be disabled while the run plays');
        if (!(await tab.skipEnabled())) problems.push('Skip should be enabled while the run plays');
        if (reading.button !== 'Pause') problems.push(`the playback should be playing (offering Pause), but shows ${describePlayback(reading)}`);
        if (reading.speed !== run.speed) problems.push(`Speed should be ${source.name}'s ${run.speed}×, but is ${reading.speed}×`);
        if (!step || step.of !== run.steps || step.step === 0) problems.push(`the step readout should read "Step N of ${run.steps}" with N above 0, as in ${source.name}, but reads "${reading.step}"`);
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
    .poll(async () => (steps = parseStep((await tab.playback(context)).step)?.of ?? 0), {
      message: `${context}: test setup: ${tab.name} should show a "Step N of M" readout once Run is pressed`,
    })
    .toBeGreaterThan(0);
  return steps;
}

/** Polls until `localStorage` holds `tries` tries for `date`, so each run was recorded once and not again by another tab. */
export async function expectRecorded(tab: DailyTab, date: string, tries: number, context: string): Promise<void> {
  await expect
    .poll(async () => (await tab.history.savedHistory()).parsed?.results?.[date]?.tries?.length ?? 0, {
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
