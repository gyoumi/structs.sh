import { test, expect } from '../support/test';

test.describe('bringing the drawing into view', () => {
  test.beforeEach(async ({ visualiser }) => {
    await visualiser.open('linked-lists', [10, 20, 30]);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('running an operation scrolls the drawing into view', async ({ visualiser }) => {
      await visualiser.prepareRun('append', 40);
      const before = await visualiser.drawingInView();
      expect(
        before,
        `Setup: at 390x844 with the Run append button scrolled to the middle of the screen, most of the drawing should be off screen, but ${Math.round(before * 100)}% of its height is visible, so this test can't tell whether Run scrolls`,
      ).toBeLessThan(0.9);

      await visualiser.pressRun();
      await expect
        .poll(() => visualiser.drawingInView(), {
          message: `At 390x844, after scrolling down to the Run append button (drawing ${Math.round(before * 100)}% on screen) and pressing it on the list 10 20 30, the page should scroll so the drawing is in view. Expected at least 0.9 of the drawing's height on screen; received the fraction on screen`,
        })
        .toBeGreaterThanOrEqual(0.9);
    });

    test('a refused operation does not scroll, so its error stays in view', async ({ visualiser }) => {
      await visualiser.prepareRun('insert', 5, 9);
      const before = await visualiser.scrollY();
      await visualiser.pressRun();
      await expect.poll(() => visualiser.operationError('insert')).toBe('Index needs to be between 0 and 3.');

      expect(
        await visualiser.scrollAwayFrom(before),
        `At 390x844, pressing Run insert at index with Value 5 and Index 9 on the list 10 20 30 is refused, so the page should not scroll. Expected window.scrollY to stay at ${before}; received the scroll position furthest from it in the second after pressing Run`,
      ).toBe(before);
      expect(
        await visualiser.errorInView(),
        'At 390x844, after a refused Insert at index, the error "Index needs to be between 0 and 3." should be fully on screen. Expected 1 (all of its height); received the fraction on screen',
      ).toBe(1);
    });
  });

  test.describe('on a desktop', () => {
    test('running an operation does not scroll the page', async ({ visualiser }) => {
      await visualiser.prepareRun('append', 40);
      const before = await visualiser.scrollY();
      await visualiser.pressRun();

      expect(
        await visualiser.scrollAwayFrom(before),
        `At the desktop size, pressing Run append on the list 10 20 30 should not scroll the page. Expected window.scrollY to stay at ${before}; received the scroll position furthest from it in the second after pressing Run`,
      ).toBe(before);
    });
  });
});
