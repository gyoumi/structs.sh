import { expect, type Locator, type Page } from '@playwright/test';

/** What the test-only clock control answers: the server's instant and its Sydney date. */
export type ClockReading = { now: string; sydneyDate: string };

/** What GET /api/daily answered, unparsed beyond JSON, so a leaked key shows up in the failure message. */
export type DailyReply = { status: number; cacheControl: string | undefined; body: Record<string, unknown> };

/**
 * Drives /daily against the live stack: the real daily-server, Postgres seeded by
 * `daily_db::seed`, and the server's test-only clock control. Nothing is mocked:
 * GET /api/daily goes to the real server, and the day is moved with PUT on E2E_CLOCK_URL.
 *
 * E2E_CLOCK_URL is the full URL of the clock endpoint, for example http://127.0.0.1:8081/clock.
 */
export class DailyStackPage {
  constructor(readonly page: Page) {}

  /** Moves the server's clock to `rfc3339` and returns what the clock control reports. */
  async setClock(rfc3339: string): Promise<ClockReading> {
    const url = clockUrl();
    const response = await this.page.request.put(url, { data: { now: rfc3339 } });
    const text = await response.text();
    expect(response.status(), `PUT ${url} {"now":"${rfc3339}"} should answer 200 OK, got ${response.status()} with body ${text}`).toBe(200);
    const body = JSON.parse(text) as Partial<ClockReading>;
    expect(typeof body.now, `PUT ${url} {"now":"${rfc3339}"} should answer a string "now", got ${text}`).toBe('string');
    expect(typeof body.sydneyDate, `PUT ${url} {"now":"${rfc3339}"} should answer a string "sydneyDate", got ${text}`).toBe('string');
    return { now: body.now as string, sydneyDate: body.sydneyDate as string };
  }

  /** GET /api/daily straight from the live stack, with its status, Cache-Control header and JSON body. */
  async fetchDailyRaw(): Promise<DailyReply> {
    const response = await this.page.request.get('/api/daily');
    const text = await response.text();
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error(`GET /api/daily answered ${response.status()} with a body that is not JSON: ${text}`);
    }
    return { status: response.status(), cacheControl: response.headers()['cache-control'], body };
  }

  /** Opens /daily and waits for Challenge rules, which every template shows (the linked list has no Challenge array). */
  async openDaily(context: string): Promise<void> {
    await this.page.goto('/daily');
    await expect(this.rules, `${context}: /daily should load today's challenge from the server and show a Challenge rules region`).toBeVisible();
  }

  /** Reloads /daily and waits for Challenge rules again. */
  async reloadDaily(context: string): Promise<void> {
    await this.page.reload();
    await expect(this.rules, `${context}: after reloading /daily, the Challenge rules region should be shown again`).toBeVisible();
  }

  /** Challenge rules is visible and its text matches `pattern`. */
  async expectRulesContain(pattern: RegExp, context: string): Promise<void> {
    await expect(this.rules, `${context}: /daily should show a Challenge rules region`).toBeVisible();
    await expect(this.rules, `${context}: Challenge rules should describe today's template (text matching ${pattern})`).toContainText(pattern);
  }

  /**
   * Clicks `Try again` and waits for the page's next GET /api/daily to be answered 200 by the live server.
   * (`DailyHistoryPage.tryAgain` counts only requests it mocks, so it can't see a live request.)
   */
  async tryAgain(context: string): Promise<void> {
    const answered = this.page.waitForResponse((response) => new URL(response.url()).pathname === '/api/daily');
    const button = this.page.getByRole('button', { name: 'Try again', exact: true });
    await expect(button, `${context}: a "Try again" button should be visible`).toBeVisible();
    await button.click();
    const response = await answered;
    expect(response.status(), `${context}: Try again should fetch GET /api/daily from the live server and get 200, got ${response.status()}`).toBe(200);
  }

  private get rules(): Locator {
    return this.page.getByRole('region', { name: 'Challenge rules' });
  }
}

function clockUrl(): string {
  const url = process.env.E2E_CLOCK_URL;
  if (!url) {
    throw new Error(
      'E2E_CLOCK_URL is not set. The live-stack tests need the full URL of the server\'s test-only clock control (for example http://127.0.0.1:8081/clock), served when daily-server runs with DAILY_TEST_CLOCK_BIND and DAILY_NOW.',
    );
  }
  return url;
}
