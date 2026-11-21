import { test, expect } from '../support/test';
import type { DrawnStep } from '../support/debugger-page';
import { sortNodes, valuesGdbDrew } from '../support/gdb-recording';

// Checks that hold at every step of every program that runs to the end
// without input. The programs are in e2e/programs/.

/**
 * Checks that the stepping these tests look at really happened, so they
 * can't pass having seen nothing: every step highlighted a line, and every
 * value the program puts in a node was drawn at some step (the values GDB
 * drew, from e2e/fixtures/gdb-steps). A program with no nodes draws none.
 */
const expectStepsSeen = (program: string, steps: DrawnStep[], perStep: string[]) => {
  const noLine = steps.flatMap(({ line }, index) => (line === null ? [`step ${index + 1}`] : []));
  expect(noLine, `${program} stepped to the end: steps where no line was highlighted`).toEqual([]);
  const drawn = sortNodes([...new Set(steps.flatMap(({ nodes }) => nodes.filter((value) => value !== '??')))]);
  expect(
    drawn,
    `${program} stepped to the end (${steps.length} steps): node values drawn at some step, which should be ` +
      `every value the program puts in a node. Every label drawn at each step:\n${perStep.join('\n')}\n`,
  ).toEqual(valuesGdbDrew(program));
};

const programs = [
  'hello.c',
  'counter.c',
  'functions.c',
  'expr_calls.c',
  'linked_list.c',
  'loop_prepend.c',
  'append.c',
  'delete.c',
  'bst.c',
];

test.describe('every step of every program', () => {
  // Reading the settled drawing after every step takes about a second a step.
  test.describe.configure({ timeout: 180_000 });

  for (const program of programs) {
    // What the user saw: a node vanished for a step and came back on the next.
    //
    // A node is known by its value, so this counts the nodes drawn with each
    // value at each step. The count may go down for good (free() removes a
    // node), but a count that goes down and later back up is a node that
    // vanished and came back. That would also flag a node freed and later
    // replaced by another with the same value, or a node whose value is
    // changed away and back, but none of these programs does either. "??"
    // (a node whose value isn't set yet) isn't counted, as it becomes the
    // node's value on the next line.
    test(`a node once drawn never disappears and comes back while stepping through ${program}`, async ({
      debuggerPage,
    }) => {
      await debuggerPage.openProgram(program);
      await debuggerPage.startSession();
      const steps = await debuggerPage.drawingAtEachStep();

      const counts = steps.map(({ nodes }) => {
        const count = new Map<string, number>();
        for (const value of nodes) if (value !== '??') count.set(value, (count.get(value) ?? 0) + 1);
        return count;
      });
      const values = [...new Set(counts.flatMap((count) => [...count.keys()]))];
      const where = (index: number) => `step ${index + 1} (line ${steps[index].line})`;

      // A comeback is a step where a value's count rises while an earlier
      // step drew more of it than the step just before.
      const comebacks = values.flatMap((value) => {
        const n = counts.map((count) => count.get(value) ?? 0);
        return n.flatMap((now, index) => {
          if (index === 0 || now <= n[index - 1]) return [];
          const before = n.slice(0, index - 1).findLastIndex((earlier) => earlier > n[index - 1]);
          if (before === -1) return [];
          return [
            `node ${value}: drawn ${n[before]} time(s) at ${where(before)}, ` +
              `${n[before + 1]} time(s) from ${where(before + 1)} to ${where(index - 1)}, ` +
              `then ${now} time(s) again at ${where(index)}`,
          ];
        });
      });
      const perStep = steps.map(({ line, labels }, index) => `  step ${index + 1} (line ${line}): [${labels.join(', ')}]`);
      expectStepsSeen(program, steps, perStep);

      expect(
        comebacks,
        `${program} stepped to the end: nodes that disappeared from the drawing and came back later. ` +
          `Every label drawn at each step:\n${perStep.join('\n')}\n`,
      ).toEqual([]);
    });

    test(`shows no console errors or uncaught page errors while stepping through ${program}`, async ({
      debuggerPage,
    }) => {
      await debuggerPage.openProgram(program);
      await debuggerPage.startSession();
      const steps = await debuggerPage.drawingAtEachStep();
      const perStep = steps.map(({ line, labels }, index) => `  step ${index + 1} (line ${line}): [${labels.join(', ')}]`);

      expect(
        debuggerPage.consoleErrors(),
        `${program} stepped to the end, reading the settled drawing after each step: errors the page logged ` +
          `or threw, with the step they came after. Every label drawn at each step:\n${perStep.join('\n')}\n`,
      ).toEqual([]);
      // No errors only counts if the drawing code ran on every node.
      expectStepsSeen(program, steps, perStep);
    });
  }
});
