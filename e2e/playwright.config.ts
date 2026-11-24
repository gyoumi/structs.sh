import { defineConfig, devices } from '@playwright/test';

// The production build, served by `vite preview`, is what users get, so
// that is what the suite tests by default. The dev server differs: React's
// StrictMode runs effects twice there, which once hid a bug that only showed
// in production.
const previewPort = 4173;
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${previewPort}`;

export default defineConfig({
  testDir: './tests',
  // The whole-stack spec moves the game server's clock, so it only runs
  // against docker-compose.daily.yml, which E2E_CLOCK_URL points at.
  testIgnore: process.env.E2E_CLOCK_URL ? [] : ['**/daily-game-stack.spec.ts'],
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
  // Builds the frontend for production and serves the build, unless
  // E2E_BASE_URL points at one already running. The debugger runs in the
  // browser, so there is nothing else to start. `pnpm run build` type-checks
  // too, so a build that wouldn't deploy fails here as well. Outside CI a
  // server already on the port is reused: stop it after changing the client.
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `pnpm --dir ../client run build && pnpm --dir ../client run preview --port ${previewPort} --strictPort`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 300_000,
      },
});
