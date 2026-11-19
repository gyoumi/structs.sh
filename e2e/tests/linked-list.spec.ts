import { test, expect } from '../support/test';
import type { PointerLabel } from '../support/debugger-page';

// Line numbers refer to e2e/programs/linked_list.c.

const show = (pointers: PointerLabel[]) =>
  `[${pointers.map(({ name, node }) => `${name} beside ${node === null ? 'no node' : `node ${node}`}`).join(', ')}]`;

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

  // What the user saw: a node vanished for one step after prepend returned,
  // then came back on the next line. GDB never shows that.
  test('a node once drawn stays drawn while stepping through the program', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('linked_list.c');
    await debuggerPage.startSession();

    const steps = await debuggerPage.drawingAtEachStep();
    // Node values are the numbers; the other labels are pointer names and "??".
    const values = steps.map(({ labels }) => labels.filter((label) => /^-?\d+$/.test(label)));
    const vanished = steps.flatMap(({ line }, index) =>
      [...new Set(values.slice(0, index).flat())]
        .filter((value) => !values[index].includes(value))
        .map((value) => `step ${index + 1} (line ${line}): node ${value} no longer drawn`),
    );
    const perStep = steps.map(({ line, labels }, index) => `step ${index + 1} (line ${line}): [${labels.join(', ')}]`);

    expect(
      vanished,
      `linked_list.c stepped to the end: nodes drawn at one step and missing at a later one. Labels drawn at each step:\n${perStep.join('\n')}\n`,
    ).toEqual([]);
    expect(
      [...new Set(values.flat())].sort(),
      'linked_list.c stepped to the end: node values drawn at some step',
    ).toEqual(['1', '2', '3']);
  });

  // Pointer names are drawn under the node they point at, for the pointer
  // variables of the function the step is in. They showed on the dev server
  // but never in the production build students use.
  test('the variable holding a list is labelled beside its first node', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('linked_list.c');
    await debuggerPage.startSession();

    await debuggerPage.stepUntilLine(18); // after list = prepend(list, 3);
    const afterFirst = await debuggerPage.settledPointerLabels();
    expect(
      show(afterFirst),
      `linked_list.c line 18, after \`list = prepend(list, 3);\`: pointer labels and the node each is beside ` +
        `(labels drawn: [${(await debuggerPage.settledVisibleLabels()).join(', ')}])`,
    ).toBe('[list beside node 3]');

    await debuggerPage.stepUntilLine(20); // int done = 1; the list is 1 -> 2 -> 3
    const afterAll = await debuggerPage.settledPointerLabels();
    expect(
      show(afterAll),
      `linked_list.c line 20, the list built as 1 -> 2 -> 3: pointer labels and the node each is beside ` +
        `(labels drawn: [${(await debuggerPage.settledVisibleLabels()).join(', ')}])`,
    ).toBe('[list beside node 1]');
  });

  test("a function's pointer variables are labelled beside the nodes they point at", async ({ debuggerPage }) => {
    await debuggerPage.openProgram('linked_list.c');
    await debuggerPage.startSession();
    await debuggerPage.stepUntilLine(18); // back in main after the first prepend
    await debuggerPage.stepUntilLine(11); // second prepend(list, 2): n->next = head;

    const pointers = await debuggerPage.settledPointerLabels();
    expect(
      show(pointers),
      `linked_list.c line 11 in the second call, prepend(list, 2), after n->value = 2: head points at node 3 ` +
        `and n at the new node 2; pointer labels and the node each is beside ` +
        `(labels drawn: [${(await debuggerPage.settledVisibleLabels()).join(', ')}])`,
    ).toBe('[head beside node 3, n beside node 2]');
  });

  test('a NULL pointer gets no label, and the other pointers still do', async ({ debuggerPage }) => {
    await debuggerPage.openProgram('linked_list.c');
    await debuggerPage.startSession();
    await debuggerPage.stepUntilLine(11); // first prepend(list, 3), head == NULL: n->next = head;

    const pointers = await debuggerPage.settledPointerLabels();
    expect(
      show(pointers),
      `linked_list.c line 11 in the first call, prepend(NULL, 3), after n->value = 3: head is NULL and n points ` +
        `at the new node 3; pointer labels and the node each is beside ` +
        `(labels drawn: [${(await debuggerPage.settledVisibleLabels()).join(', ')}])`,
    ).toBe('[n beside node 3]');
  });
});
