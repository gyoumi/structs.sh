import { test, expect } from '../support/test';
import { firstLineDifference, gdbStops } from '../support/gdb-recording';

// Compares the wasm debugger with recordings of the old GDB debugger
// stepping through the same programs (e2e/fixtures/gdb-steps/, which say how
// they were recorded and where GDB itself was wrong). The GDB debugger has
// been removed, so these recordings are what it did. The drawing at each
// stop is compared in every-step.spec.ts, which reads it on the same walk as
// the other every-step checks.

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
  }
});
