import { describe, expect, it } from 'vitest';
import { CLANG_TIMEOUT, program, record, stepsOf } from './__tests__/recordingTestKit';

// Which steps recordRun records. A step is a statement the program runs, shown
// as "function:line". After a call returns, the next step is the caller's next
// statement, never the line of the call again: GDB shows no such step either
// (e2e/fixtures/gdb-steps/functions.json and linked_list.json).

describe('recordRun: stepping', () => {
  it(
    'records each statement of a straight-line program, with its output',
    async () => {
      const recording = await record('hello.c', program('hello.c'));

      expect(stepsOf(recording), 'hello.c: steps as function:line').toEqual(['main:4', 'main:5']);
      expect(
        recording.steps.map((step) => step.output),
        'hello.c: the output of each step (printf runs during the step on line 4)'
      ).toEqual(['hello from structs\n', '']);
      expect(recording.end, 'hello.c: how the run ended').toEqual({ exitCode: 0 });
    },
    CLANG_TIMEOUT
  );

  it.each([
    ['counter.c', 'counter.c'],
    // compileC gives this file to clang as ./-counter.c, and the instrumenter
    // must still match the line table's rows to that name.
    ['-counter.c (a name clang gets as ./-counter.c)', '-counter.c'],
  ])(
    'visits a loop body once per iteration: %s',
    async (name, fileName) => {
      const recording = await record(fileName, program('counter.c'));

      expect(
        stepsOf(recording),
        `${name} (counter.c's loop runs 3 times): steps as function:line`
      ).toEqual([
        'main:2',
        'main:3',
        'main:4',
        'main:3',
        'main:4',
        'main:3',
        'main:4',
        'main:3',
        'main:6',
      ]);
    },
    CLANG_TIMEOUT
  );

  it(
    'steps into the program’s functions, and once one returns, on to the caller’s next line',
    async () => {
      const recording = await record('functions.c', program('functions.c'));

      expect(
        stepsOf(recording),
        'functions.c: steps as function:line; once square returns, the next step is line 9, ' +
          'not line 8 (the call) again'
      ).toEqual(['main:7', 'main:8', 'square:2', 'square:3', 'main:9']);
    },
    CLANG_TIMEOUT
  );

  it(
    'steps over the C library, such as malloc',
    async () => {
      const recording = await record('linked_list.c', program('linked_list.c'));
      const prepend = ['prepend:9', 'prepend:10', 'prepend:11', 'prepend:12'];

      expect(
        stepsOf(recording),
        'linked_list.c: steps as function:line; no steps inside malloc, and after each prepend ' +
          "returns the next step is main's next line, not the line of the call again"
      ).toEqual([
        'main:16',
        'main:17',
        ...prepend,
        'main:18',
        ...prepend,
        'main:19',
        ...prepend,
        'main:20',
        'main:21',
      ]);
    },
    CLANG_TIMEOUT
  );

  it(
    'tells recursive calls apart by their depth',
    async () => {
      const source = [
        'int fact(int n) {', // 1
        '    if (n <= 1) {', // 2
        '        return 1;', // 3
        '    }', // 4
        '    return n * fact(n - 1);', // 5
        '}', // 6
        '', // 7
        'int main(void) {', // 8
        '    return fact(3) == 6 ? 0 : 1;', // 9
        '}', // 10
      ].join('\n');

      const recording = await record('fact.c', source);

      // fact has two returns, which clang joins on the closing brace (line 6),
      // so each call ends there, as it does in GDB. Once a call returns, the
      // next step is the caller's next line (its closing brace), not line 5
      // again; main has no line after the call, so the run ends.
      expect(
        recording.steps.map((step) => `${step.function}:${step.line}@${step.depth}`),
        'fact.c (fact(3)): steps as function:line@depth; after a call returns, the next step is ' +
          "the caller's closing brace, never line 5 (the call) again"
      ).toEqual([
        'main:9@0',
        'fact:2@1',
        'fact:5@1',
        'fact:2@2',
        'fact:5@2',
        'fact:2@3',
        'fact:3@3',
        'fact:6@3',
        'fact:6@2',
        'fact:6@1',
      ]);
      // Each call reads its own n, from its own frame.
      expect(
        recording.steps
          .filter((step) => step.function === 'fact')
          .map((step) => `${step.line}@${step.depth} n=${step.variables.n.value}`),
        'fact.c (fact(3)): n at each step in fact, as line@depth'
      ).toEqual([
        '2@1 n=3',
        '5@1 n=3',
        '2@2 n=2',
        '5@2 n=2',
        '2@3 n=1',
        '3@3 n=1',
        '6@3 n=1',
        '6@2 n=2',
        '6@1 n=3',
      ]);
    },
    CLANG_TIMEOUT
  );
});
