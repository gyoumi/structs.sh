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

  /**
   * The player switches away from this tab: `document.visibilityState` becomes "hidden", `visibilitychange`
   * fires, and `requestAnimationFrame` callbacks wait, as in a real background tab (see `withTabLifecycle`).
   */
  async hide(): Promise<void> {
    await this.page.evaluate(() => (window as unknown as { e2eTab: TabControls }).e2eTab.hide());
  }

  /** The player comes back to this tab: "visible" again, `visibilitychange` fires, and waiting animation frames run. */
  async show(): Promise<void> {
    await this.page.evaluate(() => (window as unknown as { e2eTab: TabControls }).e2eTab.show());
  }

  /**
   * The browser freezes this tab (as Chrome does to a background tab, or DevTools' `Page.setWebLifecycleState`
   * frozen): `freeze` fires, then nothing runs, so `BroadcastChannel` messages, timers and animation frames wait.
   * `document.visibilityState` stays as it is.
   */
  async freeze(): Promise<void> {
    await this.page.evaluate(() => (window as unknown as { e2eTab: TabControls }).e2eTab.freeze());
  }

  /** The browser unfreezes this tab: `resume` fires on `document`, then the messages, timers and frames that waited run in order. */
  async resume(): Promise<void> {
    await this.page.evaluate(() => (window as unknown as { e2eTab: TabControls }).e2eTab.resume());
  }

  /** Polls until this tab's `Step N of M` reaches at least `n`. Test setup. */
  async waitForStep(n: number, context: string): Promise<void> {
    await expect
      .poll(async () => stepOf((await this.playback(context)).step)?.n ?? -1, { timeout: 30_000, message: `${context}: test setup: ${this.name} should reach Step ${n}` })
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

/** The controls `withTabLifecycle` puts on `window.e2eTab`. */
interface TabControls {
  hide(): void;
  show(): void;
  freeze(): void;
  resume(): void;
}

/**
 * Lets tests hide and freeze tabs as a real browser does. Headless Chromium keeps every page visible and
 * animating, and `Page.setWebLifecycleState` (CDP) frozen neither fired `freeze`/`resume` nor held back
 * `BroadcastChannel` messages there (checked on 6b632f38), so this init script plays the browser's part
 * on every page the context opens from now on:
 * - hidden: `document.visibilityState` is "hidden" and `document.hidden` true, `visibilitychange` fires on
 *   the way in and out, and `requestAnimationFrame` callbacks wait until the tab is shown (messages and
 *   timers still run, as in a real background tab);
 * - frozen (from visible): `freeze` fires on the way in and `resume` on the way out; while frozen,
 *   `BroadcastChannel` message listeners, `setTimeout` callbacks and animation frames wait, then run in order
 *   after `resume`, and the tab is visible again.
 */
export async function withTabLifecycle(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    /** A frozen tab here is one that was visible (the tests freeze a visible tab, as DevTools can). */
    let state: 'visible' | 'hidden' | 'frozen' = 'visible';
    const realFrame = window.requestAnimationFrame.bind(window);
    const realCancel = window.cancelAnimationFrame.bind(window);
    const realTimeout = window.setTimeout.bind(window);
    const frames = new Map<number, FrameRequestCallback>();
    const tasks: (() => void)[] = [];
    let nextId = -1;
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (state === 'hidden' ? 'hidden' : 'visible') });
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => state === 'hidden' });
    window.requestAnimationFrame = (callback) => {
      if (state === 'visible') return realFrame(callback);
      const id = nextId;
      nextId -= 1;
      frames.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      if (id < 0) frames.delete(id);
      else realCancel(id);
    };
    window.setTimeout = ((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
      realTimeout(() => {
        const run = () => (typeof handler === 'function' ? (handler as (...a: unknown[]) => void)(...args) : undefined);
        if (state === 'frozen') tasks.push(run);
        else run();
      }, ms)) as typeof window.setTimeout;
    const Real = window.BroadcastChannel;
    if (Real) {
      const wrapped = new WeakMap<object, EventListener>();
      const hold = (channel: BroadcastChannel, listener: (event: MessageEvent) => void) => (event: Event) => {
        if (state === 'frozen') tasks.push(() => listener.call(channel, event as MessageEvent));
        else listener.call(channel, event as MessageEvent);
      };
      class HeldChannel extends Real {
        private handler: ((event: MessageEvent) => void) | null = null;
        addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
          if (type !== 'message') return super.addEventListener(type, listener, options);
          const fn = typeof listener === 'function' ? listener : (event: Event) => listener.handleEvent(event);
          const held = hold(this, fn as (event: MessageEvent) => void);
          wrapped.set(listener, held);
          super.addEventListener(type, held, options);
        }
        removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void {
          super.removeEventListener(type, wrapped.get(listener) ?? listener, options);
        }
        get onmessage(): ((event: MessageEvent) => void) | null {
          return this.handler;
        }
        set onmessage(fn: ((event: MessageEvent) => void) | null) {
          this.handler = fn;
          super.onmessage = fn ? hold(this, fn) : null;
        }
      }
      window.BroadcastChannel = HeldChannel;
    }
    const runFrames = () => {
      const waiting = [...frames.values()];
      frames.clear();
      waiting.forEach((callback) => realFrame(callback));
    };
    const controls = {
      hide: () => {
        state = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
      },
      show: () => {
        state = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        runFrames();
      },
      freeze: () => {
        document.dispatchEvent(new Event('freeze'));
        state = 'frozen';
      },
      resume: () => {
        state = 'visible';
        document.dispatchEvent(new Event('resume'));
        tasks.splice(0).forEach((task) => task());
        runFrames();
      },
    };
    (window as unknown as { e2eTab: typeof controls }).e2eTab = controls;
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
        const [w, g] = [stepOf(want.step), stepOf(got.step)];
        const problems: string[] = [];
        const state = playing ? 'Pause' : 'Play';
        if (want.button !== state) problems.push(`test setup: ${other.name} should be ${playing ? 'playing' : 'paused'}, but shows ${describePlayback(want)}`);
        if (got.button !== state) problems.push(`${tab.name} should be ${playing ? 'playing (Pause offered)' : 'paused (Play offered)'} as ${other.name} is`);
        if (got.speed !== want.speed) problems.push(`${tab.name} should play at ${other.name}'s Speed ${want.speed}×`);
        const apart = !w || !g || w.of !== g.of ? Infinity : Math.abs(w.n - g.n);
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
