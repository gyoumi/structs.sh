import { expect, type Locator, type Page, type Route } from '@playwright/test';
import type { DailyChallenge } from './daily-fixtures';

export const HISTORY_STORAGE_KEY = 'daily.history';

/** A served challenge with the calendar day it is for. */
export type DatedChallenge = DailyChallenge & { date: string };

/** One saved day as read back from localStorage, loosely typed so a wrong shape shows up in the failure message. */
type StoredResult = {
  date?: unknown;
  completed?: unknown;
  tries?: { input?: unknown; score?: unknown }[];
};

export type StoredHistory = { version?: unknown; results?: Record<string, StoredResult> };

const UNREACHABLE = /can['’]?t reach.*server|server.*unreachable/i;
const NOT_READY = /not ready|isn['’]?t ready|no challenge/i;

/**
 * Drives what /daily remembers between visits and what it shows when the challenge can't load:
 * - the GET /api/daily answer (a challenge, an HTTP error, or a network failure) and reloads;
 * - the saved history in localStorage: seeding it, reading it back, making writes fail, and the
 *   notices for a failed save or for tries synced from another tab;
 * - the `Streak` readout, and the alerts for an unreachable or unready server.
 * Playing a try is in `DailyPage`; try chips and `Goal reached` are in `DailyTemplatePage`.
 */
export class DailyHistoryPage {
  private requests = 0;

  constructor(readonly page: Page) {}

  /** How many times the page has asked GET /api/daily since the first `serveOnly`, `failWith` or `abort`. */
  get dailyRequests(): number {
    return this.requests;
  }

  /** Replaces any earlier /api/daily route so the next GET /api/daily is answered with `challenge`. */
  async serveOnly(challenge: DatedChallenge | DailyChallenge): Promise<void> {
    await this.answer((route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(challenge) }),
    );
  }

  /** Replaces any earlier /api/daily route so GET /api/daily answers with `status` and no challenge. */
  async failWith(status: number): Promise<void> {
    await this.answer((route) => route.fulfill({ status, contentType: 'text/plain', body: `HTTP ${status}` }));
  }

  /** Replaces any earlier /api/daily route so GET /api/daily fails at the network layer. */
  async abort(): Promise<void> {
    await this.answer((route) => route.abort('failed'));
  }

  /** Opens /daily without waiting for a challenge, for the error states. */
  async goto(): Promise<void> {
    await this.page.goto('/daily');
  }

  /** Reloads /daily and waits for the restored challenge array. */
  async reload(context: string): Promise<void> {
    await this.page.reload();
    await expect(this.arrayGroup, `${context}: after reloading /daily the Challenge array should be shown again`).toBeVisible();
  }

  /** Every slot in Challenge array is disabled, so a finished challenge can't be edited. */
  async expectArrayFrozen(count: number, context: string): Promise<void> {
    const slots = this.arrayGroup.getByRole('button');
    await expect(slots, `${context}: Challenge array should show ${count} slots`).toHaveCount(count);
    const enabled: number[] = [];
    for (let i = 0; i < count; i += 1) {
      if (await slots.nth(i).isEnabled()) enabled.push(i);
    }
    expect(enabled, `${context}: a finished challenge must lock every slot, but slots ${JSON.stringify(enabled)} are still enabled`).toEqual([]);
  }

  /** The `Streak` readout shows `days` and "day"/"days" (`null`: the readout is hidden). */
  async expectStreak(days: number | null, context: string): Promise<void> {
    if (days === null) {
      await expect(this.streak, `${context}: the "Streak" status must be hidden when the current streak is 0`).toBeHidden();
      return;
    }
    const unit = days === 1 ? 'day' : 'days';
    await expect(this.streak, `${context}: a "Streak" status should be visible for a ${days}-${unit} streak`).toBeVisible();
    await expect(
      this.streak,
      `${context}: the "Streak" status should read "${days} ${unit}" (for example "${days} ${unit} 🔥")`,
    ).toHaveText(new RegExp(`(?<!\\d)${days}\\s*${unit}(?!\\w)`));
  }

  /** The history saved under `daily.history`, or null when nothing is saved. */
  async savedHistory(): Promise<{ raw: string | null; parsed: StoredHistory | null }> {
    const raw = await this.page.evaluate((key) => window.localStorage.getItem(key), HISTORY_STORAGE_KEY);
    if (raw === null) return { raw, parsed: null };
    return { raw, parsed: JSON.parse(raw) as StoredHistory };
  }

  /** Writes a single saved arrangement try directly to localStorage, simulating another tab saving first. */
  async seedSavedTry(challenge: DatedChallenge, values: readonly number[], score: number): Promise<void> {
    await this.page.evaluate(
      ({ key, savedChallenge, arrangement, savedScore }) => {
        window.localStorage.setItem(
          key,
          JSON.stringify({
            version: 1,
            results: {
              [savedChallenge.date]: {
                date: savedChallenge.date,
                number: savedChallenge.number,
                template: savedChallenge.template,
                goal: savedChallenge.goal,
                tries: [{ input: { kind: 'arrangement', arrangement }, score: savedScore }],
                completed: false,
                bestScore: savedScore,
                goalReached: savedScore >= savedChallenge.goal,
              },
            },
          }),
        );
      },
      { key: HISTORY_STORAGE_KEY, savedChallenge: challenge, arrangement: [...values], savedScore: score },
    );
  }

  /** The notice shown when the tab reconciled with progress saved by another tab. */
  async expectSyncedNotice(context: string): Promise<void> {
    await expect(
      this.page.getByText('Updated from another tab.'),
      `${context}: should show the cross-tab reconciliation notice`,
    ).toBeVisible();
  }

  /** Makes subsequent localStorage.setItem calls in this tab throw QuotaExceededError. */
  async failStorageWrites(): Promise<void> {
    await this.page.evaluate(() => {
      const storage = window.localStorage;
      const proto = Object.getPrototypeOf(storage) as Storage;
      Object.defineProperty(proto, 'setItem', {
        configurable: true,
        value: () => {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        },
      });
    });
  }

  /** An alert warns that progress couldn't be saved to this browser. */
  async expectSaveFailedAlert(context: string): Promise<void> {
    await expect(
      this.page.getByRole('alert').filter({ hasText: /couldn['’]?t save progress/i }),
      `${context}: an alert should warn that progress couldn't be saved`,
    ).toBeVisible();
  }

  /** No alert warns about failed browser storage saves. */
  async expectNoSaveFailedAlert(context: string): Promise<void> {
    await expect(
      this.page.getByRole('alert').filter({ hasText: /couldn['’]?t save progress/i }),
      `${context}: the save-failed alert should clear once progress is saved`,
    ).toHaveCount(0);
  }

  /** An alert says the server can't be reached, with an enabled `Try again` button. */
  async expectUnreachable(context: string): Promise<void> {
    await this.expectAlert(UNREACHABLE, `${context}: an alert should say the server can't be reached`);
  }

  /** An alert says today's challenge isn't ready, not that the server is unreachable, with an enabled `Try again` button. */
  async expectNotReady(context: string): Promise<void> {
    await this.expectAlert(NOT_READY, `${context}: an alert should say today's challenge isn't ready yet`);
    await expect(
      this.page.getByRole('alert').filter({ hasText: UNREACHABLE }),
      `${context}: the server answered 404, so no alert should say it can't be reached (${UNREACHABLE})`,
    ).toHaveCount(0);
  }

  /** Clicks `Try again` and waits until the page asks GET /api/daily once more. */
  async tryAgain(context: string): Promise<void> {
    const before = this.requests;
    await this.tryAgainButton.click();
    await expect
      .poll(() => this.requests, { message: `${context}: Try again should fetch GET /api/daily again (requests before: ${before})` })
      .toBeGreaterThan(before);
  }

  /** No load-error alert or `Try again` button is left once the challenge shows. */
  async expectNoLoadError(context: string): Promise<void> {
    await expect(this.arrayGroup, `${context}: the Challenge array should be shown`).toBeVisible();
    await expect(
      this.page.getByRole('alert').filter({ hasText: UNREACHABLE }),
      `${context}: the "can't reach the server" alert should be gone once the challenge loads`,
    ).toHaveCount(0);
    await expect(this.tryAgainButton, `${context}: Try again should be gone once the challenge loads`).toBeHidden();
  }

  private get arrayGroup(): Locator {
    return this.page.getByRole('group', { name: 'Challenge array' });
  }

  private get streak(): Locator {
    return this.page.getByRole('status', { name: 'Streak', exact: true });
  }

  private get tryAgainButton(): Locator {
    return this.page.getByRole('button', { name: 'Try again', exact: true });
  }

  private async expectAlert(pattern: RegExp, message: string): Promise<void> {
    await expect(this.page.getByRole('alert').filter({ hasText: pattern }), `${message} (text matching ${pattern})`).toBeVisible();
    await expect(this.tryAgainButton, `${message}, and a "Try again" button should be visible`).toBeVisible();
    await expect(this.tryAgainButton, `${message}, and the "Try again" button should be enabled`).toBeEnabled();
  }

  private async answer(handler: (route: Route) => Promise<void>): Promise<void> {
    await this.page.unroute('**/api/daily');
    await this.page.route('**/api/daily', async (route) => {
      this.requests += 1;
      await handler(route);
    });
  }
}
