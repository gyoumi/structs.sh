import { test, expect } from '../support/test';
import { DAILY_12 } from '../support/daily-fixtures';
import type { DatedChallenge } from '../support/daily-history';
import type { DailyPage } from '../support/daily-page';
import { contentDifferences, type DailyStageView, type StageView } from '../support/daily-stage-view';
import { UPSET_25 } from '../support/daily-tree-fixtures';

/**
 * Step 3b promised that a refresh shows the finished challenge again. After a reload, a day with saved tries
 * shows its most recent try's run as it looked right after that run ended: the live counter shows that
 * try's count, the playback sits at the run's last step ("Step N of N"), the stage draws the run's last
 * frame, and Replay, rewinding and stepping back work as they did before the reload. This holds whether the
 * day is finished or still has tries left. A day with no tries is unchanged.
 *
 * Found by the 3e exploratory run: after reloading a finished quicksort day, COMPARISONS read 0, the
 * playback said "No steps yet" and Play/Replay were disabled, while the tries, Score and Goal reached
 * were right.
 *
 * The viewport is 1440 wide because the playback's "Step N of M" readout only shows on screens wider than 1360.
 */

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;
const QUICKSORT_DAY: DatedChallenge = { ...DAILY_12.challenge, date: '2026-12-21' };
const UPSET_DAY: DatedChallenge = { ...UPSET_25.challenge, date: '2026-12-21' };

const swapRunSkip = async (dailyPage: DailyPage, swap: readonly [number, number], context: string) => {
  await dailyPage.swap(swap[0], swap[1]);
  await dailyPage.run();
  await dailyPage.skip(context);
};

/** From the end of the run: steps back until Comparisons drops, notes the step readout there, then skips back to the end. */
const stepBackFromEnd = async (dailyPage: DailyPage, dailyStage: DailyStageView, from: number, context: string) => {
  const back = await dailyPage.stepBackUntilCounterDrops(from, context);
  const step = await dailyStage.stepText(`${context}, after stepping back`);
  await dailyPage.transport.skipToEnd(`${context}, back to the end`);
  return { counter: back.counter, steps: back.steps, step };
};

/** After the reload: the same last frame, the same step readout, and the playback complete with Replay enabled. */
const expectRunRestored = async (dailyPage: DailyPage, dailyStage: DailyStageView, before: StageView, context: string) => {
  await dailyStage.expectStepText(
    before.step,
    `${context}: the playback should sit at the last try's last step, as it did before the reload ("${before.step}", not "No steps yet")`,
  );
  expect(await dailyPage.roundedProgress(context), `${context}: Animation progress should be at the end (100) of the last try's run`).toBe(100);
  await dailyStage.expectPlaybackButton('Replay', true, `${context}: the last try's run is complete, so the play button should offer Replay, enabled`);
  const after = await dailyStage.settledView(context);
  expect(
    contentDifferences(before.contents, after.contents),
    `${context}: each stage should draw the last frame of the last try's run, as it did before the reload`,
  ).toEqual([]);
  expect(after.looks, `${context}: each stage should be coloured as it was at the end of the run before the reload`).toEqual(before.looks);
};

test.describe('daily game reload', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('after a reload with tries left, the last try is shown at its end and its playback still works', async ({ dailyPage, dailyHistory, dailyStage }) => {
    const { goal } = DAILY_12;
    await dailyHistory.serveOnly(QUICKSORT_DAY);
    await dailyPage.open();
    const ctx = `${DAILY_12.name} dated ${QUICKSORT_DAY.date}, try 1 ${fmt(goal.values)} (${goal.count} comparisons)`;
    await swapRunSkip(dailyPage, goal.swap, ctx);
    await dailyPage.expectStatusNumber('Comparisons', goal.count, `${ctx}: before the reload, Comparisons should show the run's ${goal.count}`);
    const before = await dailyStage.settledView(`${ctx}, before the reload`);
    expect(before.step, `${ctx}: before the reload, the playback should be at the run's last step`).toMatch(/^Step (\d+) of \1$/);
    const backBefore = await stepBackFromEnd(dailyPage, dailyStage, goal.count, `${ctx}, before the reload`);

    await dailyHistory.reload(`${ctx}, then reload`);
    const reloaded = `${ctx}, after reloading /daily with 2 tries left`;
    await dailyPage.expectStatusNumber(
      'Comparisons',
      goal.count,
      `${reloaded}: Comparisons should show the last try's ${goal.count}, as right after that run ended, not 0`,
    );
    await expectRunRestored(dailyPage, dailyStage, before, reloaded);
    await dailyPage.expectStatusNumber('Tries left', 2, `${reloaded}: Tries left should still be 2`);
    expect(await dailyPage.canRun(), `${reloaded}: Run should stay enabled with 2 tries left`).toBe(true);

    const backAfter = await stepBackFromEnd(dailyPage, dailyStage, goal.count, `${reloaded}, stepping back from the end`);
    expect(
      backAfter,
      `${reloaded}: Previous step from the end should step back through the restored run as it did before the reload (step readout and Comparisons where it first drops below ${goal.count})`,
    ).toEqual(backBefore);
    await dailyPage.transport.rewind();
    await dailyPage.expectStatusNumber('Comparisons', 0, `${reloaded}: Back to the start should rewind the restored run to 0 comparisons`);
    await dailyPage.transport.skipToEnd(reloaded);
    await dailyPage.expectStatusNumber('Comparisons', goal.count, `${reloaded}: Skip to the end should bring Comparisons back to ${goal.count}`);

    await dailyPage.transport.replay();
    await expect
      .poll(() => dailyPage.roundedProgress(reloaded), { message: `${reloaded}: Replay should play the restored run again from the start (Animation progress below 100)` })
      .toBeLessThan(100);
    await dailyPage.transport.skipToEnd(`${reloaded}, after Replay`);
    await dailyPage.expectStatusNumber('Tries left', 2, `${reloaded}: replaying the restored run must not use a try`);
  });

  test('after a reload of a finished day, the counter shows the most recent try, not the best', async ({ dailyPage, dailyHistory, dailyStage, dailyTemplate }) => {
    const tries = [DAILY_12.goal, DAILY_12.lowFromGoal, DAILY_12.thirdFromLow];
    const last = DAILY_12.thirdFromLow;
    await dailyHistory.serveOnly(QUICKSORT_DAY);
    await dailyPage.open();
    const ctx = `${DAILY_12.name} dated ${QUICKSORT_DAY.date}, finished with tries ${tries.map((t) => t.count).join(', ')} (last ${fmt(last.values)})`;
    for (const [i, attempt] of tries.entries()) await swapRunSkip(dailyPage, attempt.swap, `${ctx} try ${i + 1}`);
    await dailyPage.expectStatusNumber('Tries left', 0, `${ctx}: the day should be finished`);
    await dailyPage.expectStatusNumber('Comparisons', last.count, `${ctx}: before the reload, Comparisons should show the last run's ${last.count}`);
    const before = await dailyStage.settledView(`${ctx}, before the reload`);
    expect(before.step, `${ctx}: before the reload, the playback should be at the last run's last step`).toMatch(/^Step (\d+) of \1$/);
    const backBefore = await stepBackFromEnd(dailyPage, dailyStage, last.count, `${ctx}, before the reload`);

    await dailyHistory.reload(`${ctx}, then reload`);
    const reloaded = `${ctx}, after reloading /daily`;
    await dailyPage.expectStatusNumber(
      'Comparisons',
      last.count,
      `${reloaded}: Comparisons should show the most recent try's ${last.count} (not 0, and not the highest score ${DAILY_12.goal.count})`,
    );
    await dailyPage.expectStatusNumber('Score', DAILY_12.goal.count, `${reloaded}: Score should still be the highest try, ${DAILY_12.goal.count}`);
    await dailyTemplate.expectGoalReached(true, reloaded);
    await expectRunRestored(dailyPage, dailyStage, before, reloaded);

    const backAfter = await stepBackFromEnd(dailyPage, dailyStage, last.count, `${reloaded}, stepping back from the end`);
    expect(
      backAfter,
      `${reloaded}: Previous step from the end should step back through the restored run as it did before the reload`,
    ).toEqual(backBefore);
    await dailyPage.transport.rewind();
    await dailyPage.expectStatusNumber('Comparisons', 0, `${reloaded}: Back to the start should rewind the restored run to 0 comparisons`);
    await dailyPage.transport.skipToEnd(reloaded);
    await dailyPage.expectStatusNumber('Comparisons', last.count, `${reloaded}: Skip to the end should bring Comparisons back to ${last.count}`);
    expect(await dailyPage.canShare(), `${reloaded}: Share should stay enabled on the finished day`).toBe(true);
  });

  test('after a reload, both stages of a two-stage template show the last try at its end', async ({ dailyPage, dailyHistory, dailyStage, dailyTemplate }) => {
    const { start } = UPSET_25;
    await dailyHistory.serveOnly(UPSET_DAY);
    await dailyPage.open();
    const ctx = `${UPSET_25.name} dated ${UPSET_DAY.date}, try 1 ${fmt(start.values)} (BST ${start.bst}, AVL ${start.avl})`;
    await dailyPage.run();
    await dailyPage.skip(ctx);
    const before = await dailyStage.settledView(`${ctx}, before the reload`);
    expect(before.step, `${ctx}: before the reload, the playback should be at the run's last step`).toMatch(/^Step (\d+) of \1$/);

    await dailyHistory.reload(`${ctx}, then reload`);
    const reloaded = `${ctx}, after reloading /daily with 2 tries left`;
    await dailyPage.expectStatusNumber('BST nodes passed', start.bst, `${reloaded}: BST nodes passed should show the last try's ${start.bst}, not 0`);
    await dailyPage.expectStatusNumber('AVL nodes passed', start.avl, `${reloaded}: AVL nodes passed should show the last try's ${start.avl}, not 0`);
    await dailyTemplate.stages.expectTree('BST', start.bstTree, `${reloaded}: the BST stage should draw the last try's final BST`);
    await dailyTemplate.stages.expectTree('AVL tree', start.avlTree, `${reloaded}: the AVL tree stage should draw the last try's final AVL tree`);
    await expectRunRestored(dailyPage, dailyStage, before, reloaded);
    await dailyPage.transport.rewind();
    await dailyPage.expectStatusNumber('BST nodes passed', 0, `${reloaded}: Back to the start should rewind both stages (BST nodes passed 0)`);
    await dailyPage.expectStatusNumber('AVL nodes passed', 0, `${reloaded}: Back to the start should rewind both stages (AVL nodes passed 0)`);
  });

  test('after a reload with no tries, the playback is still empty', async ({ dailyPage, dailyHistory, dailyStage }) => {
    await dailyHistory.serveOnly(QUICKSORT_DAY);
    await dailyPage.open();
    await dailyHistory.reload(`${DAILY_12.name} dated ${QUICKSORT_DAY.date}, reloaded before any try`);
    const ctx = `${DAILY_12.name} dated ${QUICKSORT_DAY.date}, reloaded before any try`;
    await dailyPage.expectStatusNumber('Comparisons', 0, `${ctx}: Comparisons should be 0 with no try played`);
    await dailyPage.expectStatusNumber('Tries left', 3, `${ctx}: Tries left should be 3`);
    await dailyStage.expectStepText('No steps yet', `${ctx}: the playback should have no steps with no try played`);
    await dailyStage.expectPlaybackButton('Play', false, `${ctx}: Play should be disabled with no try played`);
    expect(await dailyPage.values(), `${ctx}: Challenge array should show the served arrangement ${fmt(DAILY_12.start.values)}`).toEqual([...DAILY_12.start.values]);
  });
});
