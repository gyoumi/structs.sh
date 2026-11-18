import { test, expect } from '../support/test';

/** The examples the debugger comes with, as folder and file under root. */
const EXAMPLES = [
  ['2521_Tut02', 'linked_list_delete.c'],
  ['2521_Tut02', 'list_length_recursive.c'],
  ['LinkedListWorkspace', 'linked_list_helper_fns.c'],
  ['LinkedListWorkspace', 'reverse_linked_list_fns.c'],
  ['LinkedListWorkspace', 'reverse_linked_list_imperative.c'],
  ['LinkedListWorkspace', 'sort_linked_list.c'],
  ['LinkedListWorkspace', 'treelike_linked_list.c'],
  ['LinkedListWorkspace', 'ctf_linked_list.c'],
] as const;

/** What the debugger says when something went wrong, rather than the program. */
const DEBUGGER_ERRORS = /could not be run|runner failed|instrumenter could not/i;

test.describe('examples', () => {
  for (const [folder, name] of EXAMPLES) {
    test(`the ${name} example compiles and steps without a debugger error`, async ({
      debuggerPage,
    }) => {
      await debuggerPage.openExample(folder, name);
      await debuggerPage.startSession();

      // Some examples wait for input, and one loops forever on purpose, so
      // take up to 25 steps rather than running to the end, and stop early
      // once three steps in a row don't move on.
      const visited = await debuggerPage.stepAWhile(25, 3);

      expect(visited.length).toBeGreaterThan(1);
      await expect(debuggerPage.console).not.toContainText(DEBUGGER_ERRORS);
      await expect(debuggerPage.console).not.toContainText('NULL pointer dereference');
    });
  }
});
