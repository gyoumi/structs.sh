import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { DebuggerPage } from './debugger-page';
import { LandingPage } from './landing-page';
import { DetailedVisualiserPage } from './visualiser-details';

/**
 * Tests listed in known-failures.json are expected to fail, with a reason.
 * Playwright reports them as passing while they fail, and as FAILING once
 * they start passing, so a fixed feature can't stay silently on the list.
 *
 * Set E2E_STRICT=1 to ignore the list and see raw results.
 */
const knownFailures: Record<string, string> = JSON.parse(
  readFileSync(new URL('../known-failures.json', import.meta.url), 'utf8'),
);

export const testKey = (titlePath: string[]) => titlePath.slice(1).join(' › ');

export const test = base.extend<{
  debuggerPage: DebuggerPage;
  landingPage: LandingPage;
  visualiser: DetailedVisualiserPage;
  knownFailure: void;
}>({
  knownFailure: [
    async ({}, use, testInfo) => {
      const reason = knownFailures[testKey(testInfo.titlePath)];
      if (reason && !process.env.E2E_STRICT) testInfo.fail(true, reason);
      await use();
    },
    { auto: true },
  ],
  debuggerPage: async ({ page }, use) => {
    await use(new DebuggerPage(page));
  },
  landingPage: async ({ page }, use) => {
    await use(new LandingPage(page));
  },
  visualiser: async ({ page }, use) => {
    await use(new DetailedVisualiserPage(page));
  },
});

export { expect };
