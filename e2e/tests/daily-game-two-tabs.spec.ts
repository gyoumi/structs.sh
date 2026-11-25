import { test, expect } from '../support/test';
import { DAILY_12 } from '../support/daily-fixtures';
import type { DatedChallenge } from '../support/daily-history';
import { DRIFT_26 } from '../support/daily-list-fixtures';
import { BUBBLE_21 } from '../support/daily-sorting-fixtures';
import {
  DailyTab,
  expectCaughtUp,
  expectPausedTogether,
  expectPlayingTogether,
  expectPlaysRun,
  expectRecorded,
  expectSameView,
  expectViewUnchanged,
  openTab,
  stepCount,
  withTabLifecycle,
  withoutBroadcastChannel,
} from '../support/daily-tabs';

/**
 * Step 3f, part A: two tabs of one browser open on /daily for the same day play the same run. They talk
 * through BroadcastChannel; the server is not involved. Pressing Run in tab A plays that run in tab B (same
 * input, counters climbing, step readout and Speed, B's Run disabled); a playback change in either tab
 * applies to both, the last change winning; when the run ends (or Skip is pressed in either tab) both show
 * the same result and the try is recorded once. A tab opened mid-run joins it at the current step; one
 * opened with no run playing shows the last saved try. A tab on another day ignores the run.
 *
 * Found by the recorded run: today a synced tab updates its score and tries but keeps its own last run on
 * the stage and shows "Updated from another tab." instead of playing the run.
 *
 * Both tabs are pages of one Playwright browser context, so they share localStorage and BroadcastChannel as
 * real tabs do. The viewport is 1440 wide because the "Step N of M" readout only shows on screens wider than
 * 1360. Runs are slowed with the Speed picker where the test acts mid-run.
 */

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;
const DATE = '2026-12-21';
const QUICKSORT_DAY: DatedChallenge = { ...DAILY_12.challenge, date: DATE };
const BUBBLE_DAY: DatedChallenge = { ...BUBBLE_21.challenge, date: DATE };
const DRIFT_DAY: DatedChallenge = { ...DRIFT_26.challenge, date: DATE };
const COMPARISONS = ['Comparisons'];

/** Tab A is the test's own page; tab B is a second page in the same browser context. */
const openBoth = async (page: DailyTab['page'], challenge: DatedChallenge, label: string) => {
  const a = new DailyTab(page, 'tab A');
  await a.serve(challenge);
  await a.open(label);
  const b = await openTab(page.context(), challenge, 'tab B', label);
  return { a, b };
};

test.describe('daily game in two tabs', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('Run in one tab plays the same run in the other: its input, counters, step readout and Speed, with Run disabled (quicksort)', async ({ page }) => {
    const { goal } = DAILY_12;
    const ctx = `${DAILY_12.name} dated ${DATE}, both tabs open, tab A swaps slots ${goal.swap.join(' and ')} to ${fmt(goal.values)} (${goal.count} comparisons), sets Speed 0.25× and presses Run`;
    const { a, b } = await openBoth(page, QUICKSORT_DAY, ctx);
    await a.daily.swap(goal.swap[0], goal.swap[1]);
    await a.daily.transport.setSpeed(0.25);
    const bBefore = await b.view(COMPARISONS, `${ctx}, before Run`);
    expect(bBefore.editor, `${ctx}: test setup: before Run, tab B's Challenge array should still show the served ${fmt(DAILY_12.start.values)}`).toBe(`Challenge array ${fmt(DAILY_12.start.values)}`);

    await a.daily.run();
    const steps = await stepCount(a, `${ctx}, tab A after Run`);
    await expectPlaysRun(
      b,
      a,
      { input: `Challenge array ${fmt(goal.values)}`, steps, speed: 0.25, counters: [{ name: 'Comparisons', final: goal.count }] },
      `${ctx}, while tab A's run plays`,
    );
    await b.midRun.expectUnchangedWhilePlaying(bBefore, 0, goal.count, COMPARISONS, 2, `${ctx}, tab B while the run plays`);

    await a.skip(`${ctx}, tab A presses Skip`);
    const ended = `${ctx}, after Skip in tab A`;
    await expectSameView(b, a, COMPARISONS, ended);
    await b.expectNoSyncedNotice(ended);
    await b.daily.expectStatusNumber('Tries left', 2, `${ended}: tab B should show the try used, as tab A does`);
    await b.template.expectTryChips([`${goal.count} ⭐`], `${ended}: tab B`);
    await expectRecorded(b, DATE, 1, ended);
  });

  test('playback changes in either tab apply to both: pause, steps, back to the start, seeking, Speed, play, skip to the end and Replay; the last change wins (quicksort)', async ({ page }) => {
    const { goal } = DAILY_12;
    const ctx = `${DAILY_12.name} dated ${DATE}, both tabs open, tab A runs ${fmt(goal.values)} at 0.25×`;
    const { a, b } = await openBoth(page, QUICKSORT_DAY, ctx);
    await a.daily.swap(goal.swap[0], goal.swap[1]);
    await a.daily.transport.setSpeed(0.25);
    await a.daily.run();
    await a.midRun.waitUntilPartWay(`${ctx}, tab A playing`, 'Comparisons');

    await a.daily.transport.pause();
    const paused = await expectPausedTogether([a, b], `${ctx}, then Pause in tab A`);

    await b.daily.transport.stepForward();
    const stepped = await expectPausedTogether([a, b], `${ctx}, paused at "${paused.step}", then Next step in tab B`);
    expect(stepped.step, `${ctx}: Next step in tab B should move both tabs on from "${paused.step}"`).not.toBe(paused.step);

    await a.daily.transport.stepBack();
    const back = await expectPausedTogether([a, b], `${ctx}, at "${stepped.step}", then Previous step in tab A`);
    expect(back.step, `${ctx}: Previous step in tab A after Next step in tab B should bring both tabs back to "${paused.step}"`).toBe(paused.step);

    await b.daily.transport.clickBackToStart();
    const start = await expectPausedTogether([a, b], `${ctx}, then Back to the start in tab B`);
    expect(start.progress, `${ctx}: Back to the start in tab B should rewind both tabs to Animation progress 0`).toBe(0);
    await a.daily.expectStatusNumber('Comparisons', 0, `${ctx}, after Back to the start in tab B: tab A's Comparisons should be back to 0`);

    await a.seek(0.5, `${ctx}, at the start`);
    const sought = await expectPausedTogether([a, b], `${ctx}, then seeking to the middle of the Animation progress slider in tab A`);
    expect(sought.progress, `${ctx}: seeking to the middle in tab A should move both tabs to the middle (Animation progress between 30 and 70)`).toBeGreaterThan(30);
    expect(sought.progress, `${ctx}: seeking to the middle in tab A should move both tabs to the middle (Animation progress between 30 and 70)`).toBeLessThan(70);

    await b.daily.transport.setSpeed(2);
    const faster = await expectPausedTogether([a, b], `${ctx}, then Speed 2× in tab B`);
    expect(faster.speed, `${ctx}: choosing Speed 2× in tab B should set 2× in both tabs`).toBe(2);
    await a.daily.transport.setSpeed(0.5);
    await b.daily.transport.setSpeed(0.25);
    const lastSpeed = await expectPausedTogether([a, b], `${ctx}, then Speed 0.5× in tab A and right after 0.25× in tab B`);
    expect(lastSpeed.speed, `${ctx}: the last Speed change (0.25× in tab B, after 0.5× in tab A) should win in both tabs`).toBe(0.25);

    await a.daily.transport.play();
    await expectPlayingTogether([a, b], `${ctx}, then Play in tab A`);
    await b.daily.transport.pause();
    await a.daily.transport.play();
    await expectPlayingTogether([a, b], `${ctx}, then Pause in tab B and Play in tab A after it (the last change, Play, wins)`);
    await b.daily.transport.pause();
    await expectPausedTogether([a, b], `${ctx}, then Pause in tab B`);

    await b.daily.transport.skipToEnd(`${ctx}, Skip to the end in tab B`);
    const end = await expectPausedTogether([a, b], `${ctx}, then Skip to the end in tab B`);
    expect(end.step, `${ctx}: Skip to the end in tab B should bring both tabs to the run's last step`).toMatch(/^Step (\d+) of \1$/);
    const ended = `${ctx}, after Skip to the end in tab B ended the run`;
    await expectSameView(b, a, COMPARISONS, ended);
    await a.daily.expectStatusNumber('Tries left', 2, `${ended}: tab A should show the try used`);
    await expectRecorded(a, DATE, 1, ended);

    await b.daily.transport.replay();
    await expectPlayingTogether([a, b], `${ended}, then Replay in tab B`);
    await a.daily.transport.pause();
    await expectPausedTogether([a, b], `${ended}, then Replay in tab B and Pause in tab A`);
    await a.daily.expectStatusNumber('Tries left', 2, `${ended}, after Replay: replaying the finished run must not use a try in tab A`);
    await b.daily.expectStatusNumber('Tries left', 2, `${ended}, after Replay: replaying the finished run must not use a try in tab B`);
    await expectRecorded(a, DATE, 1, `${ended}, after Replay`);
  });

  test('both tabs show each try when its run ends or Skip is pressed in either tab, recorded once, and Share on the last try (quicksort)', async ({ page }) => {
    const { start, goal, highFromGoal } = DAILY_12;
    const ctx = `${DAILY_12.name} dated ${DATE}, both tabs open`;
    const { a, b } = await openBoth(page, QUICKSORT_DAY, ctx);

    const try1 = `${ctx}, try 1 ${fmt(start.values)} (${start.count}) run in tab A at 5× and left to end by itself`;
    await a.daily.transport.setSpeed(5);
    await a.daily.run();
    await a.daily.waitForRunToFinish();
    await expectSameView(b, a, COMPARISONS, try1);
    await b.expectNoSyncedNotice(try1);
    await b.template.expectTryChips([`${start.count}`], `${try1}: tab B`);
    await expectRecorded(b, DATE, 1, try1);

    const try2 = `${ctx}, try 2 ${fmt(goal.values)} (${goal.count} ⭐) run in tab A at 0.25×, then Skip in tab B`;
    await a.daily.swap(goal.swap[0], goal.swap[1]);
    await a.daily.transport.setSpeed(0.25);
    await a.daily.run();
    await b.midRun.waitUntilPartWay(`${try2}, tab B playing`, 'Comparisons');
    await b.skip(try2);
    await expectPausedTogether([a, b], `${try2}: both tabs at the end`);
    await expectSameView(b, a, COMPARISONS, try2);
    await b.expectNoSyncedNotice(try2);
    await a.template.expectTryChips([`${start.count}`, `${goal.count} ⭐`], `${try2}: tab A`);
    await expectRecorded(a, DATE, 2, try2);

    const try3 = `${ctx}, try 3 ${fmt(highFromGoal.values)} (${highFromGoal.count} ⭐) run in tab B at 0.25×, then Skip in tab A`;
    expect(await b.daily.values(), `${try3}: test setup: tab B's Challenge array should show try 2's ${fmt(goal.values)}, which tab A ran`).toEqual([...goal.values]);
    await b.daily.swap(highFromGoal.swap[0], highFromGoal.swap[1]);
    await b.daily.transport.setSpeed(0.25);
    await b.daily.run();
    await a.midRun.waitUntilPartWay(`${try3}, tab A playing`, 'Comparisons');
    await a.skip(try3);
    const chips = [`${start.count}`, `${goal.count} ⭐`, `${highFromGoal.count} ⭐`];
    await expectSameView(a, b, COMPARISONS, try3);
    await a.expectNoSyncedNotice(try3);
    for (const tab of [a, b]) {
      await tab.template.expectTryChips(chips, `${try3}: ${tab.name}`);
      await tab.daily.expectStatusNumber('Tries left', 0, `${try3}: ${tab.name} should end the day`);
      await tab.daily.expectStatusNumber('Score', highFromGoal.count, `${try3}: ${tab.name}'s Score should be the highest try, ${highFromGoal.count}`);
      expect(await tab.daily.canShare(), `${try3}: the day is over, so Share should be enabled in ${tab.name}`).toBe(true);
      expect(await tab.daily.canRun(), `${try3}: the day is over, so Run should be disabled in ${tab.name}`).toBe(false);
      const view = await tab.view(COMPARISONS, try3);
      expect(view.message, `${try3}: ${tab.name} should give the ended message`).toBe(`You reached the goal! Your highest score was ${highFromGoal.count}.`);
    }
    await expectRecorded(a, DATE, 3, try3);
  });

  test('Skip in the other tab finishes an Index drift run in both, with the same operation list and counters', async ({ page }) => {
    const { costly } = DRIFT_26;
    const counters = ['Operations', 'Nodes walked', 'Cost'];
    const ctx = `${DRIFT_26.name} dated ${DATE}, both tabs open, tab A builds ${costly.listed.join(', ')} (cost ${costly.cost}) and runs it at 0.25×`;
    const { a, b } = await openBoth(page, DRIFT_DAY, ctx);
    await a.template.operations.build(costly.operations, costly.listed, ctx);
    await b.template.operations.expectListed([], `${ctx}: test setup: tab B's Operation list should still be empty before Run`);
    await a.daily.transport.setSpeed(0.25);
    await a.daily.run();
    const steps = await stepCount(a, `${ctx}, tab A after Run`);
    const input = (await a.view([], ctx)).editor;
    expect(input, `${ctx}: test setup: tab A's Operation list should hold the built operations`).toBe(`Operation list [${costly.listed.map((op) => op.replace(/\s+/g, '')).join(', ')}]`);
    await expectPlaysRun(
      b,
      a,
      {
        input,
        steps,
        speed: 0.25,
        counters: [
          { name: 'Operations', final: costly.count },
          { name: 'Nodes walked', final: costly.walked },
          { name: 'Cost', final: costly.cost },
        ],
      },
      `${ctx}, while tab A's run plays`,
    );

    await b.skip(`${ctx}, Skip in tab B`);
    const ended = `${ctx}, after Skip in tab B`;
    await expectPausedTogether([a, b], `${ended}: both tabs at the end`);
    await expectSameView(b, a, counters, ended);
    await b.expectNoSyncedNotice(ended);
    for (const tab of [a, b]) {
      await tab.daily.expectStatusNumber('Cost', costly.cost, `${ended}: ${tab.name}'s Cost should be ${costly.cost}`);
      await tab.template.expectTryChips([`${costly.cost}`], `${ended}: ${tab.name}`);
      await tab.daily.expectStatusNumber('Tries left', 2, `${ended}: ${tab.name}`);
    }
    await b.template.operations.expectListed(costly.listed, `${ended}: tab B's Operation list should keep tab A's operations`);
    await expectRecorded(b, DATE, 1, ended);
  });

  test('a tab opened while the run is paused joins it at the same step, paused, at the same Speed, then follows it (bubble sort)', async ({ page }) => {
    const { solved } = BUBBLE_21;
    const counters = ['Passes', 'Swaps'];
    const ctx = `${BUBBLE_21.name} dated ${DATE}, tab A swaps slots 0 and 7 to ${fmt(solved.values)} (${solved.passes} passes, ${solved.swaps} swaps), runs at 0.5×, pauses and presses Next step`;
    const a = new DailyTab(page, 'tab A');
    await a.serve(BUBBLE_DAY);
    await a.open(ctx);
    await a.daily.swap(0, 7);
    await a.daily.transport.setSpeed(0.5);
    await a.daily.run();
    await a.midRun.waitUntilPartWay(`${ctx}, playing`, 'Swaps');
    await a.daily.transport.pause();
    await a.midRun.step('Next step', `${ctx}, paused`);

    const joined = `${ctx}, then tab B opens /daily`;
    const b = await openTab(page.context(), BUBBLE_DAY, 'tab B', joined);
    const reading = await expectPausedTogether([a, b], joined);
    expect(reading.speed, `${joined}: tab B should join at tab A's Speed 0.5×`).toBe(0.5);
    expect(reading.step, `${joined}: tab B should join part-way through the run, not at its end`).not.toMatch(/^Step (\d+) of \1$/);
    await expectSameView(b, a, counters, joined);

    await b.daily.transport.play();
    await expectPlayingTogether([a, b], `${joined}, then Play in tab B`);
    await a.skip(`${joined}, Skip in tab A`);
    const ended = `${joined}, after Play in tab B and Skip in tab A`;
    await expectSameView(b, a, counters, ended);
    await b.daily.expectStatusNumber('Swaps', solved.swaps, `${ended}: tab B's Swaps should be ${solved.swaps}`);
    await b.template.expectTryChips([`${solved.swaps} ⭐`], `${ended}: tab B`);
    await expectRecorded(b, DATE, 1, ended);
  });

  test('a tab opened or reloaded while the run plays joins it playing, then follows it (quicksort)', async ({ page }) => {
    const { goal } = DAILY_12;
    const ctx = `${DAILY_12.name} dated ${DATE}, tab A runs ${fmt(goal.values)} at 0.25×`;
    const a = new DailyTab(page, 'tab A');
    await a.serve(QUICKSORT_DAY);
    await a.open(ctx);
    await a.daily.swap(goal.swap[0], goal.swap[1]);
    await a.daily.transport.setSpeed(0.25);
    await a.daily.run();
    await a.midRun.waitUntilPartWay(`${ctx}, playing`, 'Comparisons');

    const opened = `${ctx}, then tab B opens /daily while it plays`;
    const b = await openTab(page.context(), QUICKSORT_DAY, 'tab B', opened);
    await expectPlayingTogether([a, b], opened);
    expect(await b.daily.values(), `${opened}: tab B's Challenge array should show tab A's input ${fmt(goal.values)}`).toEqual([...goal.values]);
    await a.daily.transport.pause();
    await expectPausedTogether([a, b], `${opened}, then Pause in tab A`);
    await expectSameView(b, a, COMPARISONS, `${opened}, paused`);

    const reloaded = `${opened}, then Play in tab A and tab B reloads`;
    await a.daily.transport.play();
    await expectPlayingTogether([a, b], `${opened}, then Play in tab A`);
    await b.reload(reloaded);
    await expectPlayingTogether([a, b], reloaded);
    await b.daily.transport.pause();
    await expectPausedTogether([a, b], `${reloaded}, then Pause in tab B`);
    await expectSameView(b, a, COMPARISONS, `${reloaded}, paused`);

    await b.skip(`${reloaded}, Skip in tab B`);
    await expectSameView(a, b, COMPARISONS, `${reloaded}, after Skip in tab B`);
    await a.daily.expectStatusNumber('Tries left', 2, `${reloaded}, after Skip in tab B: tab A should show the try used`);
    await expectRecorded(a, DATE, 1, `${reloaded}, after Skip in tab B`);
  });

  test('a tab opened with no run playing shows the last saved try at its end, as a reload does (quicksort)', async ({ page }) => {
    const { goal } = DAILY_12;
    const ctx = `${DAILY_12.name} dated ${DATE}, tab A runs ${fmt(goal.values)} and presses Skip`;
    const a = new DailyTab(page, 'tab A');
    await a.serve(QUICKSORT_DAY);
    await a.open(ctx);
    await a.daily.swap(goal.swap[0], goal.swap[1]);
    await a.daily.run();
    await a.skip(ctx);
    await expectRecorded(a, DATE, 1, ctx);

    const opened = `${ctx}, then tab B opens /daily with no run playing`;
    const b = await openTab(page.context(), QUICKSORT_DAY, 'tab B', opened);
    const reading = await expectPausedTogether([a, b], opened);
    expect(reading.step, `${opened}: tab B should show the saved try's run at its last step`).toMatch(/^Step (\d+) of \1$/);
    expect(reading.button, `${opened}: tab B's play button should offer Replay for the saved try's finished run`).toBe('Replay');
    await expectSameView(b, a, COMPARISONS, opened);
    await b.daily.expectStatusNumber('Comparisons', goal.count, `${opened}: tab B's Comparisons should show the saved try's ${goal.count}`);
    await expectRecorded(b, DATE, 1, opened);
  });

  test('a tab on another day ignores the run', async ({ page }) => {
    const { goal } = DAILY_12;
    const otherDay: DatedChallenge = { ...DAILY_12.challenge, number: 13, date: '2026-12-22' };
    const ctx = `tab A on ${DATE} (#12) runs ${fmt(goal.values)} at 0.25×, tab B on ${otherDay.date} (#13, same values)`;
    const a = new DailyTab(page, 'tab A');
    await a.serve(QUICKSORT_DAY);
    await a.open(ctx);
    const b = await openTab(page.context(), otherDay, 'tab B', ctx);
    const before = await b.view(COMPARISONS, `${ctx}, before Run`);

    await a.daily.swap(goal.swap[0], goal.swap[1]);
    await a.daily.transport.setSpeed(0.25);
    await a.daily.run();
    await a.midRun.waitUntilPartWay(`${ctx}, tab A playing`, 'Comparisons');
    for (let sample = 1; sample <= 3; sample += 1) {
      expectViewUnchanged(await b.view(COMPARISONS, ctx), before, b, `${ctx}, sample ${sample} while tab A's run plays`);
    }
    await a.daily.transport.pause();
    await a.midRun.step('Next step', `${ctx}, tab A paused`);
    expectViewUnchanged(await b.view(COMPARISONS, ctx), before, b, `${ctx}, after Pause and Next step in tab A`);
    await a.skip(ctx);
    await expectRecorded(a, DATE, 1, ctx);
    await a.daily.expectStatusNumber('Tries left', 2, `${ctx}, after Skip in tab A: test setup`);
    expectViewUnchanged(await b.view(COMPARISONS, ctx), before, b, `${ctx}, after tab A's run ended`);
    expect(await b.runEnabled(), `${ctx}: tab B's Run should stay enabled for its own day`).toBe(true);
  });

  test('without BroadcastChannel, the other tab updates its tries as today but does not play the run', async ({ page }) => {
    const { goal } = DAILY_12;
    const ctx = `${DAILY_12.name} dated ${DATE}, BroadcastChannel unavailable, tab A runs ${fmt(goal.values)} and presses Skip`;
    await withoutBroadcastChannel(page.context());
    const { a, b } = await openBoth(page, QUICKSORT_DAY, ctx);
    await a.expectNoBroadcastChannel(ctx);
    await b.expectNoBroadcastChannel(ctx);
    await a.daily.swap(goal.swap[0], goal.swap[1]);
    await a.daily.run();
    await a.skip(ctx);

    await b.daily.expectStatusNumber('Tries left', 2, `${ctx}: tab B should pick up the saved try from localStorage, as today`);
    await b.template.expectTryChips([`${goal.count} ⭐`], `${ctx}: tab B`);
    await b.expectSyncedNotice(ctx);
    expect(await b.daily.values(), `${ctx}: tab B keeps its own input while tries remain, as today`).toEqual([...DAILY_12.start.values]);
    await expectRecorded(b, DATE, 1, ctx);
  });

  /**
   * A hidden or frozen tab's animation stops (in a real browser `requestAnimationFrame` stops in a background
   * tab, and a frozen tab runs nothing), so a tab the player switches back to can be far behind the tab that
   * pressed Run. When it comes back it should move to the step the other tab is on now, in the same playing or
   * paused state and Speed, within about half a second. Headless Chromium doesn't hide or freeze pages, so
   * `withTabLifecycle` (daily-tabs.ts) plays the browser's part; each test names the signal it sends:
   * `visibilitychange` (hidden, then visible) or `resume` (after `freeze`, with the tab left visible).
   */
  test('a tab the player switches back to (visibilitychange) moves to the other tab\'s step, still playing, at its new Speed (quicksort)', async ({ page }) => {
    const { goal } = DAILY_12;
    const ctx = `${DAILY_12.name} dated ${DATE}, tab B hidden (visibilitychange to "hidden", no animation frames), tab A runs ${fmt(goal.values)} at 2× to Step 12, then sets Speed 0.25×`;
    await withTabLifecycle(page.context());
    const { a, b } = await openBoth(page, QUICKSORT_DAY, ctx);
    await b.hide();
    await a.daily.swap(goal.swap[0], goal.swap[1]);
    await a.daily.transport.setSpeed(2);
    await a.daily.run();
    await a.waitForStep(12, `${ctx}, tab A playing`);
    await a.daily.transport.setSpeed(0.25);
    await a.waitForStep(13, `${ctx}, tab A playing at 0.25×`);
    expect((await a.playback(ctx)).button, `${ctx}: test setup: tab A should still be playing when tab B comes back`).toBe('Pause');

    const back = `${ctx}, then the player switches back to tab B (visibilitychange to "visible")`;
    await b.show();
    await expectCaughtUp(b, a, true, back);
  });

  test('a tab the player switches back to (visibilitychange) while the other tab is paused ends paused at that step (quicksort)', async ({ page }) => {
    const { goal } = DAILY_12;
    const ctx = `${DAILY_12.name} dated ${DATE}, tab B hidden (visibilitychange to "hidden", no animation frames), tab A runs ${fmt(goal.values)} at 1× to Step 6 and pauses`;
    await withTabLifecycle(page.context());
    const { a, b } = await openBoth(page, QUICKSORT_DAY, ctx);
    await b.hide();
    await a.daily.swap(goal.swap[0], goal.swap[1]);
    await a.daily.run();
    await a.waitForStep(6, `${ctx}, tab A playing`);
    await a.daily.transport.pause();
    await expect.poll(async () => (await a.playback(ctx)).button, { message: `${ctx}: test setup: tab A should be paused (Play offered)` }).toBe('Play');

    const back = `${ctx}, then the player switches back to tab B (visibilitychange to "visible")`;
    await b.show();
    await expectCaughtUp(b, a, false, back);
  });

  test('a frozen tab that resumes (resume event) moves to the other tab\'s step, still playing (quicksort)', async ({ page }) => {
    const { goal } = DAILY_12;
    const ctx = `${DAILY_12.name} dated ${DATE}, tab B frozen (freeze event; its BroadcastChannel messages, timers and frames wait; it stays visible), tab A runs ${fmt(goal.values)} at 1× to Step 6`;
    await withTabLifecycle(page.context());
    const { a, b } = await openBoth(page, QUICKSORT_DAY, ctx);
    await b.freeze();
    await a.daily.swap(goal.swap[0], goal.swap[1]);
    await a.daily.run();
    await a.waitForStep(6, `${ctx}, tab A playing`);
    expect((await a.playback(ctx)).button, `${ctx}: test setup: tab A should still be playing when tab B resumes`).toBe('Pause');

    const back = `${ctx}, then tab B resumes (resume event, then the waiting messages, timers and frames run)`;
    await b.resume();
    await expectCaughtUp(b, a, true, back);
  });

  /**
   * Tab B shares tab A's run at 2× and is frozen; tab A plays on 8 steps at 2×, then the player sets Speed 0.5×
   * and it plays one more step. When B resumes, its queued Speed message runs after `resume`. B must still move
   * to A's step: a B that drops A's position reply and keeps its own clock counts the whole frozen time at 0.5×,
   * so it ends several steps behind A, at the same Speed. (Changing Speed early in the frozen time hides this,
   * because B's clock then happens to land near A's step.)
   */
  test('a tab frozen while sharing a run, during which the other tab changes Speed, resumes on the other tab\'s step at the new Speed (quicksort)', async ({ page }) => {
    const { goal } = DAILY_12;
    const ctx = `${DAILY_12.name} dated ${DATE}, tab A runs ${fmt(goal.values)} at 2× and tab B plays it too, then tab B is frozen (freeze event; its BroadcastChannel messages, timers and frames wait; it stays visible), tab A plays on 8 steps at 2×, sets Speed 0.5× and plays one more step`;
    await withTabLifecycle(page.context());
    const { a, b } = await openBoth(page, QUICKSORT_DAY, ctx);
    await a.daily.swap(goal.swap[0], goal.swap[1]);
    await a.daily.transport.setSpeed(2);
    await a.daily.run();
    await expectPlayingTogether([a, b], `${ctx}: test setup: both tabs should play the run before tab B is frozen`);
    await b.freeze();
    const frozenAt = Number((await a.playback(ctx)).step.match(/^Step (\d+)/)?.[1] ?? 0);
    await a.waitForStep(frozenAt + 8, `${ctx}, tab A playing on at 2×`);
    await a.daily.transport.setSpeed(0.5);
    await a.waitForStep(frozenAt + 9, `${ctx}, tab A playing on at 0.5×`);
    expect((await a.playback(ctx)).button, `${ctx}: test setup: tab A should still be playing when tab B resumes`).toBe('Pause');

    const back = `${ctx}, then tab B resumes (resume event, then its waiting messages, including the Speed change, timers and frames run)`;
    await b.resume();
    await expectCaughtUp(b, a, true, back);
  });
});
