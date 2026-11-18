import { test, expect } from '../support/test';

test.describe('not found page', () => {
  test('says which address was not found', async ({ landingPage, page }) => {
    await page.goto('/no-such-page');
    const message = await landingPage.notFoundMessage();
    expect(message).toContain('404');
    expect(message).toContain('/no-such-page');
  });

  test('leads back to the landing page', async ({ landingPage, page }) => {
    await page.goto('/no-such-page');
    await landingPage.notFoundMessage();
    await landingPage.leaveNotFoundPage();
    await expect(page).toHaveURL(/\/$/);
  });
});
