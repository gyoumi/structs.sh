import { test, expect } from '../support/test';

test.describe('types and variables', () => {
  test('struct types in the program are listed', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('linked_list.c');
    await debuggerPage.startSession();
    await debuggerPage.stepUntilLine(18);

    await expect(debuggerPage.configurePanel).toContainText('struct node');
  });

  test('struct fields are listed with their types', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('linked_list.c');
    await debuggerPage.startSession();
    await debuggerPage.stepUntilLine(18);

    await expect(debuggerPage.configurePanel).toContainText('int value');
    await expect(debuggerPage.configurePanel).toContainText('struct node * next');
  });

  test('local variables of the current function are listed', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('functions.c');
    await debuggerPage.startSession();
    await debuggerPage.stepUntilLine(9);

    await expect(debuggerPage.configurePanel).toContainText('int a');
    await expect(debuggerPage.configurePanel).toContainText('int b');
  });
});
