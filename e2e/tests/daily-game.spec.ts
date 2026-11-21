import { test, expect } from '../support/test';
import { DAILY_7, DAILY_12 } from '../support/daily-fixtures';
import type { SlotBounds } from '../support/daily-page';

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;
const fmtSlot = (slot?: SlotBounds) =>
  slot ? `slot ${slot.index} (value ${slot.value}, x=${slot.x}, x+width=${slot.x + slot.width})` : 'none';

test.describe('daily game', () => {
  test('the puzzle shows its rules, par and fixed values', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_7.puzzle);
    await dailyPage.open();

    const rules = await dailyPage.rulesText();
    expect(rules, `${DAILY_7.name}: Puzzle rules region should describe a quicksort puzzle`).toMatch(/quicksort/i);
    expect(rules, `${DAILY_7.name}: Puzzle rules region should mention comparisons`).toMatch(/comparison/i);
    expect(await dailyPage.par(), `${DAILY_7.name}: Par status should show served par ${DAILY_7.puzzle.par}`).toBe(DAILY_7.puzzle.par);
    expect(await dailyPage.values(), `${DAILY_7.name}: Puzzle array should show starting values ${fmt(DAILY_7.puzzle.values)}`).toEqual([...DAILY_7.puzzle.values]);
    expect(await dailyPage.fixedIndices(), `${DAILY_7.name}: fixed slots ${fmt(DAILY_7.puzzle.fixed)} should be disabled and all others enabled`).toEqual([...DAILY_7.puzzle.fixed]);
    expect(await dailyPage.triesLeft(), `${DAILY_7.name}: new puzzle should start with 3 tries left`).toBe(3);
    expect(await dailyPage.bestVisible(), `${DAILY_7.name}: Best status should stay hidden until puzzle end`).toBe(false);
  });

  test('tapping two free values swaps them, and fixed values cannot be selected', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    const startCtx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)}`;
    const parCtx = `${DAILY_12.name} ${fmt(DAILY_12.par.values)}`;

    await dailyPage.select(2);
    expect(await dailyPage.selectedIndices(), `${startCtx}: selecting free slot 2 (value 6) should set aria-pressed="true" only on slot 2`).toEqual([2]);

    await dailyPage.select(7);
    expect(await dailyPage.values(), `${startCtx}: tapping free slots 2 and 7 should swap 6 and 5 to ${fmt(DAILY_12.par.values)}`).toEqual([...DAILY_12.par.values]);
    expect(await dailyPage.selectedIndices(), `${parCtx}: selection should clear after swapping slots 2 and 7`).toEqual([]);
    expect(await dailyPage.fixedIndices(), `${DAILY_12.name}: fixed slots ${fmt(DAILY_12.puzzle.fixed)} should be disabled`).toEqual([...DAILY_12.puzzle.fixed]);

    await dailyPage.trySelectFixed(1);
    expect(await dailyPage.selectedIndices(), `${parCtx}: clicking fixed slot 1 (value 1) must not select it`).toEqual([]);

    await dailyPage.select(0);
    expect(await dailyPage.values(), `${parCtx}: clicking fixed slot 1 then free slot 0 must not swap them`).toEqual([...DAILY_12.par.values]);
    expect(await dailyPage.selectedIndices(), `${parCtx}: clicking free slot 0 after fixed slot 1 should select slot 0`).toEqual([0]);
  });

  test('free values can be swapped with the keyboard', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    await dailyPage.keyboardSelect(0);
    expect(await dailyPage.selectedIndices(), `${DAILY_12.name} ${fmt(DAILY_12.start.values)}: focusing free slot 0 and pressing Enter should select slot 0`).toEqual([0]);

    // Slot 1 is fixed (value 1), so ArrowRight skips slot 1 and swaps slot 0 (8) with slot 2 (6).
    const afterFirstRight = [6, 1, 8, 3, 2, 7, 4, 5];
    await dailyPage.keyboardMove('ArrowRight');
    expect(await dailyPage.values(), `${DAILY_12.name} ${fmt(DAILY_12.start.values)}: ArrowRight from slot 0 should skip fixed slot 1 and swap with slot 2 to ${fmt(afterFirstRight)}`).toEqual(afterFirstRight);
    expect(await dailyPage.selectedIndices(), `${DAILY_12.name} ${fmt(afterFirstRight)}: selection should follow the moved value to slot 2`).toEqual([2]);

    const afterSecondRight = [6, 1, 3, 8, 2, 7, 4, 5];
    await dailyPage.keyboardMove('ArrowRight');
    expect(await dailyPage.values(), `${DAILY_12.name} ${fmt(afterFirstRight)}: ArrowRight from slot 2 should swap with adjacent free slot 3 to ${fmt(afterSecondRight)}`).toEqual(afterSecondRight);

    await dailyPage.keyboardMove('ArrowLeft');
    expect(await dailyPage.values(), `${DAILY_12.name} ${fmt(afterSecondRight)}: ArrowLeft from slot 3 should swap back with slot 2 to ${fmt(afterFirstRight)}`).toEqual(afterFirstRight);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('swapping works on a phone-sized screen', async ({ dailyPage }) => {
      await dailyPage.serve(DAILY_12.puzzle);
      await dailyPage.open();

      const viewportWidth = 390;
      const bounds = await dailyPage.slotBounds();
      expect(
        bounds,
        `${DAILY_12.name} at 390x844 touch: Puzzle array should render all ${DAILY_12.puzzle.values.length} slots`,
      ).toHaveLength(DAILY_12.puzzle.values.length);

      const firstOverflow = bounds.find((slot) => slot.x < 0 || slot.x + slot.width > viewportWidth);
      expect(
        firstOverflow,
        `${DAILY_12.name} at 390x844 touch: every slot button in Puzzle array must lie within 0..${viewportWidth}px; first slot that does not fit: ${fmtSlot(firstOverflow)}`,
      ).toBeUndefined();

      await dailyPage.tapSwap(2, 7);
      expect(await dailyPage.values(), `${DAILY_12.name} ${fmt(DAILY_12.start.values)} at 390x844 touch: tapping free slots 2 and 7 should swap 6 and 5 to ${fmt(DAILY_12.par.values)}`).toEqual([...DAILY_12.par.values]);
      expect(await dailyPage.fixedIndices(), `${DAILY_12.name} at 390x844 touch: fixed slots ${fmt(DAILY_12.puzzle.fixed)} should remain disabled`).toEqual([...DAILY_12.puzzle.fixed]);

      await dailyPage.tryTapFixed(1);
      expect(
        await dailyPage.selectedIndices(),
        `${DAILY_12.name} ${fmt(DAILY_12.par.values)} at 390x844 touch: tapping fixed slot 1 (value 1) must not select it`,
      ).toEqual([]);
    });
  });

  test('Run animates the sort, and the counter goes up with each comparison', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    const ctx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)}`;
    const initialCounter = await dailyPage.counter();
    expect(
      initialCounter,
      `${ctx} step 0 (counter ${initialCounter} -> expected 0): Comparisons counter should start at 0 before Run`,
    ).toBe(0);

    await dailyPage.run();
    await expect
      .poll(() => dailyPage.counter(), {
        intervals: [50],
        message: `${ctx} step 0 (before stepping, started at ${initialCounter}): Run should animate by itself and raise Comparisons counter above 0 without pressing Next step`,
      })
      .toBeGreaterThan(0);

    await dailyPage.pausePlayback();
    await dailyPage.rewind();
    await expect
      .poll(() => dailyPage.counter(), {
        intervals: [50],
        message: `${ctx} step 0 (after Pause and Back to the start): Comparisons counter should reset to 0`,
      })
      .toBe(0);

    const maxSteps = 250;
    const result = await dailyPage.stepToEnd(maxSteps, ({ step, before, after }) => {
      const delta = after - before;
      expect(
        delta,
        `${ctx} step ${step}: Comparisons counter went from ${before} to ${after} (delta ${delta}); must never go down`,
      ).toBeGreaterThanOrEqual(0);
      expect(
        delta,
        `${ctx} step ${step}: Comparisons counter went from ${before} to ${after} (delta ${delta}); must go up by at most 1 per step`,
      ).toBeLessThanOrEqual(1);
    });

    expect(
      result.atEnd,
      `${ctx} step ${result.steps}: timeline did not reach the end within ${maxSteps} Next step clicks (counter went from 0 to ${result.counter})`,
    ).toBe(true);
    expect(
      result.counter,
      `${ctx} step ${result.steps}: Comparisons counter at end of timeline went from 0 to ${result.counter}, expected hand-worked count ${DAILY_12.start.count}`,
    ).toBe(DAILY_12.start.count);
  });

  test('the final count matches the score shown, and both match the hand-worked count', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_7.puzzle);
    await dailyPage.open();

    await dailyPage.run();
    await dailyPage.waitForRunToFinish();

    const ctx = `${DAILY_7.name} ${fmt(DAILY_7.start.values)}`;
    const finalCount = await dailyPage.counter();
    const shownScore = await dailyPage.score();
    expect(finalCount, `${ctx}: final Comparisons counter should match hand-worked count ${DAILY_7.start.count}`).toBe(DAILY_7.start.count);
    expect(shownScore, `${ctx}: Score status should match hand-worked count ${DAILY_7.start.count}`).toBe(DAILY_7.start.count);
    expect(shownScore, `${ctx}: Score status should equal final Comparisons counter`).toBe(finalCount);
  });

  test('Skip jumps straight to the final count', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    await dailyPage.run();
    await dailyPage.skip();

    const ctx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)}`;
    expect(await dailyPage.counter(), `${ctx}: Skip should jump Comparisons counter to ${DAILY_12.start.count}`).toBe(DAILY_12.start.count);
    expect(await dailyPage.score(), `${ctx}: Skip should show final Score ${DAILY_12.start.count}`).toBe(DAILY_12.start.count);
  });

  test('stepping back lowers the counter', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    await dailyPage.run();
    await dailyPage.skip();

    const ctx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)}`;
    const atEnd = await dailyPage.counter();
    expect(atEnd, `${ctx}: setup after Skip should show Comparisons counter ${DAILY_12.start.count}`).toBe(DAILY_12.start.count);

    const stepped = await dailyPage.stepBackUntilCounterDrops(atEnd);
    expect(stepped.progress, `${ctx}: Previous step (${stepped.steps} click(s)) should move Animation progress below 100`).toBeLessThan(100);
    expect(stepped.counter, `${ctx}: Previous step (${stepped.steps} click(s)) from ${atEnd} should lower Comparisons counter below ${atEnd}`).toBeLessThan(atEnd);
    expect(stepped.counter, `${ctx}: Comparisons counter after stepping back should stay >= 0`).toBeGreaterThanOrEqual(0);
  });

  test('reaching par is announced, and the next try is still offered', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    await dailyPage.swap(DAILY_12.par.swap[0], DAILY_12.par.swap[1]);
    await dailyPage.run();
    await dailyPage.skip();

    const ctx = `${DAILY_12.name} ${fmt(DAILY_12.par.values)}`;
    expect(await dailyPage.score(), `${ctx}: Score should be ${DAILY_12.par.count} (par ${DAILY_12.puzzle.par})`).toBe(DAILY_12.par.count);
    expect(await dailyPage.parReached(), `${ctx}: "Par reached" status should be visible`).toBe(true);
    expect(await dailyPage.bestReached(), `${ctx}: "Best reached" status should stay hidden below best`).toBe(false);
    expect(await dailyPage.bestVisible(), `${ctx}: Best status should stay hidden while tries remain`).toBe(false);
    expect(await dailyPage.triesLeft(), `${ctx}: 2 tries should remain after reaching par on try 1`).toBe(2);
    expect(await dailyPage.canRun(), `${ctx}: Run button should remain enabled for the next try`).toBe(true);
    expect(await dailyPage.values(), `${ctx}: Puzzle array should stay as the player left it`).toEqual([...DAILY_12.par.values]);
  });

  test('reaching the best is announced, and the puzzle ends early', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    await dailyPage.swap(DAILY_12.bestFromStart.swap[0], DAILY_12.bestFromStart.swap[1]);
    await dailyPage.run();
    await dailyPage.skip();

    const ctx = `${DAILY_12.name} ${fmt(DAILY_12.bestFromStart.values)}`;
    expect(await dailyPage.score(), `${ctx}: Score should be ${DAILY_12.bestFromStart.count} (best)`).toBe(DAILY_12.bestFromStart.count);
    expect(await dailyPage.bestReached(), `${ctx}: "Best reached" status should be visible`).toBe(true);
    expect(await dailyPage.best(), `${ctx}: Best status should reveal ${DAILY_12.puzzle.best}`).toBe(DAILY_12.puzzle.best);
    expect(await dailyPage.canRun(), `${ctx}: Run button should be disabled or hidden after reaching best`).toBe(false);
    expect(await dailyPage.canShare(), `${ctx}: Share button should be available once the puzzle ends`).toBe(true);
  });

  test('after three tries, the puzzle ends with the highest score and reveals the best', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    // Try 1: 35 (below par)
    await dailyPage.run();
    await dailyPage.skip();
    expect(await dailyPage.score(), `${DAILY_12.name} try 1 ${fmt(DAILY_12.start.values)}: Score should be 35`).toBe(DAILY_12.start.count);
    expect(await dailyPage.triesLeft(), `${DAILY_12.name} after try 1: Tries left should be 2`).toBe(2);
    expect(await dailyPage.values(), `${DAILY_12.name} after try 1: Puzzle array should stay at ${fmt(DAILY_12.start.values)}`).toEqual([...DAILY_12.start.values]);

    // Try 2: 39 (reaches par, below best; highest of the three tries)
    await dailyPage.swap(DAILY_12.par.swap[0], DAILY_12.par.swap[1]);
    await dailyPage.run();
    await dailyPage.skip();
    expect(await dailyPage.score(), `${DAILY_12.name} try 2 ${fmt(DAILY_12.par.values)}: Score should be 39`).toBe(DAILY_12.par.count);
    expect(await dailyPage.triesLeft(), `${DAILY_12.name} after try 2: Tries left should be 1`).toBe(1);

    // Try 3: 29 (lower than tries 1 and 2)
    await dailyPage.swap(DAILY_12.lowFromPar.swap[0], DAILY_12.lowFromPar.swap[1]);
    await dailyPage.run();
    await dailyPage.skip();

    expect(await dailyPage.counter(), `${DAILY_12.name} try 3 ${fmt(DAILY_12.lowFromPar.values)}: Comparisons counter should be 29`).toBe(DAILY_12.lowFromPar.count);
    expect(await dailyPage.score(), `${DAILY_12.name} after tries [35, 39, 29]: final Score should be the highest try (39)`).toBe(DAILY_12.par.count);
    expect(await dailyPage.best(), `${DAILY_12.name} after 3 tries: Best status should reveal 42`).toBe(DAILY_12.puzzle.best);
    expect(await dailyPage.triesLeft(), `${DAILY_12.name} after 3 tries: Tries left should be 0`).toBe(0);
    expect(await dailyPage.canRun(), `${DAILY_12.name} after 3 tries: Run button should be disabled or hidden`).toBe(false);
  });

  test('the share text has one line per try with ⭐ and 🏆 marks, and does not include the arrangement', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    // Try 1: 35 / 42 (below par), Try 2: 39 / 42 ⭐ (par), Try 3: 42 / 42 🏆 (best)
    await dailyPage.run();
    await dailyPage.skip();
    await dailyPage.swap(DAILY_12.par.swap[0], DAILY_12.par.swap[1]);
    await dailyPage.run();
    await dailyPage.skip();
    await dailyPage.swap(DAILY_12.bestFromPar.swap[0], DAILY_12.bestFromPar.swap[1]);
    await dailyPage.run();
    await dailyPage.skip();

    const expectedShare = [
      'structs.sh daily #12 · Quicksort',
      `${DAILY_12.start.count} / ${DAILY_12.puzzle.best}`,
      `${DAILY_12.par.count} / ${DAILY_12.puzzle.best} ⭐`,
      `${DAILY_12.bestFromPar.count} / ${DAILY_12.puzzle.best} 🏆`,
      'structs.sh/daily',
    ].join('\n');

    expect(
      (await dailyPage.shareText()).trim(),
      `${DAILY_12.name} tries [35, 39, 42]: Share text should match exact format (one line per try with ⭐ and 🏆 marks, omitting the arrangement)`,
    ).toBe(expectedShare);
  });
});
