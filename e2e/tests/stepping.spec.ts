import { test, expect } from '../support/test';

// Line numbers refer to the files in e2e/programs/.

test.describe('stepping', () => {
  test('the first step shows the first line of main', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('counter.c');
    await debuggerPage.startSession();
    await debuggerPage.stepForward();

    expect(await debuggerPage.currentLine()).toBe(2); // int total = 0;
  });

  test('each click moves to the next line', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('functions.c');
    await debuggerPage.startSession();
    await debuggerPage.stepUntilLine(8); // int b = square(a);

    await debuggerPage.stepForward();
    expect(await debuggerPage.currentLine()).toBe(2); // int result = x * x;
  });

  test('a loop body is visited once per iteration', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('counter.c');
    await debuggerPage.startSession();
    await debuggerPage.stepUntilLine(6); // return total == 6 ...

    const bodyVisits = debuggerPage.visitedLines.filter((line) => line === 4).length;
    expect(bodyVisits).toBe(3);
  });

  test('stepping enters functions defined in the program', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('functions.c');
    await debuggerPage.startSession();
    await debuggerPage.stepUntilLine(2); // inside square()
    await debuggerPage.stepUntilLine(9); // back in main after the call
  });

  test('stepping back returns to the previous line', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('functions.c');
    await debuggerPage.startSession();
    await debuggerPage.stepUntilLine(2);
    await debuggerPage.stepUntilLine(3);

    await debuggerPage.stepBack();
    expect(await debuggerPage.currentLine()).toBe(2);
  });

  test('the session ends when the program finishes', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('hello.c');
    await debuggerPage.startSession();

    const lines = await debuggerPage.runToEnd();
    expect(lines).toContain(4); // printf(...)
    expect(lines).toContain(5); // return 0;
    await expect(debuggerPage.stepForwardButton).toBeDisabled();
  });

  test('stepping back still works after the session ends', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('hello.c');
    await debuggerPage.startSession();
    await debuggerPage.runToEnd();

    await debuggerPage.stepBack();
    expect(await debuggerPage.currentLine()).toBe(4); // printf(...)
  });
});
