import { expect, type Locator, type Page } from '@playwright/test';
import { topicTitles, type TopicSlug } from './topics';

/**
 * Drives the landing page, the 404 page and the feedback form.
 *
 * Like visualiser-page.ts, this is the only place that knows their markup.
 */
export class LandingPage {
  constructor(readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/');
    await expect(this.page.getByText(/interactive learning platform/)).toBeVisible();
  }

  async openTopic(topic: TopicSlug): Promise<void> {
    await this.page.getByRole('radio', { name: topicTitles[topic] }).click();
    await this.page.getByRole('link', { name: `Open ${topicTitles[topic]}` }).click();
  }

  async openDebugger(): Promise<void> {
    await this.page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Debugger' }).click();
  }

  /** Clicks the `Daily puzzle` link in the landing page's Main navigation. */
  async openDailyFromNav(): Promise<void> {
    const link = this.page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Daily puzzle' });
    await expect(
      link,
      'Landing page <nav aria-label="Main"> should contain a link named "Daily puzzle" (to /daily) beside Visualiser, Debugger and GitHub',
    ).toBeVisible();
    await link.click();
  }

  /** Clicks the "Play today's puzzle" action in the hero (the section labelled by the structs.sh heading). */
  async openDailyFromHero(): Promise<void> {
    const hero = this.page.getByRole('region', { name: 'structs.sh', exact: true });
    await expect(hero, 'Landing page should show the hero <section aria-labelledby="hero-title"> named "structs.sh"').toBeVisible();
    const link = hero.getByRole('link', { name: /play today.?s puzzle/i });
    await expect(
      link,
      'Hero actions should include a link matching /play today.?s puzzle/i (to /daily) beside "Pick a structure" and "Open the debugger"',
    ).toBeVisible();
    await link.click();
  }

  /** The landing page section that introduces the daily puzzle. */
  dailyPromoRegion(): Locator {
    return this.page.getByRole('region', { name: /daily puzzle/i });
  }

  /** Asserts the daily puzzle section is shown and says what the game is: three tries, and streaks. */
  async expectDailyPromoInfo(): Promise<void> {
    const region = this.dailyPromoRegion();
    await expect(
      region,
      'Landing page should have a <section> whose accessible name matches /daily puzzle/i (aria-label or aria-labelledby a "Daily puzzle" h2)',
    ).toBeVisible();
    await expect(
      region.getByRole('heading', { level: 2 }),
      'The Daily puzzle section should have a level-2 heading introducing the puzzle',
    ).toBeVisible();
    await expect(
      region,
      'The Daily puzzle section should say how many tries a player gets (text matching /3 tries|three tries/i)',
    ).toContainText(/3 tries|three tries/i);
    await expect(region, 'The Daily puzzle section should mention streaks (text matching /streak/i)').toContainText(
      /streak/i,
    );
  }

  /** Clicks the "Play today's puzzle" link inside the daily puzzle section. */
  async openDailyFromPromo(): Promise<void> {
    const link = this.dailyPromoRegion().getByRole('link', { name: /play today.?s puzzle/i });
    await expect(
      link,
      'The Daily puzzle section should contain a link matching /play today.?s puzzle/i (to /daily)',
    ).toBeVisible();
    await link.click();
  }

  /** Asserts the "Pick a structure" section is scrolled into view and receives keyboard focus. */
  async expectStructuresInViewport(context: string): Promise<void> {
    const heading = this.page.getByRole('heading', { level: 2, name: 'Pick a structure' });
    await expect(heading, `${context}: "Pick a structure" heading should be scrolled into the viewport`).toBeInViewport();
    await this.page.keyboard.press('Tab');
    await expect(
      this.page.getByRole('radio', { name: 'Linked Lists' }),
      `${context}: pressing Tab after jumping to /#structures should focus the first structure tile rather than the header`,
    ).toBeFocused();
  }

  /** Asserts the current document has no horizontal overflow. */
  async expectNoHorizontalOverflow(context: string): Promise<void> {
    const { scrollWidth, clientWidth } = await this.page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(
      scrollWidth,
      `${context}: page should fit without horizontal overflow (scrollWidth ${scrollWidth} > clientWidth ${clientWidth})`,
    ).toBeLessThanOrEqual(clientWidth);
  }

  /** Every external link on the page. */
  async externalLinks(): Promise<string[]> {
    const hrefs = await this.page
      .locator('a[href^="http"], a[href^="mailto:"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    return [...new Set(hrefs)];
  }

  /** The address of the feedback form that the footer's Feedback link opens. */
  async feedbackFormUrl(): Promise<string> {
    return (await this.page.getByRole('link', { name: 'Feedback' }).getAttribute('href')) ?? '';
  }

  /** Opens /feedback and returns the address of the feedback form it loads, without contacting Google. */
  async feedbackAddressTarget(): Promise<string> {
    await this.page.route(/docs\.google\.com/, (route) => route.fulfill({ contentType: 'text/html', body: '' }));
    const request = this.page.waitForRequest(/docs\.google\.com\/forms/);
    await this.page.goto('/feedback');
    return (await request).url();
  }

  /** The heading and message of the page shown for an unknown address. */
  async notFoundMessage(): Promise<string> {
    const heading = this.page.getByRole('heading', { level: 1 });
    await expect(heading).toBeVisible();
    return (await this.page.getByRole('main').innerText()).replace(/\s+/g, ' ');
  }

  async leaveNotFoundPage(): Promise<void> {
    await this.page.getByRole('main').getByRole('link', { name: /home|landing|structs\.sh/i }).first().click();
  }
}
