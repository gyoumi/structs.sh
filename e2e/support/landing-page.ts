import { expect, type Page } from '@playwright/test';
import { topicTitles, type TopicSlug } from './visualiser-page';

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
    await this.page.getByRole('button', { name: topicTitles[topic], exact: true }).click();
  }

  async openDebugger(): Promise<void> {
    await this.page.getByRole('link', { name: 'Debugger', exact: true }).first().click();
  }

  /** Every external link on the page. */
  async externalLinks(): Promise<string[]> {
    const hrefs = await this.page
      .locator('a[href^="http"], a[href^="mailto:"]')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    return [...new Set(hrefs)];
  }

  /** Follows the feedback link and returns the address of the feedback form. */
  async feedbackFormUrl(): Promise<string> {
    await this.page.getByRole('link', { name: /feedback/i }).click();
    const form = this.page.getByTitle('Structs.sh feedback form');
    await expect(form).toBeAttached();
    return (await form.getAttribute('src')) ?? '';
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
    const message = this.page.getByText(/Couldn.t find a page/);
    await expect(message).toBeVisible();
    return (await this.page.locator('body').innerText()).replace(/\s+/g, ' ');
  }

  async leaveNotFoundPage(): Promise<void> {
    await this.page.getByRole('link', { name: /Structs\.sh/ }).click();
  }
}
