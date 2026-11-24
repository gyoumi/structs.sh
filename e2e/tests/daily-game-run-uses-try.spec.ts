import { test, expect } from '../support/test';
import { DAILY_12 } from '../support/daily-fixtures';
import type { DatedChallenge } from '../support/daily-history';
import { DRIFT_26 } from '../support/daily-list-fixtures';
import { DailyMidRun, skipThenReloadView, type TryView } from '../support/daily-mid-run';
import type { DailyPage } from '../support/daily-page';
import type { DailyTemplatePage } from '../support/daily-template-page';
import { AVL_23, UPSET_25 } from '../support/daily-tree-fixtures';

/**
 * Pressing Run uses the try. Before this change a try was saved only when its run's animation ended, so a
 * player could press Run, watch the counter climb (or step through the run), reload before the end and get
 * the try back: a free preview. Now a reload at any point after Run (playing, paused, or after stepping)
 * keeps the try. After the reload the page looks exactly as if the player had pressed Skip and then
 * reloaded: Tries left one lower, the try in the Tries list with its score (or ✗ when unsolved), Score and
 * Goal reached from it, and the run restored at its end ("Step N of N", Replay enabled). Reloading mid-run
 * on the third try finishes the day (Share, the ended message, and the streak).
 *
 * Each test compares the mid-run reload with a reference page in a fresh browser context that played the
 * same input, pressed Skip, and reloaded. The running tab itself still updates only when the run ends or
 * Skip is pressed.
 *
 * The viewport is 1440 wide because the playback's "Step N of M" readout only shows on screens wider than 1360.
 * Runs are slowed to 0.25× so the reload lands part-way through.
 */

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;
const DATE = '2026-12-21';
const QUICKSORT_DAY: DatedChallenge = { ...DAILY_12.challenge, date: DATE };
const AVL_DAY: DatedChallenge = { ...AVL_23.challenge, date: DATE };
const UPSET_DAY: DatedChallenge = { ...UPSET_25.challenge, date: DATE };
const DRIFT_DAY: DatedChallenge = { ...DRIFT_26.challenge, date: DATE };
const MID = 'after reloading mid-run';
const SKIPPED = 'after pressing Skip and reloading (reference page)';

const runSkip = async (dailyPage: DailyPage, swap: readonly [number, number] | null, context: string) => {
  if (swap) await dailyPage.swap(swap[0], swap[1]);
  await dailyPage.run();
  await dailyPage.skip(context);
};

/** Opens /daily, swaps `swap` (if any), runs and skips: the reference play for a one-try arrangement day. */
const arrangementReference = (swap: readonly [number, number] | null, context: string) => async (daily: DailyPage) => {
  await daily.open();
  await runSkip(daily, swap, context);
};

const expectTryKept = async (dailyPage: DailyPage, dailyTemplate: DailyTemplatePage, triesLeft: number, chips: readonly string[], context: string) => {
  await dailyPage.expectStatusNumber(
    'Tries left',
    triesLeft,
    `${context}: Run was pressed before the reload, so that try is used and Tries left should be ${triesLeft}, as after Skip and reload`,
  );
  await dailyTemplate.expectTryChips(chips, `${context}: the try that was running when the page reloaded should be saved in the Tries list with its score`);
};

test.describe('daily game: pressing Run uses the try', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('reloading while the run plays keeps the try, as Skip then reload does (quicksort, swapped arrangement)', async ({ browser, page, dailyPage, dailyHistory, dailyTemplate }) => {
    const { goal } = DAILY_12;
    const counters = ['Comparisons'];
    const ctx = `${DAILY_12.name} dated ${DATE}, try 1 ${fmt(goal.values)} (swap slots ${goal.swap.join(' and ')}, ${goal.count} comparisons ⭐)`;
    const reference = await skipThenReloadView(browser, QUICKSORT_DAY, counters, 1, arrangementReference(goal.swap, ctx), ctx);

    const midRun = new DailyMidRun(page);
    await dailyHistory.serveOnly(QUICKSORT_DAY);
    await dailyPage.open();
    await dailyPage.swap(goal.swap[0], goal.swap[1]);
    await dailyPage.transport.setSpeed(0.25);
    await dailyPage.run();
    await midRun.waitUntilPartWay(`${ctx}, playing`, 'Comparisons');
    await midRun.reload(`${ctx}, reloaded while the run plays`);

    const reloaded = `${ctx}, ${MID} while it played`;
    await expectTryKept(dailyPage, dailyTemplate, 2, [`${goal.count} ⭐`], reloaded);
    await dailyPage.expectStatusNumber('Score', goal.count, `${reloaded}: Score should show the kept try's ${goal.count}`);
    await dailyTemplate.expectGoalReached(true, `${reloaded}: the kept try's ${goal.count} reaches the goal of ${DAILY_12.challenge.goal}`);
    await dailyPage.expectStatusNumber('Comparisons', goal.count, `${reloaded}: Comparisons should show the kept try's run at its end (${goal.count})`);
    await midRun.expectSameAs(reference, counters, MID, SKIPPED, reloaded);

    expect(await dailyPage.canRun(), `${reloaded}: Run should stay enabled with 2 tries left`).toBe(true);
    await dailyPage.transport.replay();
    await dailyPage.transport.skipToEnd(`${reloaded}, after Replay`);
    await dailyPage.expectStatusNumber('Tries left', 2, `${reloaded}: replaying the restored try must not use another try`);
  });

  test('reloading while the run is paused keeps the try (AVL tree, swapped insert order)', async ({ browser, page, dailyPage, dailyTemplate }) => {
    const { doubles } = AVL_23;
    const counters = ['Rotations'];
    const ctx = `${AVL_23.name} dated ${DATE}, try 1 ${fmt(doubles.values)} (swap slots ${doubles.swap.join(' and ')}, ${doubles.rotations} rotations ⭐)`;
    const reference = await skipThenReloadView(browser, AVL_DAY, counters, 1, arrangementReference(doubles.swap, ctx), ctx);

    const midRun = new DailyMidRun(page);
    await dailyPage.serve(AVL_DAY);
    await dailyPage.open();
    await dailyPage.swap(doubles.swap[0], doubles.swap[1]);
    await dailyPage.transport.setSpeed(0.25);
    await dailyPage.run();
    await midRun.waitUntilPartWay(`${ctx}, playing`);
    await dailyPage.transport.pause();
    await midRun.expectStillRunning(`${ctx}, paused`);
    await midRun.reload(`${ctx}, reloaded while paused`);

    const reloaded = `${ctx}, ${MID} while paused`;
    await expectTryKept(dailyPage, dailyTemplate, 2, [`${doubles.rotations} ⭐`], reloaded);
    await dailyPage.expectStatusNumber('Score', doubles.rotations, `${reloaded}: Score should show the kept try's ${doubles.rotations} rotations`);
    expect(await dailyPage.values(), `${reloaded}: Challenge array should show the kept try's insert order ${fmt(doubles.values)}`).toEqual([...doubles.values]);
    await midRun.expectSameAs(reference, counters, MID, SKIPPED, reloaded);
  });

  test('reloading after stepping through part of the run keeps an unsolved try as ✗ (two-stage BST vs AVL)', async ({ browser, page, dailyPage, dailyTemplate }) => {
    const { start } = UPSET_25;
    const counters = ['BST nodes passed', 'AVL nodes passed'];
    const ctx = `${UPSET_25.name} dated ${DATE}, try 1 ${fmt(start.values)} (BST ${start.bst} >= AVL ${start.avl}: unsolved)`;
    const reference = await skipThenReloadView(browser, UPSET_DAY, counters, 1, arrangementReference(null, ctx), ctx);

    const midRun = new DailyMidRun(page);
    await dailyPage.serve(UPSET_DAY);
    await dailyPage.open();
    await dailyPage.transport.setSpeed(0.25);
    await dailyPage.run();
    await midRun.waitUntilPartWay(`${ctx}, playing`, 'BST nodes passed');
    await dailyPage.transport.pause();
    await midRun.step('Next step', `${ctx}, paused`);
    await midRun.step('Next step', `${ctx}, paused`);
    await midRun.step('Previous step', `${ctx}, paused`);
    await midRun.expectStillRunning(`${ctx}, after stepping`);
    await midRun.reload(`${ctx}, reloaded after stepping`);

    const reloaded = `${ctx}, ${MID} after Next step, Next step, Previous step`;
    await expectTryKept(dailyPage, dailyTemplate, 2, ['✗'], reloaded);
    await dailyTemplate.expectNoScore(reloaded);
    await dailyTemplate.expectGoalReached(false, `${reloaded}: the kept try is unsolved`);
    await dailyTemplate.expectTryResult([start.bst, start.avl], [/BST/, /AVL/], reloaded);
    await midRun.expectSameAs(reference, counters, MID, SKIPPED, reloaded);
    expect(await dailyPage.canRun(), `${reloaded}: Run should stay enabled with 2 tries left`).toBe(true);
  });

  test('reloading mid-run keeps an Index drift try with its operation list', async ({ browser, page, dailyPage, dailyTemplate }) => {
    const { costly } = DRIFT_26;
    const counters = ['Operations', 'Nodes walked', 'Cost'];
    const ctx = `${DRIFT_26.name} dated ${DATE}, try 1 ${costly.listed.join(', ')} (solved, cost ${costly.cost} > goal ${DRIFT_26.challenge.goal})`;
    const reference = await skipThenReloadView(
      browser,
      DRIFT_DAY,
      counters,
      1,
      async (daily, template) => {
        await template.operations.open(ctx);
        await template.operations.build(costly.operations, costly.listed, ctx);
        await daily.run();
        await daily.skip(ctx);
      },
      ctx,
    );

    const midRun = new DailyMidRun(page);
    await dailyPage.serve(DRIFT_DAY);
    await dailyTemplate.operations.open(ctx);
    await dailyTemplate.operations.build(costly.operations, costly.listed, ctx);
    await dailyPage.transport.setSpeed(0.25);
    await dailyPage.run();
    await midRun.waitUntilPartWay(`${ctx}, playing`);
    await dailyPage.transport.pause();
    await midRun.step('Next step', `${ctx}, paused`);
    await midRun.expectStillRunning(`${ctx}, after stepping`);
    await midRun.reload(`${ctx}, reloaded after stepping`);

    const reloaded = `${ctx}, ${MID} after a Next step`;
    await expectTryKept(dailyPage, dailyTemplate, 2, [`${costly.cost}`], reloaded);
    await dailyPage.expectStatusNumber('Score', costly.cost, `${reloaded}: Score should show the kept try's cost ${costly.cost}`);
    await dailyPage.expectStatusNumber('Cost', costly.cost, `${reloaded}: Cost should show the kept try's run at its end (${costly.cost})`);
    await midRun.expectSameAs(reference, counters, MID, SKIPPED, reloaded);
    expect(await dailyPage.canRun(), `${reloaded}: Run should stay enabled with 2 tries left`).toBe(true);
  });

  test('reloading mid-run on the third try ends the day, with Share, the ended message and the streak', async ({ browser, page, dailyPage, dailyHistory, dailyTemplate }) => {
    const { start, goal, highFromGoal } = DAILY_12;
    const counters = ['Comparisons'];
    const ctx = `${DAILY_12.name} dated ${DATE}, tries ${start.count}, ${goal.count} ⭐, then try 3 ${fmt(highFromGoal.values)} (${highFromGoal.count} ⭐)`;
    const playFirstTwo = async (daily: DailyPage) => {
      await daily.open();
      await runSkip(daily, null, `${ctx} try 1 ${fmt(start.values)}`);
      await runSkip(daily, goal.swap, `${ctx} try 2 ${fmt(goal.values)}`);
    };
    const reference = await skipThenReloadView(
      browser,
      QUICKSORT_DAY,
      counters,
      3,
      async (daily) => {
        await playFirstTwo(daily);
        await runSkip(daily, highFromGoal.swap, `${ctx} try 3`);
      },
      ctx,
    );

    const midRun = new DailyMidRun(page);
    await dailyHistory.serveOnly(QUICKSORT_DAY);
    await playFirstTwo(dailyPage);
    await dailyHistory.expectStreak(null, `${ctx}, before try 3: the day isn't finished yet`);
    await dailyPage.swap(highFromGoal.swap[0], highFromGoal.swap[1]);
    await dailyPage.transport.setSpeed(0.25);
    await dailyPage.run();
    await midRun.waitUntilPartWay(`${ctx}, try 3 playing`, 'Comparisons');
    await midRun.reload(`${ctx}, reloaded while try 3 plays`);

    const reloaded = `${ctx}, ${MID} on try 3`;
    const chips = [`${start.count}`, `${goal.count} ⭐`, `${highFromGoal.count} ⭐`];
    await expectTryKept(dailyPage, dailyTemplate, 0, chips, reloaded);
    expect(await dailyPage.canRun(), `${reloaded}: the third try was used, so the day is over and Run should be disabled`).toBe(false);
    expect(await dailyPage.canShare(), `${reloaded}: the day is over, so Share should be enabled`).toBe(true);
    await dailyPage.expectStatusNumber('Score', highFromGoal.count, `${reloaded}: Score should be the highest of the three tries, ${highFromGoal.count}`);
    await dailyHistory.expectStreak(1, `${reloaded}: the day counts as finished, so the streak should be 1 day`);
    await midRun.expectSameAs(reference, counters, MID, SKIPPED, reloaded);
    const view = await midRun.view(counters, reloaded);
    expect(
      view.message,
      `${reloaded}: the line under the actions should give the ended message "You reached the goal! Your highest score was ${highFromGoal.count}."`,
    ).toBe(`You reached the goal! Your highest score was ${highFromGoal.count}.`);
    await dailyHistory.expectArrayFrozen(DAILY_12.challenge.values.length, reloaded);

    const want = [`structs.sh daily #12 · Quicksort · Goal ${DAILY_12.challenge.goal}`, ...chips, 'Streak: 1 day 🔥', 'structs.sh/daily'].join('\n');
    const shared = (await dailyPage.shareText()).trim();
    expect(shared, `${reloaded}: Share text should be ${JSON.stringify(want)}, got ${JSON.stringify(shared)}`).toBe(want);
  });

  test('pressing Run leaves Tries left, Score, the Tries list and the message alone until the run ends', async ({ page, dailyPage, dailyHistory, dailyTemplate }) => {
    const { goal, lowFromGoal, thirdFromLow } = DAILY_12;
    const counters = ['Comparisons'];
    const ctx = `${DAILY_12.name} dated ${DATE}, tries ${goal.count} ⭐ and ${lowFromGoal.count}, then try 3 ${fmt(thirdFromLow.values)} (${thirdFromLow.count})`;
    const midRun = new DailyMidRun(page);
    await dailyHistory.serveOnly(QUICKSORT_DAY);
    await dailyPage.open();
    await runSkip(dailyPage, goal.swap, `${ctx} try 1`);
    await runSkip(dailyPage, lowFromGoal.swap, `${ctx} try 2`);
    await dailyPage.swap(thirdFromLow.swap[0], thirdFromLow.swap[1]);
    await dailyPage.transport.setSpeed(0.25);

    const before = await midRun.view(counters, `${ctx}, before Run`);
    expect(before.triesLeft, `${ctx}, before Run: test setup: Tries left should read 1`).toMatch(/^\D*1(?!\d)/);
    expect(before.message, `${ctx}, before Run: test setup: the last try (${lowFromGoal.count}) missed the goal, so no line under the actions`).toBe('');

    await dailyPage.run();
    await midRun.expectUnchangedWhilePlaying(before, 2, thirdFromLow.count, counters, 5, `${ctx}, right after Run`);
    await midRun.waitUntilPartWay(`${ctx}, playing`, 'Comparisons');
    await midRun.expectUnchangedWhilePlaying(before, 2, thirdFromLow.count, counters, 3, `${ctx}, with Comparisons climbing`);
    await dailyPage.transport.pause();
    await midRun.step('Next step', `${ctx}, paused`);
    const pausedCtx = `${ctx}, paused mid-run after a Next step`;
    const paused = await midRun.view(counters, pausedCtx);
    midRun.expectSavedStateUnchanged(paused, before, 2, thirdFromLow.count, pausedCtx);
    expect(
      `Comparisons: ${paused.chips[2]}`,
      `${pausedCtx}: while paused, the running try's chip should show the live Comparisons count, as today`,
    ).toBe(paused.counters[0]);

    await dailyPage.skip(`${ctx}, Skip`);
    const ended = `${ctx}, after Skip on try 3`;
    await dailyPage.expectStatusNumber('Tries left', 0, `${ended}: Skip ends the run, so Tries left should drop to 0`);
    await dailyTemplate.expectTryChips([`${goal.count} ⭐`, `${lowFromGoal.count}`, `${thirdFromLow.count}`], ended);
    await dailyPage.expectStatusNumber('Score', goal.count, `${ended}: Score should be the highest try, ${goal.count}`);
    expect(await dailyPage.canShare(), `${ended}: the day is over, so Share should be enabled`).toBe(true);
    await expect
      .poll(async () => (await midRun.view(counters, ended)).message, { message: `${ended}: the line under the actions should give the ended message` })
      .toBe(`You reached the goal! Your highest score was ${goal.count}.`);
  });
});
