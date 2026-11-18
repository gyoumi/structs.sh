import { test, expect } from '../support/test';

// Line numbers refer to e2e/programs/sum_input.c.

test.describe('input', () => {
  test('lines typed in the console reach the program, and Ctrl+D ends its input', async ({
    debuggerPage,
  }) => {
    await debuggerPage.openProgram('sum_input.c');
    await debuggerPage.startSession();
    await debuggerPage.stepUntilLine(6); // while (scanf(...) == 1)

    await debuggerPage.typeLine('2');
    await debuggerPage.typeLine('3');
    await debuggerPage.sendEndOfFile();
    await debuggerPage.runToEnd();

    await expect(debuggerPage.console).toContainText('total 5');
  });
});
