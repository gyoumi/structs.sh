import { test, expect } from '../support/test';
import { DAILY_7, DAILY_12 } from '../support/daily-fixtures';

// Running a try: playback, stepping, scoring, tries and the share text.
// Rules, swapping, keyboard and layout checks are in daily-game.spec.ts.

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;

test.describe('daily game', () => {
  test('Run animates the sort, and the counter goes up with each comparison', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.challenge);
    await dailyPage.open();

    const ctx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)}`;
    const sorted = [...DAILY_12.start.values].sort((a, b) => a - b);
    await dailyPage.expectPlayDisabledBeforeRun(ctx);
    expect(await dailyPage.transport.speed(), `${ctx}: default playback speed on /daily should be 1×`).toBe(1);
    const initialCounter = await dailyPage.counter(ctx);
    expect(
      initialCounter,
      `${ctx} step 0 (counter ${initialCounter} -> expected 0): Comparisons counter should start at 0 before Run`,
    ).toBe(0);

    await dailyPage.run();
    // Checked before Pause, because clicking Pause would itself scroll the page.
    await dailyPage.expectVisualiserInViewport(`${ctx} after clicking Run`);
    await expect
      .poll(() => dailyPage.counter(ctx), {
        intervals: [50],
        message: `${ctx} step 0 (before stepping, started at ${initialCounter}): Run should animate by itself and raise Comparisons counter above 0 without pressing Next step`,
      })
      .toBeGreaterThan(0);

    const runEnabledWhileAnimating = await dailyPage.canRun();
    await dailyPage.transport.pause();
    const midProgress = await dailyPage.roundedProgress();
    const midCounter = await dailyPage.counter(ctx);
    expect(
      midProgress,
      `${ctx}: after Run and Pause, rounded Animation progress should be below 100 before the run finishes`,
    ).toBeLessThan(100);
    expect(
      runEnabledWhileAnimating,
      `${ctx}: while Run is animating (checked before Pause at rounded progress ${midProgress}%, comparisons ${midCounter}/${DAILY_12.start.count}), Run button should be disabled`,
    ).toBe(false);

    await dailyPage.transport.rewind();
    await dailyPage.transport.setSpeed(5);
    await expect
      .poll(() => dailyPage.counter(ctx), {
        intervals: [50],
        message: `${ctx} step 0 (after Pause and Back to the start): Comparisons counter should reset to 0`,
      })
      .toBe(0);
    await expect
      .poll(() => dailyPage.drawnValues(), {
        intervals: [50],
        message: `${ctx}: after rewinding to the start, #visualiser-canvas should draw the served arrangement ${fmt(DAILY_12.start.values)}`,
      })
      .toEqual([...DAILY_12.start.values]);

    const startKey = fmt(DAILY_12.start.values);
    const sortedKey = fmt(sorted);
    let sawIntermediateArrangement = false;
    const maxSteps = 250;
    const result = await dailyPage.stepToEnd(
      maxSteps,
      async ({ step, before, after, progress }) => {
        const delta = after - before;
        expect(
          delta,
          `${ctx} step ${step}: Comparisons counter went from ${before} to ${after} (delta ${delta}); must never go down`,
        ).toBeGreaterThanOrEqual(0);
        expect(
          delta,
          `${ctx} step ${step}: Comparisons counter went from ${before} to ${after} (delta ${delta}); must go up by at most 1 per step`,
        ).toBeLessThanOrEqual(1);

        const drawn = await dailyPage.drawnValues();
        const drawnKey = fmt(drawn);
        const isPermutation = fmt([...drawn].sort((a, b) => a - b)) === sortedKey;
        sawIntermediateArrangement ||=
          progress < 100 && isPermutation && drawnKey !== startKey && drawnKey !== sortedKey;
      },
      ctx,
    );

    expect(
      result.atEnd,
      `${ctx} step ${result.steps}: timeline did not reach the end within ${maxSteps} Next step clicks (counter went from 0 to ${result.counter})`,
    ).toBe(true);
    expect(
      sawIntermediateArrangement,
      `${ctx} (${result.steps} steps): #visualiser-canvas drawing never showed an intermediate permutation between the endpoints (${startKey} and ${sortedKey}); expected at least one intermediate arrangement`,
    ).toBe(true);
    expect(
      result.counter,
      `${ctx} step ${result.steps}: Comparisons counter at end of timeline went from 0 to ${result.counter}, expected hand-worked count ${DAILY_12.start.count}`,
    ).toBe(DAILY_12.start.count);
    await expect
      .poll(() => dailyPage.drawnValues(), {
        intervals: [50],
        message: `${ctx}: at the end of the timeline, #visualiser-canvas should draw the sorted array ${fmt(sorted)}`,
      })
      .toEqual(sorted);
  });

  test('the final count matches the score shown, and both match the hand-worked count', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_7.challenge);
    await dailyPage.open();

    await dailyPage.transport.setSpeed(5);
    await dailyPage.run();
    await dailyPage.waitForRunToFinish();

    const ctx = `${DAILY_7.name} ${fmt(DAILY_7.start.values)}`;
    const finalCount = await dailyPage.counter(ctx);
    expect(finalCount, `${ctx}: final Comparisons counter should match hand-worked count ${DAILY_7.start.count}`).toBe(DAILY_7.start.count);
    await dailyPage.expectStatusNumber(
      'Score',
      finalCount,
      `${ctx}: Score status should match final Comparisons counter (${finalCount}) and hand-worked count ${DAILY_7.start.count}`,
    );
  });

  test('Skip jumps straight to the final count', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.challenge);
    await dailyPage.open();

    const ctx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)}`;
    await dailyPage.run();
    await dailyPage.transport.pause();

    const pausedCounter = await dailyPage.counter(ctx);
    expect(await dailyPage.roundedProgress(), `${ctx}: after Run and Pause, rounded Animation progress should be below 100 before Play`).toBeLessThan(100);
    expect(pausedCounter, `${ctx}: after Run and Pause, Comparisons counter should be below ${DAILY_12.start.count} before Play`).toBeLessThan(DAILY_12.start.count);

    await dailyPage.transport.play();
    await expect
      .poll(() => dailyPage.counter(ctx), {
        intervals: [50],
        message: `${ctx}: after Pause, pressing Play should resume playback and raise Comparisons counter above ${pausedCounter} without Next step`,
      })
      .toBeGreaterThan(pausedCounter);
    await dailyPage.transport.pause();

    expect(await dailyPage.roundedProgress(), `${ctx}: after Play and Pause, rounded Animation progress should remain below 100 before Skip`).toBeLessThan(100);
    expect(await dailyPage.counter(ctx), `${ctx}: after Play and Pause, Comparisons counter should remain below ${DAILY_12.start.count} before Skip`).toBeLessThan(DAILY_12.start.count);

    await dailyPage.skip(ctx);

    expect(await dailyPage.counter(ctx), `${ctx}: Skip while paused should jump Comparisons counter to ${DAILY_12.start.count}`).toBe(DAILY_12.start.count);
    await dailyPage.expectStatusNumber('Score', DAILY_12.start.count, `${ctx}: Skip while paused should show final Score ${DAILY_12.start.count}`);
  });

  test('stepping back lowers the counter', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.challenge);
    await dailyPage.open();

    const ctx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)}`;
    await dailyPage.run();
    await dailyPage.skip(ctx);

    const atEnd = await dailyPage.counter(ctx);
    expect(atEnd, `${ctx}: setup after Skip should show Comparisons counter ${DAILY_12.start.count}`).toBe(DAILY_12.start.count);
    await dailyPage.expectStatusNumber('Tries left', 2, `${ctx}: Tries left should be 2 after try 1 finishes`);

    const stepped = await dailyPage.stepBackUntilCounterDrops(atEnd, ctx);
    expect(stepped.progress, `${ctx}: Previous step (${stepped.steps} click(s)) should move rounded Animation progress below 100`).toBeLessThan(100);
    expect(stepped.counter, `${ctx}: Previous step (${stepped.steps} click(s)) from ${atEnd} should lower Comparisons counter below ${atEnd}`).toBeLessThan(atEnd);
    expect(stepped.counter, `${ctx}: Comparisons counter after stepping back should stay >= 0`).toBeGreaterThanOrEqual(0);

    await dailyPage.transport.skipToEnd(ctx);
    await dailyPage.transport.replay();
    let afterReplay = 100;
    await expect
      .poll(
        async () => {
          afterReplay = await dailyPage.roundedProgress();
          return afterReplay;
        },
        {
          intervals: [25],
          message: `${ctx}: pressing Replay after a completed run should restart playback so rounded Animation progress drops below 100`,
        },
      )
      .toBeLessThan(100);
    await expect
      .poll(() => dailyPage.roundedProgress(), {
        intervals: [50],
        message: `${ctx}: after Replay restarts playback at rounded Animation progress ${afterReplay}%, rounded Animation progress should rise above ${afterReplay}`,
      })
      .toBeGreaterThan(afterReplay);
    await dailyPage.transport.skipToEnd(ctx);
    await dailyPage.expectStatusNumber(
      'Tries left',
      2,
      `${ctx}: a replayed run that finishes must not use a try (Tries left should stay 2)`,
    );

    const speeds = await dailyPage.transport.speeds();
    expect(
      speeds,
      `${ctx}: Speed combobox should offer 0.25× through 5× (got [${speeds.join(', ')}])`,
    ).toEqual([0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4, 5]);
    await dailyPage.transport.setSpeed(5);
    expect(await dailyPage.transport.speed(), `${ctx}: selecting 5× in the Speed combobox should stick (expected 5)`).toBe(5);
  });

  test('reaching the goal is announced, and the next try is still offered', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.challenge);
    await dailyPage.open();

    const ctx = `${DAILY_12.name} try 1 ${fmt(DAILY_12.goal.values)} (score ${DAILY_12.goal.count} = goal ${DAILY_12.challenge.goal})`;
    await dailyPage.swap(DAILY_12.goal.swap[0], DAILY_12.goal.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(ctx);

    await dailyPage.expectStatusNumber(
      'Score',
      DAILY_12.goal.count,
      `${ctx}: Score should be ${DAILY_12.goal.count}`,
    );
    expect(await dailyPage.goalReached(), `${ctx}: "Goal reached" status should be visible when score ${DAILY_12.goal.count} >= goal ${DAILY_12.challenge.goal}`).toBe(true);
    await dailyPage.expectStatusNumber(
      'Tries left',
      2,
      `${ctx}: 2 tries should remain after reaching the goal on try 1`,
    );
    expect(await dailyPage.canRun(), `${ctx}: Run button should stay enabled for the next try after reaching the goal`).toBe(true);
    expect(await dailyPage.canShare(), `${ctx}: Share should not be offered while tries remain`).toBe(false);
    expect(await dailyPage.values(), `${ctx}: Challenge array should stay as the player left it`).toEqual([...DAILY_12.goal.values]);
    await dailyPage.expectNoBestShown(ctx);
  });

  test('beating the goal still offers the next try and never reveals a best score', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.challenge);
    await dailyPage.open();

    const ctx = `${DAILY_12.name} try 1 ${fmt(DAILY_12.highFromStart.values)} (score ${DAILY_12.highFromStart.count} > goal ${DAILY_12.challenge.goal}; also the solver's best, which the page is never told)`;
    await dailyPage.swap(DAILY_12.highFromStart.swap[0], DAILY_12.highFromStart.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(ctx);

    await dailyPage.expectStatusNumber(
      'Score',
      DAILY_12.highFromStart.count,
      `${ctx}: Score should be ${DAILY_12.highFromStart.count}`,
    );
    expect(await dailyPage.goalReached(), `${ctx}: "Goal reached" status should be visible when score ${DAILY_12.highFromStart.count} >= goal ${DAILY_12.challenge.goal}`).toBe(true);
    await dailyPage.expectStatusNumber(
      'Tries left',
      2,
      `${ctx}: beating the goal must not end the challenge early; Tries left should still be 2`,
    );
    expect(await dailyPage.canRun(), `${ctx}: beating the goal must not end the challenge early; Run button should still be enabled`).toBe(true);
    expect(await dailyPage.canShare(), `${ctx}: beating the goal must not end the challenge early; Share should not be offered while 2 tries remain`).toBe(false);
    await dailyPage.expectNoBestShown(ctx);
  });

  test('after three tries, the challenge ends with the highest score', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.challenge);
    await dailyPage.open();

    const try1Ctx = `${DAILY_12.name} try 1 ${fmt(DAILY_12.goal.values)}`;
    const try2Ctx = `${DAILY_12.name} try 2 ${fmt(DAILY_12.lowFromGoal.values)}`;
    const try3Ctx = `${DAILY_12.name} try 3 ${fmt(DAILY_12.thirdFromLow.values)}`;
    const endCtx = `${DAILY_12.name} after tries [${DAILY_12.goal.count}, ${DAILY_12.lowFromGoal.count}, ${DAILY_12.thirdFromLow.count}]`;

    await dailyPage.expectStatusNumber('Tries left', 3, `${DAILY_12.name} ${fmt(DAILY_12.start.values)}: new challenge should start with 3 tries left`);

    // Try 1: 34 (reaches goal; highest of the three tries)
    await dailyPage.swap(DAILY_12.goal.swap[0], DAILY_12.goal.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(try1Ctx);
    await dailyPage.expectStatusNumber('Score', DAILY_12.goal.count, `${try1Ctx}: Score should be ${DAILY_12.goal.count}`);
    await dailyPage.expectStatusNumber('Tries left', 2, `${try1Ctx}: Tries left should be 2`);
    expect(await dailyPage.values(), `${try1Ctx}: Challenge array should stay at ${fmt(DAILY_12.goal.values)}`).toEqual([...DAILY_12.goal.values]);

    // Try 2: 25 (lower than try 1; Score must show the last run while tries remain)
    await dailyPage.swap(DAILY_12.lowFromGoal.swap[0], DAILY_12.lowFromGoal.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(try2Ctx);
    await dailyPage.expectStatusNumber(
      'Score',
      DAILY_12.lowFromGoal.count,
      `${try2Ctx}: while tries remain, Score must show the last run (${DAILY_12.lowFromGoal.count}), not the highest (${DAILY_12.goal.count})`,
    );
    await dailyPage.expectStatusNumber('Tries left', 1, `${try2Ctx}: Tries left should be 1`);

    // Try 3: 31 (below goal and below try 1)
    await dailyPage.swap(DAILY_12.thirdFromLow.swap[0], DAILY_12.thirdFromLow.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(try3Ctx);

    expect(await dailyPage.counter(try3Ctx), `${try3Ctx}: Comparisons counter should be ${DAILY_12.thirdFromLow.count}`).toBe(DAILY_12.thirdFromLow.count);
    await dailyPage.expectStatusNumber('Tries left', 0, `${try3Ctx}: Tries left should be 0`);
    await dailyPage.expectStatusNumber('Score', DAILY_12.goal.count, `${endCtx}: once the challenge ends, Score should be the highest try (${DAILY_12.goal.count}), not the last (${DAILY_12.thirdFromLow.count})`);
    expect(
      await dailyPage.goalReached(),
      `${endCtx}: "Goal reached" should be visible at the end because the highest try ${DAILY_12.goal.count} >= goal ${DAILY_12.challenge.goal} (even though the last try ${DAILY_12.thirdFromLow.count} was below it)`,
    ).toBe(true);
    expect(await dailyPage.canRun(), `${endCtx}: Run button should be disabled or hidden after the third try`).toBe(false);
    expect(await dailyPage.canShare(), `${endCtx}: Share button should be visible and enabled once the challenge ends`).toBe(true);
    await dailyPage.expectNoBestShown(endCtx);
  });

  test('the share text has one line per try with ⭐ marks, and does not include the arrangement', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.challenge);
    await dailyPage.open();

    // Try 1: 30 (below goal), Try 2: 34 ⭐ (equals goal), Try 3: 36 ⭐ (beats goal)
    await dailyPage.run();
    await dailyPage.skip(`${DAILY_12.name} try 1 ${fmt(DAILY_12.start.values)}`);
    await dailyPage.swap(DAILY_12.goal.swap[0], DAILY_12.goal.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(`${DAILY_12.name} try 2 ${fmt(DAILY_12.goal.values)}`);
    await dailyPage.swap(DAILY_12.highFromGoal.swap[0], DAILY_12.highFromGoal.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(`${DAILY_12.name} try 3 ${fmt(DAILY_12.highFromGoal.values)}`);

    const expectedShare = [
      `structs.sh daily #12 · Quicksort · Goal ${DAILY_12.challenge.goal}`,
      `${DAILY_12.start.count}`,
      `${DAILY_12.goal.count} ⭐`,
      `${DAILY_12.highFromGoal.count} ⭐`,
      'structs.sh/daily',
    ].join('\n');

    const ctx = `${DAILY_12.name} tries [${DAILY_12.start.count}, ${DAILY_12.goal.count}, ${DAILY_12.highFromGoal.count}]`;
    const shared = (await dailyPage.shareText()).trim();
    expect(
      shared,
      `${ctx}: Share text should be exactly ${JSON.stringify(expectedShare)} (header with goal, one bare score per try, " ⭐" at or above goal ${DAILY_12.challenge.goal}, no "/ best", no 🏆, no arrangement)`,
    ).toBe(expectedShare);
    for (const arrangement of [DAILY_12.start.values, DAILY_12.goal.values, DAILY_12.highFromGoal.values]) {
      expect(
        shared.includes(arrangement.join(', ')) || shared.includes(arrangement.join(',')) || shared.includes(arrangement.join(' ')),
        `${ctx}: Share text must not include the arrangement ${fmt(arrangement)}; got ${JSON.stringify(shared)}`,
      ).toBe(false);
    }
  });
});
