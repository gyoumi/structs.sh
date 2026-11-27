import type { Page } from '@playwright/test';

/**
 * Starts recording console errors and uncaught exceptions on `page`. Call it before opening the
 * page; the returned function lists what was logged since.
 */
export const watchPageErrors = (page: Page): (() => string[]) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`uncaught ${error.name}: ${error.message}`));
  return () => [...errors];
};
