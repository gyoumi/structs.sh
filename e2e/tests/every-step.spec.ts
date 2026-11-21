import { test, expect } from '../support/test';
import type { DrawnStep } from '../support/debugger-page';
import { describeLine, gdbStops, isFunctionEnd, pairStops, sortNodes, valuesGdbDrew } from '../support/gdb-recording';

// Checks that hold at every step of every program that runs to the end
// without input. The programs are in e2e/programs/.
//
// Reading the settled drawing after every step takes about a second a step,
// so each program is stepped through once and every check reads that one
// walk. Each check is a soft assertion, so one failing still reports the
// others.

/**
 * Checks that the stepping these tests look at really happened, so they
 * can't pass having seen nothing: every step highlighted a line, and every
 * value the program puts in a node was drawn at some step (the values GDB
 * drew, from e2e/fixtures/gdb-steps). A program with no nodes draws none.
 */
const expectStepsSeen = (program: string, steps: DrawnStep[], perStep: string[]) => {
  const noLine = steps.flatMap(({ line }, index) => (line === null ? [`step ${index + 1}`] : []));
  expect.soft(noLine, `${program} stepped to the end: steps where no line was highlighted`).toEqual([]);
  const drawn = sortNodes([...new Set(steps.flatMap(({ nodes }) => nodes.filter((value) => value !== '??')))]);
  expect
    .soft(
      drawn,
      `${program} stepped to the end (${steps.length} steps): node values drawn at some step, which should be ` +
        `every value the program puts in a node. Every label drawn at each step:\n${perStep.join('\n')}\n`,
    )
    .toEqual(valuesGdbDrew(program));
};

/**
 * What the user saw: a node vanished for a step and came back on the next.
 *
 * A node is known by its value, so this counts the nodes drawn with each
 * value at each step. The count may go down for good (free() removes a
 * node), but a count that goes down and later back up is a node that
 * vanished and came back. That would also flag a node freed and later
 * replaced by another with the same value, or a node whose value is
 * changed away and back, but none of these programs does either. "??"
 * (a node whose value isn't set yet) isn't counted, as it becomes the
 * node's value on the next line.
 */
const comebacks = (steps: DrawnStep[]): string[] => {
  const counts = steps.map(({ nodes }) => {
    const count = new Map<string, number>();
    for (const value of nodes) if (value !== '??') count.set(value, (count.get(value) ?? 0) + 1);
    return count;
  });
  const values = [...new Set(counts.flatMap((count) => [...count.keys()]))];
  const where = (index: number) => `step ${index + 1} (line ${steps[index].line})`;

  // A comeback is a step where a value's count rises while an earlier
  // step drew more of it than the step just before.
  return values.flatMap((value) => {
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
};

/**
 * Compares the drawing at each stop with recordings of the old GDB debugger
 * stepping through the same program (e2e/fixtures/gdb-steps/, which say how
 * they were recorded and where GDB itself was wrong). The GDB debugger has
 * been removed, so these recordings are what it did. The lines it stopped
 * on are compared in gdb-parity.spec.ts.
 */
const expectSameDrawingAsGdb = (program: string, steps: DrawnStep[], perStep: string[]) => {
  const gdb = gdbStops(program);
  expect.soft(gdb.length, `${program}: stops in the GDB recording e2e/fixtures/gdb-steps`).toBeGreaterThan(0);

  // A stop is a run of steps on the same line: the step that ends the
  // session leaves the last line highlighted.
  const stops: { line: number | null; steps: number[] }[] = [];
  steps.forEach(({ line }, index) => {
    if (stops.at(-1)?.line === line) stops.at(-1)!.steps.push(index);
    else stops.push({ line, steps: [index] });
  });

  const pairs = pairStops(
    stops.map(({ line }) => line ?? -1),
    gdb.map(({ line }) => line),
  );

  // Every GDB stop whose drawing is compared must have a wasm stop to
  // compare it with, or this check could pass having compared nothing. A
  // wasm stop GDB doesn't make is fine (the line test reports those); a
  // GDB stop on a closing } is one the wasm debugger may skip.
  const paired = new Set(pairs.map(([, gdbStop]) => gdbStop));
  const unpaired = gdb.flatMap((stop, index) =>
    paired.has(index) || stop.gdbFault || isFunctionEnd(program, stop.line)
      ? []
      : [`GDB stop ${index + 1}, ${describeLine(program, stop.line)}`],
  );
  expect
    .soft(
      unpaired,
      `${program} stepped to the end: GDB stops with no wasm stop on the same line to compare the drawing with ` +
        `(they must all be compared, apart from closing braces and stops marked as GDB faults).\n` +
        `  wasm lines: ${stops.map(({ line }) => line).join(' ')}\n` +
        `  GDB lines:  ${gdb.map(({ line }) => line).join(' ')}\n`,
    )
    .toEqual([]);

  const differences = pairs.flatMap(([wasmStop, gdbStop]) => {
    const expected = gdb[gdbStop];
    if (expected.gdbFault) return [];
    return stops[wasmStop].steps
      .filter((index) => sortNodes(steps[index].nodes).join(', ') !== expected.nodes.join(', '))
      .map(
        (index) =>
          `wasm step ${index + 1}, ${describeLine(program, steps[index].line)} (GDB stop ${gdbStop + 1}): ` +
          `expected nodes [${expected.nodes.join(', ')}], drawn [${sortNodes(steps[index].nodes).join(', ')}]`,
      );
  });

  expect
    .soft(
      differences,
      `${program} stepped to the end: node values drawn at each stop, compared with GDB's at the stop on the ` +
        `same line (sorted, as their order is layout; pointer names aren't compared, as GDB mode doesn't draw ` +
        `them; stops marked as GDB faults are skipped). Every label drawn at each wasm step:\n${perStep.join('\n')}\n`,
    )
    .toEqual([]);
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
  test.describe.configure({ timeout: 180_000 });

  for (const program of programs) {
    test(`stepping through ${program} draws the same nodes as GDB, never brings a node back, and logs no errors`, async ({
      debuggerPage,
    }) => {
      await debuggerPage.openProgram(program);
      await debuggerPage.startSession();
      const steps = await debuggerPage.drawingAtEachStep();
      const perStep = steps.map(({ line, labels }, index) => `  step ${index + 1} (line ${line}): [${labels.join(', ')}]`);

      expectStepsSeen(program, steps, perStep);

      expect
        .soft(
          comebacks(steps),
          `${program} stepped to the end: nodes that disappeared from the drawing and came back later. ` +
            `Every label drawn at each step:\n${perStep.join('\n')}\n`,
        )
        .toEqual([]);

      expect
        .soft(
          debuggerPage.consoleErrors(),
          `${program} stepped to the end, reading the settled drawing after each step: errors the page logged ` +
            `or threw, with the step they came after. Every label drawn at each step:\n${perStep.join('\n')}\n`,
        )
        .toEqual([]);

      expectSameDrawingAsGdb(program, steps, perStep);
    });
  }
});
