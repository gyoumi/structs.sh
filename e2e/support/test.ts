import { test as base, expect } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';
import { DailyHistoryPage } from './daily-history';
import { DailyPage } from './daily-page';
import { DailyStackPage } from './daily-stack';
import { DailyStageView } from './daily-stage-view';
import { DailyTemplatePage } from './daily-template-page';
import { DebuggerPage } from './debugger-page';
import { LandingPage } from './landing-page';
import { DetailedVisualiserPage } from './visualiser-details';

/**
 * Tests listed in known-failures/*.json are expected to fail, with a reason.
 * Playwright reports them as passing while they fail, and as FAILING once
 * they start passing, so a fixed feature can't stay silently on the list.
 *
 * Set E2E_STRICT=1 to ignore the lists and see raw results.
 */
const knownFailuresDir = new URL('../known-failures/', import.meta.url);
const knownFailures: Record<string, string> = Object.assign(
  {},
  ...readdirSync(knownFailuresDir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map(
      (name) =>
        JSON.parse(readFileSync(new URL(name, knownFailuresDir), 'utf8')) as Record<string, string>,
    ),
);

export const testKey = (titlePath: string[]) => titlePath.slice(1).join(' › ');

export const test = base.extend<{
  dailyPage: DailyPage;
  dailyHistory: DailyHistoryPage;
  dailyStack: DailyStackPage;
  dailyStage: DailyStageView;
  dailyTemplate: DailyTemplatePage;
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
  dailyPage: async ({ page }, use) => {
    await use(new DailyPage(page));
  },
  dailyHistory: async ({ page }, use) => {
    await use(new DailyHistoryPage(page));
  },
  dailyStack: async ({ page }, use) => {
    await use(new DailyStackPage(page));
  },
  dailyStage: async ({ page }, use) => {
    await use(new DailyStageView(page));
  },
  dailyTemplate: async ({ page }, use) => {
    await use(new DailyTemplatePage(page));
  },
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
