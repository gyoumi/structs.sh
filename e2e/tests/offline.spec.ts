import { test, expect } from '../support/test';

// Once the debugger page has loaded and the compiler has downloaded, the
// debugger runs in the browser, so it keeps working with the network off.
// Each test opens a program, waits for the compiler, goes offline, and only
// then does what a user would.
//
// Line numbers refer to e2e/programs/linked_list.c and e2e/programs/sum_input.c.

test.describe('working offline', () => {
  test('a program compiles and steps a second time with the network off', async ({ debuggerPage }) => {
    await test.step('online: open linked_list.c and wait for the compiler to download', async () => {
      await debuggerPage.openProgram('linked_list.c');
      await debuggerPage.waitForCompilerDownload();
    });

    await debuggerPage.goOffline();

    await test.step('offline, first compile: compile linked_list.c and step to line 20', async () => {
      await debuggerPage.startSession();
      await debuggerPage.stepUntilLine(20); // int done = 1;
      await expect
        .poll(() => debuggerPage.visualisedLabels(), {
          message: 'offline, first compile of linked_list.c at line 20: labels drawn for the list 1 -> 2 -> 3',
        })
        .toEqual(expect.arrayContaining(['1', '2', '3', 'list']));
    });

    await test.step('offline, second compile: compile linked_list.c again and step to line 20', async () => {
      const linesBefore = debuggerPage.visitedLines.length;
      await debuggerPage.startSession();
      await debuggerPage.stepUntilLine(20); // int done = 1;

      // The second run steps from the start of main again, rather than
      // staying where the first run stopped.
      expect(
        debuggerPage.visitedLines.slice(linesBefore),
        'offline, second compile of linked_list.c: lines stepped through on the way to line 20',
      ).toEqual(expect.arrayContaining([17, 18, 19, 20]));
      await expect
        .poll(() => debuggerPage.visualisedLabels(), {
          message: 'offline, second compile of linked_list.c at line 20: labels drawn for the list 1 -> 2 -> 3',
        })
        .toEqual(expect.arrayContaining(['1', '2', '3', 'list']));
    });
  });

  test('a program reads lines typed in the console with the network off', async ({ debuggerPage }) => {
    await test.step('online: open sum_input.c and wait for the compiler to download', async () => {
      await debuggerPage.openProgram('sum_input.c');
      await debuggerPage.waitForCompilerDownload();
    });

    await debuggerPage.goOffline();

    await test.step('offline: compile sum_input.c and step to the scanf loop', async () => {
      await debuggerPage.startSession();
      await debuggerPage.stepUntilLine(6); // while (scanf(...) == 1)
    });

    // Each line typed re-records the run with the input so far.
    await test.step('offline: type 2 and 3, press Ctrl+D, and run to the end', async () => {
      await debuggerPage.typeLine('2');
      await debuggerPage.typeLine('3');
      await debuggerPage.sendEndOfFile();
      await debuggerPage.runToEnd();
    });

    await expect(
      debuggerPage.console,
      'offline, sum_input.c given "2", "3" and Ctrl+D: the console shows the program printing "total 5"',
    ).toContainText('total 5');
  });

  // With the network on, so a request that would fail offline is still seen.
  // Both programs are in one folder, so switching to sum_input.c doesn't
  // reload the page.
  test('a whole session makes no network requests once the page has loaded', async ({ debuggerPage }) => {
    await test.step('online: open linked_list.c and sum_input.c and wait for the compiler to download', async () => {
      await debuggerPage.openPrograms('linked_list.c', 'sum_input.c');
      await debuggerPage.waitForCompilerDownload();
    });

    const requests = debuggerPage.recordRequests();

    await test.step('compile linked_list.c, step to line 20, and step back', async () => {
      await debuggerPage.startSession();
      await debuggerPage.stepUntilLine(20); // int done = 1;
      await expect
        .poll(() => debuggerPage.visualisedLabels(), {
          message: 'first compile of linked_list.c at line 20: labels drawn for the list 1 -> 2 -> 3',
        })
        .toEqual(expect.arrayContaining(['1', '2', '3', 'list']));
      await debuggerPage.stepBack();
    });

    await test.step('compile linked_list.c again and step to line 20', async () => {
      await debuggerPage.startSession();
      await debuggerPage.stepUntilLine(20); // int done = 1;
      await expect
        .poll(() => debuggerPage.visualisedLabels(), {
          message: 'second compile of linked_list.c at line 20: labels drawn for the list 1 -> 2 -> 3',
        })
        .toEqual(expect.arrayContaining(['1', '2', '3', 'list']));
    });

    await test.step('switch to sum_input.c, compile it, type 2 and 3, press Ctrl+D, and run to the end', async () => {
      await debuggerPage.selectProgram('sum_input.c');
      await debuggerPage.startSession();
      await debuggerPage.stepUntilLine(6); // while (scanf(...) == 1)
      await debuggerPage.typeLine('2');
      await debuggerPage.typeLine('3');
      await debuggerPage.sendEndOfFile();
      await debuggerPage.runToEnd();
      await expect(
        debuggerPage.console,
        'sum_input.c given "2", "3" and Ctrl+D: the console shows the program printing "total 5"',
      ).toContainText('total 5');
    });

    expect(
      requests,
      'requests made after the page loaded and the compiler downloaded, during a session that compiled ' +
        'and stepped linked_list.c twice (with a step back) and ran sum_input.c with typed input (expected none)',
    ).toEqual([]);
  });
});
