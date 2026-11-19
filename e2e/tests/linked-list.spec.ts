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
});
