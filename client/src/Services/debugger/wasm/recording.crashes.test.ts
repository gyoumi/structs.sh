import { describe, expect, it } from 'vitest';
import type { Recording } from './recording';
import { CLANG_TIMEOUT, nodeProgram, record, stepsOf } from './__tests__/recordingTestKit';

// How a recording says a program ended by calling exit or by crashing, and
// which step it ends on.

describe('recordRun: exits and crashes', () => {
  it(
    'records how a program that calls exit ended',
    async () => {
      const source = '#include <stdlib.h>\nint main(void) {\n    int a = 1;\n    exit(3);\n}\n';

      const recording = await record('exit.c', source);

      expect(stepsOf(recording), 'exit.c (exit(3) on line 4): steps as function:line').toEqual([
        'main:3',
        'main:4',
      ]);
      expect(recording.end, 'exit.c (exit(3) on line 4): how the run ended').toEqual({
        exitCode: 3,
      });
    },
    CLANG_TIMEOUT
  );

  it(
    'records the step a program crashed on',
    async () => {
      const source = 'int main(void) {\n    int a = 1;\n    __builtin_trap();\n    return a;\n}\n';

      const recording = await record('crash.c', source);

      expect(
        stepsOf(recording),
        'crash.c (__builtin_trap() on line 3): steps as function:line'
      ).toEqual(['main:2', 'main:3']);
      expect(recording.end, 'crash.c (__builtin_trap() on line 3): how the run ended').toEqual({
        crashed: expect.stringContaining('unreachable'),
      });
    },
    CLANG_TIMEOUT
  );

  it.each([
    ['reading through it', '    struct node *p = NULL;\n    int v = p->value;'],
    ['writing through it', '    struct node *p = NULL;\n    p->next = p;'],
    ['copying from it', '    struct node *p = NULL;\n    struct node copy = *p;'],
    ['passing it to the C library', '    char *s = NULL;\n    int n = strlen(s);'],
  ])(
    'crashes on a NULL pointer when %s, on the line that did it',
    async (name, body) => {
      const recording = await record('null.c', nodeProgram(body));
      const steps = stepsOf(recording).join(', ');

      expect(
        recording.end,
        `null.c, NULL pointer ${name} on line 6: how the run ended (steps: ${steps})`
      ).toEqual({ crashed: 'NULL pointer dereference' });
      expect(
        recording.steps.at(-1)?.line,
        `null.c, NULL pointer ${name} on line 6: line of the last step (steps: ${steps})`
      ).toBe(6);
    },
    CLANG_TIMEOUT
  );

  describe('a crash right after a call returns', () => {
    /** The last step as "function:line@depth", and the steps before it, for messages. */
    const lastStep = (recording: Recording) => {
      const last = recording.steps.at(-1);
      return last && `${last.function}:${last.line}@${last.depth}`;
    };

    it(
      'ends on the caller’s line, with its variables, when it crashes as the call returns',
      async () => {
        const source = [
          'int zero(void) {', // 1
          '    return 0;', // 2
          '}', // 3
          'int main(void) {', // 4
          '    int a = 1;', // 5
          '    return a / zero();', // 6: divides by zero once zero() returns
          '}', // 7
        ].join('\n');

        const recording = await record('divide.c', source);
        const steps = stepsOf(recording).join(', ');

        expect(recording.end, `divide.c: how the run ended (steps: ${steps})`).toEqual({
          crashed: expect.any(String),
        });
        expect(
          lastStep(recording),
          `divide.c crashes in main on line 6 after zero() returns: last step, as function:line@depth (steps: ${steps})`
        ).toBe('main:6@0');
        expect(
          recording.steps.at(-1)?.variables.a?.value,
          `divide.c: a in the last step's variables (steps: ${steps})`
        ).toBe(1);
        expect(
          recording.steps.some((step) => step.function === 'zero'),
          `divide.c: the call to zero() still has its own steps before the crash (steps: ${steps})`
        ).toBe(true);
      },
      CLANG_TIMEOUT
    );

    it(
      'ends on the caller’s line when it dereferences a NULL pointer a call returned',
      async () => {
        const source = [
          '#include <stddef.h>', // 1
          'struct node { int value; struct node *next; };', // 2
          'struct node *none(void) {', // 3
          '    return NULL;', // 4
          '}', // 5
          'int main(void) {', // 6
          '    struct node *n = none();', // 7
          '    return none()->value;', // 8: reads through the NULL none() returned
          '}', // 9
        ].join('\n');

        const recording = await record('none.c', source);
        const steps = stepsOf(recording).join(', ');

        expect(recording.end, `none.c: how the run ended (steps: ${steps})`).toEqual({
          crashed: 'NULL pointer dereference',
        });
        expect(
          lastStep(recording),
          `none.c dereferences NULL in main on line 8 after none() returns: last step, as function:line@depth (steps: ${steps})`
        ).toBe('main:8@0');
        expect(
          recording.steps.at(-1)?.variables.n?.value,
          `none.c: n in the last step's variables (steps: ${steps})`
        ).toBe('0x0');
      },
      CLANG_TIMEOUT
    );

    it(
      'adds no step when the crash is inside the called function, on a line it has a step for',
      async () => {
        const source = [
          'int divide(int x, int y) {', // 1
          '    return x / y;', // 2: divides by zero
          '}', // 3
          'int main(void) {', // 4
          '    int a = divide(1, 0);', // 5
          '    return a;', // 6
          '}', // 7
        ].join('\n');

        const recording = await record('inside.c', source);
        const steps = stepsOf(recording).join(', ');

        expect(recording.end, `inside.c: how the run ended (steps: ${steps})`).toEqual({
          crashed: expect.any(String),
        });
        expect(
          stepsOf(recording),
          'inside.c crashes inside divide() on line 2, which already has a step: steps as function:line'
        ).toEqual(['main:5', 'divide:2']);
      },
      CLANG_TIMEOUT
    );
  });
});
