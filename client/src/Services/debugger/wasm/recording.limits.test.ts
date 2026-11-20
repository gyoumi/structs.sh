import { describe, expect, it } from 'vitest';
import {
  CLANG_TIMEOUT,
  nodeProgram,
  outputOf,
  record,
  stepsOf,
} from './__tests__/recordingTestKit';

// The limits that stop a recording: output, statements, time and size. A run
// stopped by one keeps the steps it took.

const FOREVER = 'int main(void) {\n    int i = 0;\n    while (1) {\n        i++;\n    }\n}\n';

describe('recordRun: limits', () => {
  it(
    'keeps no more output than the console would show',
    async () => {
      // 30,000 characters, over the 20,000 the console shows.
      const source =
        '#include <stdio.h>\nint main(void) {\n    for (int i = 0; i < 3000; i++) printf("0123456789");\n}\n';

      const recording = await record('lots.c', source);
      const output = outputOf(recording);

      expect(
        output.length,
        'lots.c (prints 30,000 characters; the console shows 20,000): characters of output kept'
      ).toBeLessThan(21_000);
      expect(
        output.match(/output was stopped/g)?.length,
        `lots.c: times the "output was stopped" note appears (output ends: ${JSON.stringify(output.slice(-120))})`
      ).toBe(1);
      expect(recording.end, 'lots.c: how the run ended').toEqual({ exitCode: 0 });
    },
    CLANG_TIMEOUT
  );

  it(
    'steps through every pass of a loop',
    async () => {
      const recording = await record('loop.c', FOREVER, { statementLimit: 50 });

      expect(
        stepsOf(recording).slice(0, 6),
        'loop.c (while (1) { i++; }, statement limit 50): first 6 steps as function:line'
      ).toEqual(['main:2', 'main:4', 'main:3', 'main:4', 'main:3', 'main:4']);
      expect(recording.steps.length, 'loop.c, statement limit 50: steps recorded').toBe(50);
      expect(recording.end, 'loop.c, statement limit 50: how the run ended').toEqual({
        stepLimit: 50,
      });
    },
    CLANG_TIMEOUT
  );

  it(
    'stops a program that runs past the time limit, keeping the steps it took',
    async () => {
      const recording = await record('slow.c', FOREVER, {
        statementLimit: Infinity,
        timeLimitMs: 50,
      });

      expect(
        stepsOf(recording).slice(0, 3),
        'slow.c (while (1) { i++; }, 50 ms time limit, no statement limit): first 3 steps as function:line'
      ).toEqual(['main:2', 'main:4', 'main:3']);
      expect(recording.end, 'slow.c, 50 ms time limit: how the run ended').toEqual({
        timeLimit: 50,
      });
    },
    CLANG_TIMEOUT
  );

  it(
    'stops a loop that repeats one line forever',
    async () => {
      // Every pass repeats line 2, which isn't a new step, but still counts
      // towards the limit.
      const source = 'int main(void) {\n    while (1) {}\n}\n';

      const recording = await record('spin.c', source, { statementLimit: 50 });

      expect(
        stepsOf(recording),
        'spin.c (while (1) {} on line 2, statement limit 50): steps as function:line'
      ).toEqual(['main:2']);
      expect(recording.end, 'spin.c, statement limit 50: how the run ended').toEqual({
        stepLimit: 50,
      });
    },
    CLANG_TIMEOUT
  );

  it(
    'stops a recording that outgrows its size budget, keeping the steps before it',
    async () => {
      const source = nodeProgram(
        [
          '    struct node *list = NULL;', // 5
          '    for (int i = 0; i < 1000; i++) {', // 6
          '        struct node *n = malloc(sizeof(struct node));', // 7
          '        n->value = i;', // 8
          '        n->next = list;', // 9
          '        list = n;', // 10
          '    }', // 11
        ].join('\n')
      );

      const recording = await record('big.c', source, { sizeLimit: 20_000 });

      expect(
        recording.end,
        'big.c (a 1,000-node list, size budget 20,000): how the run ended'
      ).toEqual({ sizeLimit: 20_000 });
      expect(
        recording.steps.length,
        'big.c, size budget 20,000: steps kept from before the budget ran out'
      ).toBeGreaterThan(10);
    },
    CLANG_TIMEOUT
  );

  it(
    'counts a big heap towards the size budget on every step, even unchanged',
    async () => {
      // Steps share unchanged heap entries, but each step still shows the
      // whole heap, so the budget must count it every time.
      const source = nodeProgram(
        [
          '    struct node *list = NULL;', // 5
          '    for (int i = 0; i < 300; i++) {', // 6
          '        struct node *n = malloc(sizeof(struct node));', // 7
          '        n->value = i;', // 8
          '        n->next = list;', // 9
          '        list = n;', // 10
          '    }', // 11
          '    int total = 0;', // 12
          '    for (int i = 0; i < 3000; i++) total += i;', // 13
        ].join('\n')
      );

      const recording = await record('steady.c', source, { sizeLimit: 2_000_000 });

      expect(
        recording.end,
        'steady.c (a 300-node list, then 3,000 steps that leave it unchanged, size budget 2,000,000): how the run ended'
      ).toEqual({ sizeLimit: 2_000_000 });
    },
    CLANG_TIMEOUT
  );
});
