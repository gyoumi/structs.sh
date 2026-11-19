import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  // The first compile downloads clang into the browser, which is slow.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  // GitHub's ubuntu-latest runners have 4 CPUs.
  workers: process.env.CI ? 4 : 3,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['./support/progress-reporter.ts'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Starts the frontend if it isn't already running. The debugger runs in the
  // browser, so there is nothing else to start.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm --dir ../client start',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
