import { test, expect } from '../support/test';

test.describe('compiling', () => {
  test('a valid program starts a debug session', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('counter.c');
    await debuggerPage.startSession();
  });

  test('a compile error is shown in the console', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('compile_error.c');
    await debuggerPage.compileButton.click();

    // Match the identifier, not the wording: gcc and clang phrase this differently.
    await expect(debuggerPage.console).toContainText('undeclared_variable');
    await expect(debuggerPage.console).toContainText(/error/i);
  });

  test('a compile error does not start a session', async ({ debuggerPage, page }) => {
    await debuggerPage.openProgram('compile_error.c');
    await debuggerPage.compileButton.click();
    await expect(debuggerPage.console).toContainText('undeclared_variable');

    await page.waitForTimeout(1_000);
    await expect(debuggerPage.stepForwardButton).toBeDisabled();
  });
});
