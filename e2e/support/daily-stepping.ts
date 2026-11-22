import { expect } from '@playwright/test';
import type { DailyLocators } from './daily-locators';

/**
 * Stepping through /daily's playback one frame at a time with Next step and
 * Previous step, waiting for the timeline and counter to settle after each click.
 * `DailyPage` exposes `stepToEnd` and `stepBackUntilCounterDrops` as methods.
 */

export interface StepReading {
  step: number;
  before: number;
  after: number;
  /** Rounded Animation progress (0-100). */
  progress: number;
}

/**
 * Presses Next step repeatedly until the timeline reaches 100 or `maxSteps` is hit,
 * waiting for the timeline and counter to settle after each step and invoking `onStep`.
 */
export async function stepToEnd(
  ui: DailyLocators,
  maxSteps: number,
  onStep: (reading: StepReading) => void | Promise<void>,
  context?: string,
): Promise<{ steps: number; counter: number; atEnd: boolean }> {
  let previousCounter = await ui.counter(context);
  let atEnd = (await ui.roundedProgress(context)) === 100;
  let steps = 0;
  while (!atEnd && steps < maxSteps) {
    steps += 1;
    const stepCtx = context ? `${context} step ${steps}` : undefined;
    const settled = await stepAndSettle(ui, 'Next step', 100, stepCtx);
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
export async function stepBackUntilCounterDrops(
  ui: DailyLocators,
  from: number,
  context?: string,
  maxSteps = 20,
): Promise<{ counter: number; progress: number; steps: number }> {
  let counter = await ui.counter(context);
  let rawProgress = await ui.progress(context);
  for (let steps = 1; steps <= maxSteps; steps += 1) {
    const stepCtx = context ? `${context} step back ${steps}` : undefined;
    const settled = await stepAndSettle(ui, 'Previous step', 0, stepCtx);
    counter = settled.counter;
    rawProgress = settled.progress;
    if (counter < from || rawProgress === 0) return { counter, progress: Math.round(rawProgress), steps };
  }
  return { counter, progress: Math.round(rawProgress), steps: maxSteps };
}

async function stepAndSettle(
  ui: DailyLocators,
  action: 'Next step' | 'Previous step',
  boundary: 0 | 100,
  context?: string,
): Promise<{ counter: number; progress: number }> {
  const prefix = context ? `${context}: ` : '';
  const before = await ui.progress(context);
  await ui.clickWhenReady(
    ui.playbackButton(action),
    `${prefix}${action} button in Playback toolbar`,
    action === 'Next step' ? 'stepping forward' : 'stepping back',
  );
  const atBoundary = boundary === 100 ? Math.round(before) === 100 : before === 0;
  if (!atBoundary) {
    await expect
      .poll(() => ui.progress(context), {
        intervals: [50],
        message: `${prefix}${action} should move Animation progress from ${before}`,
      })
      .not.toBe(before);
  }
  return waitForStepToSettle(ui, action, context);
}

async function waitForStepToSettle(
  ui: DailyLocators,
  action: string,
  context?: string,
): Promise<{ counter: number; progress: number }> {
  const prefix = context ? `${context}: ` : '';
  const pauseButton = ui.playbackButton('Pause');
  let prevProgress = await ui.progress(context);
  let prevCounter = await ui.counter(context);
  await expect
    .poll(
      async () => {
        await ui.waitTwoFrames();
        const playing = await ui.isReady(pauseButton);
        const progress = await ui.progress(context);
        const counter = await ui.counter(context);
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
