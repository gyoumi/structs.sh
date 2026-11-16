import { test, expect } from '../support/test';

test.describe('program output', () => {
  test('printf output appears in the console', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('hello.c');
    await debuggerPage.startSession();
    await debuggerPage.stepUntilLine(5); // the line after printf: return 0;

    await expect(debuggerPage.console).toContainText('hello from structs');
  });
});
