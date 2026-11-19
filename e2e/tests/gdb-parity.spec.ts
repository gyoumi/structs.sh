import { test, expect } from '../support/test';
import { describeLine, firstLineDifference, gdbStops, pairStops, sortNodes } from '../support/gdb-recording';

// Compares the wasm debugger with recordings of the old GDB debugger
// stepping through the same programs (e2e/fixtures/gdb-steps/, which say how
// they were recorded and where GDB itself was wrong). The GDB debugger has
// been removed, so these recordings are what it did.

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

test.describe('matches the GDB debugger', () => {
  // Reading the settled drawing after every step takes about a second a step.
  test.describe.configure({ timeout: 180_000 });

  for (const program of programs) {
    test(`stops on the same lines as GDB through ${program}`, async ({ debuggerPage }) => {
      await debuggerPage.openProgram(program);
      await debuggerPage.startSession();
      const wasm = await debuggerPage.runToEnd();
      const gdb = gdbStops(program).map((stop) => stop.line);

      const difference = firstLineDifference(program, wasm, gdb);
      expect(
        difference,
        `${program} stepped to the end: the wasm debugger's stops differ from GDB's beyond the two allowed ` +
          `differences (wasm also stops on main's first line; GDB also stops on a function's closing }).\n` +
          `  wasm lines: ${wasm.join(' ')}\n` +
          `  GDB lines:  ${gdb.join(' ')}\n` +
          `  first difference: ${difference}\n`,
      ).toBeNull();
    });

    test(`draws the same nodes as GDB at each stop through ${program}`, async ({ debuggerPage }) => {
      await debuggerPage.openProgram(program);
      await debuggerPage.startSession();
      const steps = await debuggerPage.drawingAtEachStep();
      const gdb = gdbStops(program);

      // A stop is a run of steps on the same line: the step that ends the
      // session leaves the last line highlighted.
      const stops: { line: number | null; steps: number[] }[] = [];
      steps.forEach(({ line }, index) => {
        if (stops.at(-1)?.line === line) stops.at(-1)!.steps.push(index);
        else stops.push({ line, steps: [index] });
      });

      const differences = pairStops(
        stops.map(({ line }) => line ?? -1),
        gdb.map(({ line }) => line),
      ).flatMap(([wasmStop, gdbStop]) => {
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
      const perStep = steps.map(
        ({ line, labels }, index) => `  step ${index + 1} (line ${line}): [${labels.join(', ')}]`,
      );

      expect(
        differences,
        `${program} stepped to the end: node values drawn at each stop, compared with GDB's at the stop on the ` +
          `same line (sorted, as their order is layout; pointer names aren't compared, as GDB mode doesn't draw ` +
          `them; stops marked as GDB faults are skipped). Every label drawn at each wasm step:\n${perStep.join('\n')}\n`,
      ).toEqual([]);
    });
  }
});
