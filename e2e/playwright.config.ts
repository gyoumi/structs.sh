import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests',
  // Stepping through a real program is slow on the gdb backend.
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
  // Starts the frontend if it isn't already running. The debugger itself is
  // started separately (see README), because it is the part being replaced.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: 'pnpm --dir ../client start',
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
