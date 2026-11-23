import { test, expect } from '../support/test';
import { DAILY_7, DAILY_12 } from '../support/daily-fixtures';

// Rules, swapping, keyboard and layout checks. Running a try (playback,
// stepping, scoring, tries and the share text) is in daily-game-run.spec.ts.

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;
const RULES_SENTENCE = 'Swap the numbers to make as many comparisons as possible.';

test.describe('daily game', () => {
  test('the puzzle shows its rules, goal and fixed values', async ({ dailyPage }) => {
    const servedPuzzle = { ...DAILY_7.puzzle, par: 35 };
    await dailyPage.serve(servedPuzzle);
    await dailyPage.open();

    const startCtx = `DAILY_7 (#7, served goal ${servedPuzzle.par}, formula goal ${DAILY_7.puzzle.par}, no best field) ${fmt(DAILY_7.start.values)}`;
    await dailyPage.expectRulesToContain(RULES_SENTENCE, startCtx);
    await dailyPage.expectRulesToExplainPivot(startCtx);
    await dailyPage.expectRulesWithoutHandHolding(startCtx);
    await dailyPage.expectKeyboardControlsCollapsed(startCtx);
    await dailyPage.expectNoStaticPivotLabel(startCtx);
    expect(
      await dailyPage.goal(startCtx),
      `${startCtx}: Goal status must show the served goal ${servedPuzzle.par} rather than work out the formula goal ${DAILY_7.puzzle.par}`,
    ).toBe(servedPuzzle.par);
    expect(await dailyPage.values(), `${startCtx}: Puzzle array should show starting values ${fmt(DAILY_7.puzzle.values)}`).toEqual([...DAILY_7.puzzle.values]);
    expect(await dailyPage.fixedIndices(), `${startCtx}: fixed slots ${fmt(DAILY_7.puzzle.fixed)} should be disabled and all others enabled`).toEqual([...DAILY_7.puzzle.fixed]);
    await dailyPage.expectNoBestShown(`${startCtx} before any try`);
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

    test('Run scrolls the drawing and its playback controls into view on a phone', async ({ dailyPage }) => {
      await dailyPage.serve(DAILY_12.puzzle);
      await dailyPage.open();

      const ctx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)} at 390x844 touch`;
      await dailyPage.run();
      await dailyPage.expectVisualiserInViewport(`${ctx} after tapping Run`);
      await expect
        .poll(() => dailyPage.counter(ctx), {
          intervals: [50],
          message: `${ctx}: after tapping Run, the sort should animate and raise Comparisons counter above 0`,
        })
        .toBeGreaterThan(0);

      // Even on mobile where the Step card is visually hidden, assistive tech can still read the live comparison.
      await dailyPage.pausePlayback();
      await dailyPage.rewind();
      await dailyPage.expectAccessibleStepComparison(ctx);
    });

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

  test('starting Run from the keyboard moves focus to Skip', async ({ dailyPage }) => {
    await dailyPage.serve(DAILY_12.puzzle);
    await dailyPage.open();

    const ctx = `${DAILY_12.name} ${fmt(DAILY_12.start.values)}`;
    await dailyPage.focusButton('Run');
    await dailyPage.pressKey('Enter');
    await dailyPage.expectButtonFocused(
      'Skip',
      `${ctx}: after focusing Run and pressing Enter, focus must move to Skip (not drop to the page body or jump past Skip to the visualiser)`,
    );
    await dailyPage.pressKey('Enter');
    await dailyPage.expectProgressAtEnd(`${ctx}: pressing Enter on the focused Skip button`);
    expect(await dailyPage.counter(ctx), `${ctx}: Enter on Skip should jump Comparisons counter to ${DAILY_12.start.count}`).toBe(DAILY_12.start.count);
  });
});
