import { test, expect } from '../support/test';
import type { VisualiserPage } from '../support/visualiser-page';

/** Waits until playback stops moving, and returns where it stopped. */
const settledProgress = async (visualiser: VisualiserPage): Promise<number> => {
  let previous = -1;
  await expect
    .poll(
      async () => {
        const now = await visualiser.progress();
        const still = now === previous;
        previous = now;
        return still;
      },
      { intervals: [500] }
    )
    .toBe(true);
  return previous;
};

test.describe('playback', () => {
  test.beforeEach(async ({ visualiser }) => {
    await visualiser.open('linked-lists', [10, 20, 30]);
  });

  test('an operation plays to the end by itself', async ({ visualiser }) => {
    await visualiser.run('append', 40);
    await expect.poll(() => visualiser.progress(), { timeout: 30_000 }).toBe(100);
    await expect.poll(() => visualiser.values()).toEqual([10, 20, 30, 40]);
  });

  test('pause stops the animation and play resumes it', async ({ visualiser, page }) => {
    await visualiser.run('append', 40);
    await visualiser.pause();
    const paused = await visualiser.progress();
    await page.waitForTimeout(1_000);
    expect(await visualiser.progress()).toBe(paused);
    expect(paused).toBeLessThan(100);

    await visualiser.play();
    await expect.poll(() => visualiser.progress(), { timeout: 30_000 }).toBe(100);
  });

  test('rewind shows the data as it was before the operation', async ({ visualiser }) => {
    await visualiser.runToEnd('append', 40);
    await visualiser.rewind();
    await expect.poll(() => visualiser.values()).toEqual([10, 20, 30]);
  });

  test('rewind moves the timeline to the start', async ({ visualiser }) => {
    await visualiser.runToEnd('append', 40);
    await visualiser.rewind();
    await expect.poll(() => visualiser.progress()).toBe(0);
  });

  test('replay plays the operation again', async ({ visualiser }) => {
    await visualiser.runToEnd('append', 40);
    await visualiser.replay();
    await expect.poll(() => visualiser.progress()).toBeLessThan(100);
    await expect.poll(() => visualiser.progress(), { timeout: 30_000 }).toBe(100);
  });

  test('step back and step forward move one step at a time', async ({ visualiser }) => {
    await visualiser.runToEnd('append', 40);
    await visualiser.stepBack();
    await expect.poll(() => visualiser.progress()).toBeLessThan(100);
    const oneBack = await visualiser.progress();
    await visualiser.stepBack();
    await expect.poll(() => visualiser.progress()).toBeLessThan(oneBack);
    const twoBack = await visualiser.progress();

    await visualiser.stepForward();
    await expect.poll(() => visualiser.progress()).toBeGreaterThan(twoBack);
    const stopped = await settledProgress(visualiser);
    expect(Math.abs(stopped - oneBack)).toBeLessThanOrEqual(3);
  });

  test('clicking the timeline jumps to that point', async ({ visualiser }) => {
    await visualiser.open('sorting-algorithms', [50, 40, 30, 20, 10]);
    await visualiser.runToEnd('bubble');
    await visualiser.seekTo(0.5);
    await expect.poll(async () => Math.abs((await visualiser.progress()) - 50)).toBeLessThan(25);
    const midway = await visualiser.values();
    expect(midway).not.toEqual([10, 20, 30, 40, 50]);
    expect(midway).not.toEqual([50, 40, 30, 20, 10]);
  });

  test('offers speeds from 0.25x to 2x', async ({ visualiser }) => {
    expect(await visualiser.speed()).toBe(1);
    expect(await visualiser.speeds()).toEqual([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]);
  });

  test('a speed can be chosen', async ({ visualiser }) => {
    await visualiser.setSpeed(2);
    expect(await visualiser.speed()).toBe(2);
    await visualiser.setSpeed(0.25);
    expect(await visualiser.speed()).toBe(0.25);
  });
});
