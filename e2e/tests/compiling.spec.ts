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

  test('a compile error does not start a session', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('compile_error.c');
    await debuggerPage.compileButton.click();
    // The compile error is the server's last message for this compile
    // (serve.py returns after sending it), so the button state is final here.
    await expect(debuggerPage.console).toContainText('undeclared_variable');

    await expect(debuggerPage.stepForwardButton).toBeDisabled();
  });
});
