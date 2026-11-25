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
      { intervals: [500], message: 'Animation progress should stop changing (two equal readings 500 ms apart)' }
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
    await expect
      .poll(() => visualiser.progress(), { timeout: 30_000, message: '/visualiser/linked-lists [10, 20, 30], append(40): Animation progress should reach 100 without pressing Play' })
      .toBe(100);
    await expect
      .poll(() => visualiser.values(), { message: '/visualiser/linked-lists [10, 20, 30], append(40) played to the end: the drawing should show [10, 20, 30, 40]' })
      .toEqual([10, 20, 30, 40]);
  });

  test('pause stops the animation and play resumes it', async ({ visualiser }) => {
    await visualiser.run('append', 40);
    await visualiser.transport.pause();
    const paused = await visualiser.progress();
    expect(paused, '/visualiser/linked-lists [10, 20, 30], append(40) then Pause: Animation progress should stop before 100').toBeLessThan(100);
    await expect(
      expect.poll(() => visualiser.progress(), { timeout: 1_000 }).not.toBe(paused),
      `/visualiser/linked-lists [10, 20, 30], append(40) paused at ${paused}: Animation progress should not move for 1 s`
    ).rejects.toThrow();

    await visualiser.transport.play();
    await expect
      .poll(() => visualiser.progress(), { timeout: 30_000, message: `/visualiser/linked-lists [10, 20, 30], append(40) paused at ${paused} then Play: Animation progress should reach 100` })
      .toBe(100);
  });

  test('rewind shows the data as it was before the operation', async ({ visualiser }) => {
    await visualiser.runToEnd('append', 40);
    // Only the drawing is checked here; the timeline has its own test below.
    await visualiser.transport.clickBackToStart();
    await expect
      .poll(() => visualiser.values(), { message: '/visualiser/linked-lists [10, 20, 30], append(40) then Back to the start: the drawing should show [10, 20, 30] again' })
      .toEqual([10, 20, 30]);
  });

  test('rewind moves the timeline to the start', async ({ visualiser }) => {
    await visualiser.runToEnd('append', 40);
    await visualiser.transport.clickBackToStart();
    await expect
      .poll(() => visualiser.progress(), { message: '/visualiser/linked-lists [10, 20, 30], append(40) then Back to the start: Animation progress should be 0' })
      .toBe(0);
  });

  test('replay plays the operation again', async ({ visualiser }) => {
    await visualiser.runToEnd('append', 40);
    await visualiser.transport.replay();
    await expect
      .poll(() => visualiser.progress(), { message: '/visualiser/linked-lists [10, 20, 30], append(40) at the end then Replay: Animation progress should drop below 100' })
      .toBeLessThan(100);
    await expect
      .poll(() => visualiser.progress(), { timeout: 30_000, message: '/visualiser/linked-lists [10, 20, 30], append(40) replayed: Animation progress should reach 100 again' })
      .toBe(100);
  });

  test('step back and step forward move one step at a time', async ({ visualiser }) => {
    await visualiser.runToEnd('append', 40);
    await visualiser.transport.stepBack();
    await expect
      .poll(() => visualiser.progress(), { message: '/visualiser/linked-lists [10, 20, 30], append(40) at the end then Previous step: Animation progress should drop below 100' })
      .toBeLessThan(100);
    const oneBack = await visualiser.progress();
    await visualiser.transport.stepBack();
    await expect
      .poll(() => visualiser.progress(), { message: `/visualiser/linked-lists [10, 20, 30], append(40), Previous step again from ${oneBack}: Animation progress should drop further` })
      .toBeLessThan(oneBack);
    const twoBack = await visualiser.progress();

    await visualiser.transport.stepForward();
    await expect
      .poll(() => visualiser.progress(), { message: `/visualiser/linked-lists [10, 20, 30], append(40), Next step from ${twoBack}: Animation progress should rise` })
      .toBeGreaterThan(twoBack);
    const stopped = await settledProgress(visualiser);
    expect(
      Math.abs(stopped - oneBack),
      `/visualiser/linked-lists [10, 20, 30], append(40): two steps back then one forward should stop within 3 of one step back (${oneBack}), stopped at ${stopped}`
    ).toBeLessThanOrEqual(3);
  });

  test('clicking the timeline jumps to that point', async ({ visualiser }) => {
    await visualiser.open('sorting-algorithms', [50, 40, 30, 20, 10]);
    await visualiser.runToEnd('bubble');
    await visualiser.transport.seek(0.5, '/visualiser/sorting-algorithms bubble on [50, 40, 30, 20, 10], clicking the timeline at 50%');
    await expect
      .poll(async () => Math.abs((await visualiser.progress()) - 50), {
        message: '/visualiser/sorting-algorithms bubble on [50, 40, 30, 20, 10], timeline clicked at 50%: Animation progress should be within 25 of 50',
      })
      .toBeLessThan(25);
    const midway = await visualiser.values();
    const seekContext = `/visualiser/sorting-algorithms bubble on [50, 40, 30, 20, 10], timeline clicked at 50%: the drawing (${JSON.stringify(midway)})`;
    expect(midway, `${seekContext} should not be fully sorted yet`).not.toEqual([10, 20, 30, 40, 50]);
    expect(midway, `${seekContext} should not be back at the start`).not.toEqual([50, 40, 30, 20, 10]);
  });

  test('offers speeds from 0.25x to 5x', async ({ visualiser }) => {
    expect(await visualiser.transport.speed(), '/visualiser/linked-lists on open: the Speed picker should show 1×').toBe(1);
    expect(
      await visualiser.transport.speeds(),
      '/visualiser/linked-lists: the Speed picker should offer 0.25× to 5× in this order'
    ).toEqual([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4, 5]);
  });

  test('a speed can be chosen', async ({ visualiser }) => {
    const msToAdvance = async (percent: number): Promise<number> => {
      // The timeline can show the last run's end until the new run's first frame.
      await expect
        .poll(() => visualiser.progress(), { message: 'after Run, Animation progress should drop below 100 as the new run starts' })
        .toBeLessThan(100);
      const from = await visualiser.progress();
      const start = Date.now();
      await expect
        .poll(() => visualiser.progress(), {
          intervals: [100],
          timeout: 60_000,
          message: `Animation progress should advance ${percent} points from ${from} within 60 s`,
        })
        .toBeGreaterThanOrEqual(from + percent);
      return Date.now() - start;
    };

    await visualiser.transport.setSpeed(2);
    expect(await visualiser.transport.speed(), 'after choosing 2×, the Speed picker should show 2×').toBe(2);
    await visualiser.run('append', 40);
    const fast = await msToAdvance(20);
    await visualiser.transport.skipToEnd();

    await visualiser.transport.setSpeed(0.25);
    expect(await visualiser.transport.speed(), 'after choosing 0.25×, the Speed picker should show 0.25×').toBe(0.25);
    await visualiser.run('append', 50);
    const slow = await msToAdvance(20);

    expect(
      slow,
      `/visualiser/linked-lists [10, 20, 30]: advancing 20 points took ${fast} ms at 2× (append 40) and ${slow} ms at 0.25× (append 50); 0.25× should take more than 3 times as long`
    ).toBeGreaterThan(fast * 3);
  });
});
