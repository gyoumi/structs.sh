import { test, expect } from '../support/test';
import { DAILY_7, DAILY_12 } from '../support/daily-fixtures';

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;
const RULES_SENTENCE = 'Reorder the numbers so quicksort makes as many comparisons as you can.';

test.describe('daily game', () => {
  test('the puzzle shows its rules, goal and fixed values', async ({ dailyPage }) => {
    const servedPuzzle = { ...DAILY_7.puzzle, par: 35 };
    await dailyPage.serve(servedPuzzle);
    await dailyPage.open();

    const startCtx = `DAILY_7 (#7, served goal ${servedPuzzle.par}, formula goal ${DAILY_7.puzzle.par}, best ${servedPuzzle.best}) ${fmt(DAILY_7.start.values)}`;
    await dailyPage.expectRulesToContain(RULES_SENTENCE, startCtx);
    expect(
      await dailyPage.goal(startCtx),
      `${startCtx}: Goal status must show the served goal ${servedPuzzle.par} rather than work out the formula goal ${DAILY_7.puzzle.par}`,
    ).toBe(servedPuzzle.par);
    expect(await dailyPage.values(), `${startCtx}: Puzzle array should show starting values ${fmt(DAILY_7.puzzle.values)}`).toEqual([...DAILY_7.puzzle.values]);
    expect(await dailyPage.fixedIndices(), `${startCtx}: fixed slots ${fmt(DAILY_7.puzzle.fixed)} should be disabled and all others enabled`).toEqual([...DAILY_7.puzzle.fixed]);
    expect(await dailyPage.bestVisible(), `${startCtx}: Best status should stay hidden until puzzle end`).toBe(false);
  });

  test('tapping two free values swaps them, and fixed values cannot be selected', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    const startCtx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)}`;
    const goalCtx = `${DAILY_12.name} ${fmt(DAILY_12.par.values)}`;

    await dailyPage.select(2);
    expect(await dailyPage.selectedIndices(), `${startCtx}: selecting free slot 2 (value 6) should set aria-pressed="true" only on slot 2`).toEqual([2]);

    await dailyPage.select(7);
    expect(await dailyPage.values(), `${startCtx}: tapping free slots 2 and 7 should swap 6 and 5 to ${fmt(DAILY_12.par.values)}`).toEqual([...DAILY_12.par.values]);
    expect(await dailyPage.selectedIndices(), `${goalCtx}: selection should clear after swapping slots 2 and 7`).toEqual([]);
    expect(await dailyPage.fixedIndices(), `${DAILY_12.name}: fixed slots ${fmt(DAILY_12.puzzle.fixed)} should be disabled`).toEqual([...DAILY_12.puzzle.fixed]);

    await dailyPage.trySelectFixed(1);
    expect(await dailyPage.selectedIndices(), `${goalCtx}: clicking fixed slot 1 (value 1) must not select it`).toEqual([]);

    await dailyPage.select(0);
    expect(await dailyPage.values(), `${goalCtx}: clicking fixed slot 1 then free slot 0 must not swap them`).toEqual([...DAILY_12.par.values]);
    expect(await dailyPage.selectedIndices(), `${goalCtx}: clicking free slot 0 after fixed slot 1 should select slot 0`).toEqual([0]);

    await dailyPage.trySelectFixed(1);
    expect(
      await dailyPage.values(),
      `${goalCtx}: with free slot 0 (value 8) selected, clicking fixed slot 1 (value 1) must not move either value; expected ${fmt(DAILY_12.par.values)}`,
    ).toEqual([...DAILY_12.par.values]);
    expect(
      await dailyPage.selectedIndices(),
      `${goalCtx}: targeting fixed slot 1 (value 1) while free slot 0 is selected must not select slot 1`,
    ).not.toContain(1);
  });

  test('free values can be swapped with the keyboard', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    const startCtx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)}`;
    for (const clearKey of ['Escape', 'Space', 'Enter'] as const) {
      await dailyPage.keyboardSelectByTab(0, startCtx, 'Space');
      expect(await dailyPage.selectedIndices(), `${startCtx}: pressing Space on focused free slot 0 should select slot 0 (before clearing with ${clearKey})`).toEqual([0]);
      await dailyPage.pressKey(clearKey);
      await dailyPage.expectNoSelection(`${startCtx}: pressing ${clearKey} while slot 0 is selected`);
      expect(
        await dailyPage.values(),
        `${startCtx}: clearing slot 0 selection with ${clearKey} must leave values unchanged at ${fmt(DAILY_12.start.values)}`,
      ).toEqual([...DAILY_12.start.values]);
    }

    await dailyPage.keyboardSelectByTab(0, startCtx);
    expect(await dailyPage.selectedIndices(), `${startCtx}: pressing Tab to free slot 0 and pressing Enter should select slot 0`).toEqual([0]);

    // Slot 1 is fixed (value 1), so ArrowRight skips slot 1 and swaps slot 0 (8) with slot 2 (6).
    const afterFirstRight = [6, 1, 8, 3, 2, 7, 4, 5];
    const firstRightCtx = `${DAILY_12.name} ${fmt(afterFirstRight)}`;
    await dailyPage.pressKey('ArrowRight');
    expect(await dailyPage.values(), `${startCtx}: ArrowRight from slot 0 should skip fixed slot 1 and swap with slot 2 to ${fmt(afterFirstRight)}`).toEqual(afterFirstRight);
    expect(await dailyPage.selectedIndices(), `${firstRightCtx}: selection should follow the moved value to slot 2`).toEqual([2]);
    expect(await dailyPage.focusedSlotIndex(), `${firstRightCtx}: focus should follow the moved value to slot 2`).toBe(2);

    const afterSecondRight = [6, 1, 3, 8, 2, 7, 4, 5];
    const secondRightCtx = `${DAILY_12.name} ${fmt(afterSecondRight)}`;
    await dailyPage.pressKey('ArrowRight');
    expect(await dailyPage.values(), `${firstRightCtx}: ArrowRight from slot 2 should swap with adjacent free slot 3 to ${fmt(afterSecondRight)}`).toEqual(afterSecondRight);
    expect(await dailyPage.selectedIndices(), `${secondRightCtx}: selection should follow the moved value to slot 3`).toEqual([3]);
    expect(await dailyPage.focusedSlotIndex(), `${secondRightCtx}: focus should follow the moved value to slot 3`).toBe(3);

    await dailyPage.pressKey('ArrowLeft');
    expect(await dailyPage.values(), `${secondRightCtx}: ArrowLeft from slot 3 should swap back with slot 2 to ${fmt(afterFirstRight)}`).toEqual(afterFirstRight);
    expect(await dailyPage.selectedIndices(), `${firstRightCtx}: selection should follow the moved value back to slot 2`).toEqual([2]);
    expect(await dailyPage.focusedSlotIndex(), `${firstRightCtx}: focus should follow the moved value back to slot 2`).toBe(2);

    // Slot 1 is fixed (value 1), so ArrowLeft from slot 2 skips slot 1 and swaps slot 2 (8) back with slot 0 (6).
    await dailyPage.pressKey('ArrowLeft');
    expect(
      await dailyPage.values(),
      `${firstRightCtx}: ArrowLeft from slot 2 should skip fixed slot 1 and swap with slot 0 to ${fmt(DAILY_12.start.values)}`,
    ).toEqual([...DAILY_12.start.values]);
    expect(await dailyPage.selectedIndices(), `${startCtx}: selection should follow the moved value back to slot 0`).toEqual([0]);
    expect(await dailyPage.focusedSlotIndex(), `${startCtx}: focus should follow the moved value back to slot 0`).toBe(0);

    // Clear selection, select slot 0 with Enter, Tab past fixed slot 1 to slot 2, and press Enter to swap.
    await dailyPage.pressKey('Escape');
    await dailyPage.keyboardSelectByTab(0, startCtx, 'Enter');
    await dailyPage.pressKey('Tab');
    expect(
      await dailyPage.focusedSlotIndex(),
      `${startCtx}: pressing Enter on slot 0 then Tab should move focus past fixed slot 1 to free slot 2`,
    ).toBe(2);
    await dailyPage.pressKey('Enter');
    expect(
      await dailyPage.values(),
      `${startCtx}: pressing Enter on slot 0, Tab, then Enter on slot 2 should swap 8 and 6 to ${fmt(afterFirstRight)}`,
    ).toEqual(afterFirstRight);
    await dailyPage.expectNoSelection(`${startCtx}: pressing Enter on slot 0, Tab, then Enter on slot 2 (expected ${fmt(afterFirstRight)})`);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('swapping works on a phone-sized screen', async ({ dailyPage }) => {
      await dailyPage.serve(DAILY_12.puzzle);
      await dailyPage.open();

      const phoneStartCtx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)} at 390x844 touch`;
      await dailyPage.expectAllSlotsInViewport(phoneStartCtx, DAILY_12.puzzle.values.length);

      await dailyPage.tapSwap(2, 7);
      expect(await dailyPage.values(), `${DAILY_12.name} ${fmt(DAILY_12.start.values)} at 390x844 touch: tapping free slots 2 and 7 should swap 6 and 5 to ${fmt(DAILY_12.par.values)}`).toEqual([...DAILY_12.par.values]);
      expect(await dailyPage.fixedIndices(), `${DAILY_12.name} at 390x844 touch: fixed slots ${fmt(DAILY_12.puzzle.fixed)} should remain disabled`).toEqual([...DAILY_12.puzzle.fixed]);

      const goalCtx = `${DAILY_12.name} ${fmt(DAILY_12.par.values)} at 390x844 touch`;
      await dailyPage.tryTapFixed(1);
      expect(
        await dailyPage.selectedIndices(),
        `${goalCtx}: tapping fixed slot 1 (value 1) must not select it`,
      ).toEqual([]);

      await dailyPage.tapSlot(0);
      expect(
        await dailyPage.selectedIndices(),
        `${goalCtx}: tapping free slot 0 (value 8) should select slot 0`,
      ).toEqual([0]);

      await dailyPage.tryTapFixed(1);
      expect(
        await dailyPage.values(),
        `${goalCtx}: with free slot 0 (value 8) selected, tapping fixed slot 1 (value 1) must not move either value; expected ${fmt(DAILY_12.par.values)}`,
      ).toEqual([...DAILY_12.par.values]);
      expect(
        await dailyPage.selectedIndices(),
        `${goalCtx}: targeting fixed slot 1 (value 1) while free slot 0 is selected must not select slot 1`,
      ).not.toContain(1);
    });
  });

  test('Run animates the sort, and the counter goes up with each comparison', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    const ctx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)}`;
    const sorted = [...DAILY_12.start.values].sort((a, b) => a - b);
    const initialCounter = await dailyPage.counter(ctx);
    expect(
      initialCounter,
      `${ctx} step 0 (counter ${initialCounter} -> expected 0): Comparisons counter should start at 0 before Run`,
    ).toBe(0);

    await dailyPage.run();
    await expect
      .poll(() => dailyPage.counter(ctx), {
        intervals: [50],
        message: `${ctx} step 0 (before stepping, started at ${initialCounter}): Run should animate by itself and raise Comparisons counter above 0 without pressing Next step`,
      })
      .toBeGreaterThan(0);

    const runEnabledWhileAnimating = await dailyPage.canRun();
    await dailyPage.pausePlayback();
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

    await dailyPage.rewind();
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
    await dailyPage.serve(DAILY_7.puzzle);
    await dailyPage.open();

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
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    const ctx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)}`;
    await dailyPage.run();
    await dailyPage.pausePlayback();

    const pausedCounter = await dailyPage.counter(ctx);
    expect(await dailyPage.roundedProgress(), `${ctx}: after Run and Pause, rounded Animation progress should be below 100 before Play`).toBeLessThan(100);
    expect(pausedCounter, `${ctx}: after Run and Pause, Comparisons counter should be below ${DAILY_12.start.count} before Play`).toBeLessThan(DAILY_12.start.count);

    await dailyPage.playPlayback();
    await expect
      .poll(() => dailyPage.counter(ctx), {
        intervals: [50],
        message: `${ctx}: after Pause, pressing Play should resume playback and raise Comparisons counter above ${pausedCounter} without Next step`,
      })
      .toBeGreaterThan(pausedCounter);
    await dailyPage.pausePlayback();

    expect(await dailyPage.roundedProgress(), `${ctx}: after Play and Pause, rounded Animation progress should remain below 100 before Skip`).toBeLessThan(100);
    expect(await dailyPage.counter(ctx), `${ctx}: after Play and Pause, Comparisons counter should remain below ${DAILY_12.start.count} before Skip`).toBeLessThan(DAILY_12.start.count);

    await dailyPage.skip(ctx);

    expect(await dailyPage.counter(ctx), `${ctx}: Skip while paused should jump Comparisons counter to ${DAILY_12.start.count}`).toBe(DAILY_12.start.count);
    await dailyPage.expectStatusNumber('Score', DAILY_12.start.count, `${ctx}: Skip while paused should show final Score ${DAILY_12.start.count}`);
  });

  test('stepping back lowers the counter', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
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

    await dailyPage.skipToEnd(ctx);
    await dailyPage.replayPlayback();
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
    await dailyPage.skipToEnd(ctx);
    await dailyPage.expectStatusNumber(
      'Tries left',
      2,
      `${ctx}: a replayed run that finishes must not use a try (Tries left should stay 2)`,
    );

    const speeds = await dailyPage.speeds();
    expect(speeds, `${ctx}: Speed combobox should offer 0.25× (got [${speeds.join(', ')}])`).toContain(0.25);
    expect(speeds, `${ctx}: Speed combobox should offer 2× (got [${speeds.join(', ')}])`).toContain(2);
    await dailyPage.setSpeed(2);
    expect(await dailyPage.speed(), `${ctx}: selecting 2× in the Speed combobox should stick (expected 2)`).toBe(2);
  });

  test('reaching the goal is announced, and the next try is still offered', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    const ctx = `${DAILY_12.name} ${fmt(DAILY_12.par.values)}`;
    await dailyPage.swap(DAILY_12.par.swap[0], DAILY_12.par.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(ctx);

    await dailyPage.expectStatusNumber(
      'Score',
      DAILY_12.par.count,
      `${ctx}: Score should be ${DAILY_12.par.count} (goal ${DAILY_12.puzzle.par})`,
    );
    expect(await dailyPage.goalReached(), `${ctx}: "Goal reached" status should be visible`).toBe(true);
    expect(await dailyPage.bestReached(), `${ctx}: "Best reached" status should stay hidden below best`).toBe(false);
    expect(await dailyPage.bestVisible(), `${ctx}: Best status should stay hidden while tries remain`).toBe(false);
    await dailyPage.expectStatusNumber(
      'Tries left',
      2,
      `${ctx}: 2 tries should remain after reaching the goal on try 1`,
    );
    expect(await dailyPage.canRun(), `${ctx}: Run button should remain enabled for the next try`).toBe(true);
    expect(await dailyPage.values(), `${ctx}: Puzzle array should stay as the player left it`).toEqual([...DAILY_12.par.values]);
  });

  test('reaching the best is announced, and the puzzle ends early', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    const ctx = `${DAILY_12.name} ${fmt(DAILY_12.bestFromStart.values)}`;
    await dailyPage.swap(DAILY_12.bestFromStart.swap[0], DAILY_12.bestFromStart.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(ctx);

    await dailyPage.expectStatusNumber(
      'Score',
      DAILY_12.bestFromStart.count,
      `${ctx}: Score should be ${DAILY_12.bestFromStart.count} (best)`,
    );
    expect(await dailyPage.bestReached(), `${ctx}: "Best reached" status should be visible`).toBe(true);
    expect(await dailyPage.best(ctx), `${ctx}: Best status should reveal ${DAILY_12.puzzle.best}`).toBe(DAILY_12.puzzle.best);
    expect(await dailyPage.canRun(), `${ctx}: Run button should be disabled or hidden after reaching best`).toBe(false);
    expect(await dailyPage.canShare(), `${ctx}: Share button should be available once the puzzle ends`).toBe(true);

    const expectedShare = [
      'structs.sh daily #12 · Quicksort',
      `${DAILY_12.puzzle.best} / ${DAILY_12.puzzle.best} 🏆`,
      'structs.sh/daily',
    ].join('\n');
    expect(
      (await dailyPage.shareText()).trim(),
      `${ctx}: Share text after reaching best on try 1 should match exact 1-row format (${DAILY_12.puzzle.best} / ${DAILY_12.puzzle.best} 🏆)`,
    ).toBe(expectedShare);
  });

  test('after three tries, the puzzle ends with the highest score and reveals the best', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    const try1Ctx = `${DAILY_12.name} try 1 ${fmt(DAILY_12.par.values)}`;
    const try2Ctx = `${DAILY_12.name} try 2 ${fmt(DAILY_12.lowFromPar.values)}`;
    const try3Ctx = `${DAILY_12.name} try 3 ${fmt(DAILY_12.thirdFromLow.values)}`;
    const endCtx = `${DAILY_12.name} after tries [${DAILY_12.par.count}, ${DAILY_12.lowFromPar.count}, ${DAILY_12.thirdFromLow.count}]`;

    await dailyPage.expectStatusNumber('Tries left', 3, `${DAILY_12.name} ${fmt(DAILY_12.start.values)}: new puzzle should start with 3 tries left`);

    // Try 1: 34 (reaches goal, below best; highest of the three tries)
    await dailyPage.swap(DAILY_12.par.swap[0], DAILY_12.par.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(try1Ctx);
    await dailyPage.expectStatusNumber('Score', DAILY_12.par.count, `${try1Ctx}: Score should be ${DAILY_12.par.count}`);
    await dailyPage.expectStatusNumber('Tries left', 2, `${try1Ctx}: Tries left should be 2`);
    expect(await dailyPage.values(), `${try1Ctx}: Puzzle array should stay at ${fmt(DAILY_12.par.values)}`).toEqual([...DAILY_12.par.values]);

    // Try 2: 25 (lower than try 1; Score must show the last run while tries remain)
    await dailyPage.swap(DAILY_12.lowFromPar.swap[0], DAILY_12.lowFromPar.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(try2Ctx);
    await dailyPage.expectStatusNumber(
      'Score',
      DAILY_12.lowFromPar.count,
      `${try2Ctx}: while tries remain, Score must show the last run (${DAILY_12.lowFromPar.count}), not the highest (${DAILY_12.par.count})`,
    );
    await dailyPage.expectStatusNumber('Tries left', 1, `${try2Ctx}: Tries left should be 1`);

    // Try 3: 31 (below goal and below try 1)
    await dailyPage.swap(DAILY_12.thirdFromLow.swap[0], DAILY_12.thirdFromLow.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(try3Ctx);

    expect(await dailyPage.counter(try3Ctx), `${try3Ctx}: Comparisons counter should be ${DAILY_12.thirdFromLow.count}`).toBe(DAILY_12.thirdFromLow.count);
    await dailyPage.expectStatusNumber('Tries left', 0, `${try3Ctx}: Tries left should be 0`);
    await dailyPage.expectStatusNumber('Score', DAILY_12.par.count, `${endCtx}: final Score should be the highest try (${DAILY_12.par.count})`);
    expect(await dailyPage.best(endCtx), `${endCtx}: Best status should reveal ${DAILY_12.puzzle.best}`).toBe(DAILY_12.puzzle.best);
    expect(await dailyPage.canRun(), `${endCtx}: Run button should be disabled or hidden`).toBe(false);
    expect(await dailyPage.canShare(), `${endCtx}: Share button should be visible and enabled once the puzzle ends below best`).toBe(true);

    const expectedShare = [
      'structs.sh daily #12 · Quicksort',
      `${DAILY_12.par.count} / ${DAILY_12.puzzle.best} ⭐`,
      `${DAILY_12.lowFromPar.count} / ${DAILY_12.puzzle.best}`,
      `${DAILY_12.thirdFromLow.count} / ${DAILY_12.puzzle.best}`,
      'structs.sh/daily',
    ].join('\n');
    expect(
      (await dailyPage.shareText()).trim(),
      `${endCtx}: Share text after finishing below best should match exact 3-row format (⭐ on goal try ${DAILY_12.par.count} / ${DAILY_12.puzzle.best}, no 🏆)`,
    ).toBe(expectedShare);
  });

  test('the share text has one line per try with ⭐ and 🏆 marks, and does not include the arrangement', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    // Try 1: 30 / 36 (below goal), Try 2: 34 / 36 ⭐ (goal), Try 3: 36 / 36 🏆 (best)
    await dailyPage.run();
    await dailyPage.skip(`${DAILY_12.name} try 1 ${fmt(DAILY_12.start.values)}`);
    await dailyPage.swap(DAILY_12.par.swap[0], DAILY_12.par.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(`${DAILY_12.name} try 2 ${fmt(DAILY_12.par.values)}`);
    await dailyPage.swap(DAILY_12.bestFromPar.swap[0], DAILY_12.bestFromPar.swap[1]);
    await dailyPage.run();
    await dailyPage.skip(`${DAILY_12.name} try 3 ${fmt(DAILY_12.bestFromPar.values)}`);

    const expectedShare = [
      'structs.sh daily #12 · Quicksort',
      `${DAILY_12.start.count} / ${DAILY_12.puzzle.best}`,
      `${DAILY_12.par.count} / ${DAILY_12.puzzle.best} ⭐`,
      `${DAILY_12.bestFromPar.count} / ${DAILY_12.puzzle.best} 🏆`,
      'structs.sh/daily',
    ].join('\n');

    expect(
      (await dailyPage.shareText()).trim(),
      `${DAILY_12.name} tries [${DAILY_12.start.count}, ${DAILY_12.par.count}, ${DAILY_12.bestFromPar.count}]: Share text should match exact format (one line per try with ⭐ and 🏆 marks, omitting the arrangement)`,
    ).toBe(expectedShare);
  });
});
