import { expect, type Locator, type Page, type Route } from '@playwright/test';
import type { DailyPuzzle } from './daily-fixtures';

export const HISTORY_STORAGE_KEY = 'structs.daily.history';

/** A served puzzle with the calendar day it is for. */
export type DatedPuzzle = DailyPuzzle & { date: string };

/** One saved day as read back from localStorage, loosely typed so a wrong shape shows up in the failure message. */
export type StoredResult = {
  date?: unknown;
  completed?: unknown;
  tries?: { input?: unknown; score?: unknown }[];
};

export type StoredHistory = { version?: unknown; results?: Record<string, StoredResult> };

const UNREACHABLE = /can['’]?t reach.*server|server.*unreachable/i;
const NOT_READY = /not ready|isn['’]?t ready|no puzzle/i;

/**
 * Checkpoint 3 additions to the /daily page object: what GET /api/daily answers, the saved history in
 * localStorage, the `Streak` readout, and the alerts shown when the puzzle can't load.
 * Playing a try stays in `DailyPage`; try chips and `Goal reached` stay in `DailyTemplatePage`.
 */
export class DailyHistoryPage {
  private requests = 0;

  constructor(readonly page: Page) {}

  /** How many times the page has asked GET /api/daily since the first `serveOnly`, `failWith` or `abort`. */
  get dailyRequests(): number {
    return this.requests;
  }

  /** Replaces any earlier /api/daily route so the next GET /api/daily is answered with `puzzle`. */
  async serveOnly(puzzle: DatedPuzzle | DailyPuzzle): Promise<void> {
    await this.answer((route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(puzzle) }),
    );
  }

  /** Replaces any earlier /api/daily route so GET /api/daily answers with `status` and no puzzle. */
  async failWith(status: number): Promise<void> {
    await this.answer((route) => route.fulfill({ status, contentType: 'text/plain', body: `HTTP ${status}` }));
  }

  /** Replaces any earlier /api/daily route so GET /api/daily fails at the network layer. */
  async abort(): Promise<void> {
    await this.answer((route) => route.abort('failed'));
  }

  /** Opens /daily without waiting for a puzzle, for the error states. */
  async goto(): Promise<void> {
    await this.page.goto('/daily');
  }

  /** Reloads /daily and waits for the restored puzzle array. */
  async reload(context: string): Promise<void> {
    await this.page.reload();
    await expect(this.arrayGroup, `${context}: after reloading /daily the Puzzle array should be shown again`).toBeVisible();
  }

  /** Every slot in Puzzle array is disabled, so a finished puzzle can't be edited. */
  async expectArrayFrozen(count: number, context: string): Promise<void> {
    const slots = this.arrayGroup.getByRole('button');
    await expect(slots, `${context}: Puzzle array should show ${count} slots`).toHaveCount(count);
    const enabled: number[] = [];
    for (let i = 0; i < count; i += 1) {
      if (await slots.nth(i).isEnabled()) enabled.push(i);
    }
    expect(enabled, `${context}: a finished puzzle must lock every slot, but slots ${JSON.stringify(enabled)} are still enabled`).toEqual([]);
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

  /** The history saved under `structs.daily.history`, or null when nothing is saved. */
  async savedHistory(): Promise<{ raw: string | null; parsed: StoredHistory | null }> {
    const raw = await this.page.evaluate((key) => window.localStorage.getItem(key), HISTORY_STORAGE_KEY);
    if (raw === null) return { raw, parsed: null };
    return { raw, parsed: JSON.parse(raw) as StoredHistory };
  }

  /** An alert says the server can't be reached, with an enabled `Try again` button. */
  async expectUnreachable(context: string): Promise<void> {
    await this.expectAlert(UNREACHABLE, `${context}: an alert should say the server can't be reached`);
  }

  /** An alert says today's puzzle isn't ready, not that the server is unreachable, with an enabled `Try again` button. */
  async expectNotReady(context: string): Promise<void> {
    await this.expectAlert(NOT_READY, `${context}: an alert should say today's puzzle isn't ready yet`);
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

  /** No load-error alert or `Try again` button is left once the puzzle shows. */
  async expectNoLoadError(context: string): Promise<void> {
    await expect(this.arrayGroup, `${context}: the Puzzle array should be shown`).toBeVisible();
    await expect(
      this.page.getByRole('alert').filter({ hasText: UNREACHABLE }),
      `${context}: the "can't reach the server" alert should be gone once the puzzle loads`,
    ).toHaveCount(0);
    await expect(this.tryAgainButton, `${context}: Try again should be gone once the puzzle loads`).toBeHidden();
  }

  private get arrayGroup(): Locator {
    return this.page.getByRole('group', { name: 'Puzzle array' });
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
