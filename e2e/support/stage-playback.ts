import { expect, type Browser, type Page } from '@playwright/test';
import { DailyStageView, viewInFreshContext, type StageView, type Theme } from './daily-stage-view';
import type { TopicSlug } from './topics';
import { parseStep, TransportControls } from './transport-controls';
import { VisualiserPage } from './visualiser-page';

/** The play button's current label in the `Playback` toolbar, and the `Step N of M` readout. */
export interface PlaybackState {
  button: 'Play' | 'Pause' | 'Replay' | '(no play button)';
  step: string;
}

/** Wide enough for the playback's "Step N of M" readout, which only shows on screens wider than 1360px. */
export const WIDE = { width: 1440, height: 900 };

/**
 * `DailyStageView` (theme toggle, stage looks, `Step N of M`) on a visualiser page: its stage, header
 * `Dark mode` toggle and `Playback` toolbar are the same components as on /daily.
 */
export { DailyStageView as VisualiserStageView };

/**
 * Where playback is, as the player sees it: which of Play, Pause or Replay the toolbar offers, and the step
 * readout. Works on /daily and on the visualiser pages.
 */
export class StagePlayback {
  readonly transport: TransportControls;
  private readonly view: DailyStageView;

  constructor(readonly page: Page) {
    this.transport = new TransportControls(page);
    this.view = new DailyStageView(page);
  }

  async state(context: string): Promise<PlaybackState> {
    const button = (await this.transport.playButton())?.name ?? '(no play button)';
    return { button, step: await this.view.stepText(context) };
  }

  /** Polls until the play button and step readout equal `expected`; the failure shows the last state seen. */
  async expectState(expected: PlaybackState, message: string, timeout = 10_000): Promise<void> {
    await expect
      .poll(() => this.state(message), { message: `${message} (play button label and "Step N of M" readout)`, timeout, intervals: [100] })
      .toEqual(expected);
  }

  /** `Animation progress` doesn't move for `ms` milliseconds: playback has stopped. */
  async expectProgressStays(message: string, ms = 1_500): Promise<void> {
    const at = await this.transport.progress(message);
    await expect(
      expect.poll(() => this.transport.progress(message), { timeout: ms, intervals: [100] }).not.toBe(at),
      `${message}: Animation progress should stay at ${at} for ${ms} ms, but it moved (playback kept going)`,
    ).rejects.toThrow();
  }

  /** The readout's step and step count: `Step 3 of 7` is { step: 3, of: 7 }, `No steps yet` is null. */
  async position(context: string): Promise<{ step: number; of: number } | null> {
    return parseStep(await this.view.stepText(context));
  }

  /** From a paused point, presses `Next step` one step at a time, waiting for each to finish, until the readout shows `step`. */
  async stepTo(step: number, context: string): Promise<void> {
    for (let pressed = 0; pressed < 200; pressed += 1) {
      const at = await this.position(context);
      if (!at) throw new Error(`${context}: the playback shows "No steps yet", so it can't step to step ${step}`);
      if (at.step >= step) return;
      await this.transport.stepForward();
      await this.expectState(
        { button: 'Play', step: `Step ${at.step + 1} of ${at.of}` },
        `${context}: Next step from "Step ${at.step} of ${at.of}" should stop one step on, paused (Play offered)`,
        20_000,
      );
    }
  }

  /**
   * Presses `Next step` and checks the step is still animating (the toolbar offers Pause), so the caller
   * can switch theme in the middle of it. Play the run slowly (0.25×) so one step lasts a few seconds.
   */
  async startOneStep(context: string): Promise<void> {
    await this.transport.stepForward();
    await this.view.expectPlaybackButton('Pause', true, `${context}: right after Next step, that one step should be animating (Pause offered)`);
  }

  /**
   * From a run at its end, goes back to the start, sets Speed 0.25× (one step lasts a few seconds) and steps to
   * step 1, then presses Next step and switches light to dark while that step animates. Playback must stop at
   * the end of that one step, paused at `Step 2 of M`, and stay there, in dark.
   */
  async expectOneStepSurvivesSwitch(context: string): Promise<PlaybackState> {
    const ctx = `${context}, Back to the start, speed 0.25×, Next step to step 1`;
    await this.transport.rewind();
    await this.transport.setSpeed(0.25);
    await this.stepTo(1, ctx);
    const at = await this.position(ctx);
    expect(at?.step, `${ctx}: the playback should show "Step 1 of M"`).toBe(1);

    const switched = `${ctx}, then Next step and switching light to dark while that step animates`;
    await this.startOneStep(switched);
    await this.view.switchTheme('dark', switched);
    await this.expectState(
      { button: 'Play', step: `Step 2 of ${at?.of}` },
      `${switched}: playback should stop at the end of that one step, paused at "Step 2 of ${at?.of}" with Play offered, as it does without a theme switch. "No steps yet" means the switch dropped the run; Pause or a later step means it turned the single step into continuous playback`,
      12_000,
    );
    await this.expectProgressStays(`${switched}, after the step ended`);
    await this.view.expectTheme('dark', switched);
    return this.state(switched);
  }
}

/**
 * Opens `/visualiser/<topic>/<data>` in a new browser context whose system colour scheme is `theme`, 1440 wide
 * with nothing saved, plays `play` there and returns the settled stage view: what the stage looks like when
 * the page is freshly loaded in that theme.
 */
export async function viewVisualiserInFreshPage(
  browser: Browser,
  theme: Theme,
  topic: TopicSlug,
  data: number[],
  play: (visualiser: VisualiserPage) => Promise<void>,
  context: string,
): Promise<StageView> {
  const open = async (page: Page) => {
    const visualiser = new VisualiserPage(page);
    await visualiser.open(topic, data);
    return visualiser;
  };
  return viewInFreshContext(browser, { theme, viewport: WIDE }, open, play, context);
}
