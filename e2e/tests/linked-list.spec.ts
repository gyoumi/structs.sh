import { test, expect } from '../support/test';

test.describe('linked list visualisation', () => {
  test('a node appears once it is linked into the list', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('linked_list.c');
    await debuggerPage.startSession();
    await debuggerPage.stepUntilLine(18); // after the first prepend

    await expect.poll(() => debuggerPage.visualisedLabels()).toEqual(expect.arrayContaining(['3', 'list']));
  });

  test('every node of a built list is drawn', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('linked_list.c');
    await debuggerPage.startSession();
    await debuggerPage.stepUntilLine(20); // int done = 1;

    await expect
      .poll(() => debuggerPage.visualisedLabels())
      .toEqual(expect.arrayContaining(['1', '2', '3', 'list']));
  });
});
