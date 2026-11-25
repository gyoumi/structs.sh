import { expect, type Locator, type Page } from '@playwright/test';

const STEP = /^\s*Step (\d+) of (\d+)\s*$/;

/** The playback's step readout as numbers: `Step 3 of 7` is { step: 3, of: 7 }; `No steps yet` (or anything else) is null. */
export const parseStep = (text: string): { step: number; of: number } | null => {
  const match = text.match(STEP);
  return match ? { step: Number(match[1]), of: Number(match[2]) } : null;
};

/** The step readout is at the run's last step: `Step N of N`. */
export const isLastStep = (text: string): boolean => {
  const at = parseStep(text);
  return at !== null && at.step === at.of;
};

/**
 * The playback controls every visualiser and /daily share: the `Playback` toolbar (Play, Pause,
 * Replay, Previous step, Next step, Back to the start, Skip to the end), the `Animation progress`
 * slider and the `Speed` picker. `VisualiserPage` and `DailyPage` expose this as `transport`, so a
 * redesign of these controls changes this file only.
 */
export class TransportControls {
  constructor(private readonly page: Page) {}

  // ---------------------------------------------------------------- locators

  get toolbar(): Locator {
    return this.page.getByRole('toolbar', { name: 'Playback' });
  }

  button(name: string): Locator {
    return this.toolbar.getByRole('button', { name });
  }

  get timeline(): Locator {
    return this.page.getByRole('slider', { name: 'Animation progress' });
  }

  get speedPicker(): Locator {
    return this.page.getByRole('combobox', { name: 'Speed' });
  }

  // ---------------------------------------------------------------- reading

  /** How far through the animation playback is, from 0 to 100 (not rounded). */
  async progress(context?: string): Promise<number> {
    const prefix = context ? `${context}: ` : '';
    await expect(this.timeline, `${prefix}Animation progress slider should be visible when reading playback progress`).toBeVisible();
    const ariaNow = await this.timeline.getAttribute('aria-valuenow');
    if (ariaNow !== null && ariaNow.trim() !== '') return Number(ariaNow);
    return Number(await this.timeline.inputValue());
  }

  async roundedProgress(context?: string): Promise<number> {
    return Math.round(await this.progress(context));
  }

  /** The first of Play, Pause or Replay the toolbar shows, and whether it is enabled; null when it shows none. */
  async playButton(): Promise<{ name: 'Play' | 'Pause' | 'Replay'; enabled: boolean } | null> {
    for (const name of ['Play', 'Pause', 'Replay'] as const) {
      const button = this.toolbar.getByRole('button', { name, exact: true });
      if (await button.isVisible()) return { name, enabled: await button.isEnabled() };
    }
    return null;
  }

  // ---------------------------------------------------------------- buttons

  async play(): Promise<void> {
    await this.clickWhenReady(this.button('Play'), 'Play button in Playback toolbar', 'resuming playback');
  }

  async pause(): Promise<void> {
    await this.clickWhenReady(this.button('Pause'), 'Pause button in Playback toolbar', 'pausing playback');
  }

  async replay(): Promise<void> {
    await this.clickWhenReady(this.button('Replay'), 'Replay button in Playback toolbar', 'replaying the animation');
  }

  async stepForward(): Promise<void> {
    await this.clickWhenReady(this.button('Next step'), 'Next step button in Playback toolbar', 'stepping forward');
  }

  async stepBack(): Promise<void> {
    await this.clickWhenReady(this.button('Previous step'), 'Previous step button in Playback toolbar', 'stepping back');
  }

  /** Clicks `Back to the start` without waiting for the timeline, for checks that read the drawing only. */
  async clickBackToStart(): Promise<void> {
    await this.clickWhenReady(
      this.button('Back to the start'),
      'Back to the start button in Playback toolbar',
      'rewinding playback to the start',
    );
  }

  /** Clicks `Back to the start`, waits for Animation progress to reach 0, then lets two frames draw. */
  async rewind(): Promise<void> {
    await this.clickBackToStart();
    await expect
      .poll(() => this.progress(), { message: 'Back to the start should move Animation progress to 0' })
      .toBe(0);
    await this.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
  }

  /** Clicks `Skip to the end` and waits for rounded Animation progress to reach 100. */
  async skipToEnd(context?: string): Promise<void> {
    const prefix = context ? `${context}: ` : '';
    await this.clickWhenReady(
      this.button('Skip to the end'),
      `${prefix}Skip to the end button in Playback toolbar`,
      'skipping to the end of playback',
    );
    await expect
      .poll(() => this.roundedProgress(context), {
        message: `${prefix}Skip to the end should move rounded Animation progress to 100`,
      })
      .toBe(100);
  }

  /** Clicks the `Animation progress` slider's track at `fraction` (0 to 1) of its length, as a player seeking does. */
  async seek(fraction: number, context: string): Promise<void> {
    const at = `${Math.round(fraction * 100)}%`;
    await expect(this.timeline, `${context}: the Animation progress slider should be enabled before clicking it at ${at}`).toBeEnabled();
    const track = this.page.locator('[data-slot="slider-control"]').filter({ has: this.timeline });
    await track.scrollIntoViewIfNeeded();
    const box = await track.boundingBox();
    if (!box) throw new Error(`${context}: the Animation progress slider has no bounding box, so it can't be clicked at ${at}`);
    await this.page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
  }

  // ------------------------------------------------------------------ speed

  /** The speeds on offer, as multipliers of the default speed. */
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

  /** The selected speed, as a multiplier of the default speed. */
  async speed(): Promise<number> {
    await expect(this.speedPicker, 'Speed combobox should be visible when reading the selected playback speed').toBeVisible();
    return parseFloat((await this.speedPicker.textContent()) ?? '');
  }

  // ---------------------------------------------------------------- helpers

  private async clickWhenReady(locator: Locator, label: string, action: string): Promise<void> {
    await expect(locator, `${label} should be visible before ${action}`).toBeVisible();
    await expect(locator, `${label} should be enabled before ${action}`).toBeEnabled();
    await locator.click();
  }
}
