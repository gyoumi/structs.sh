import { describe, expect, it } from 'vitest';
import type { Recording, Step } from './recording';
import { CLANG_TIMEOUT, outputOf, program, record, stepsOf } from './__tests__/recordingTestKit';

// What a recording does with stdin: it reads the input typed so far, and
// stops where the program waits for more. Typing more records it again.

/** Where a waiting recording says the program is paused, if it says. */
const pausedAt = (recording: Recording) => (recording.end as { at?: Step }).at;

const SLOT_SOURCE = [
  '#include <stdio.h>', // 1
  'int slot(void) {', // 2
  '    return 1;', // 3
  '}', // 4
  'int main(void) {', // 5
  '    int values[2] = {0, 0};', // 6
  '    scanf("%d", &values[slot()]);', // 7: slot() returns, then scanf waits
  '    return values[1];', // 8
  '}', // 9
].join('\n');

describe('recordRun: input', () => {
  it(
    'says where it is paused when it waits in the caller right after a call returned',
    async () => {
      const recording = await record('slot.c', SLOT_SOURCE);
      const steps = stepsOf(recording).join(', ');
      const at = pausedAt(recording);

      expect(recording.end, `slot.c with no input: end (steps: ${steps})`).toEqual({
        waitingForInput: true,
        at: expect.anything(),
      });
      expect(
        at && `${at.function}:${at.line}@${at.depth}`,
        `slot.c waits in scanf on main's line 7 after slot() returned: end.at as function:line@depth (steps: ${steps})`
      ).toBe('main:7@0');
      expect(at?.variables.values?.value, "slot.c: values in end.at's variables").toEqual([0, 0]);
      expect(
        recording.steps.at(-1)?.function,
        `slot.c: the last recorded step is still slot()'s; end.at is not added as a step (steps: ${steps})`
      ).toBe('slot');
    },
    CLANG_TIMEOUT
  );

  it(
    'says nothing more when it waits in a call that has a step on that line',
    async () => {
      // slot() returns on line 7, and main then has a step of its own on
      // line 8, where scanf waits.
      const ownLine = SLOT_SOURCE.replace(
        '    scanf("%d", &values[slot()]);',
        '    int i = slot();\n    scanf("%d", &values[i]);'
      );

      const recording = await record('own_line.c', ownLine);

      expect(
        recording.end,
        `slot.c with slot() on a line before the scanf, no input: end should have no "at" (steps: ${stepsOf(recording).join(', ')})`
      ).toEqual({ waitingForInput: true });
    },
    CLANG_TIMEOUT
  );

  it(
    'keeps the steps a full run has, so stepping by index carries on after the input arrives',
    async () => {
      const waiting = await record('slot.c', SLOT_SOURCE);
      const full = await record('slot.c', SLOT_SOURCE, { input: { text: '5\n', eof: true } });

      expect(full.end, 'slot.c given "5\\n" and end-of-file: end').toEqual({ exitCode: 5 });
      expect(
        stepsOf(waiting),
        `slot.c: steps while waiting, against the first steps of the run given "5" (full run: ${stepsOf(full).join(', ')})`
      ).toEqual(stepsOf(full).slice(0, waiting.steps.length));
      expect(
        stepsOf(full)[waiting.steps.length],
        `slot.c given "5": the step after the ones recorded while waiting (waiting: ${stepsOf(waiting).join(', ')}; full: ${stepsOf(full).join(', ')})`
      ).toBe('main:8');
    },
    CLANG_TIMEOUT
  );

  it(
    'stops where the program waits for input it has not been given',
    async () => {
      const recording = await record('sum_input.c', program('sum_input.c'));

      expect(recording.end, 'sum_input.c (a plain scanf loop), no input: end').toEqual({
        waitingForInput: true,
      });
      expect(
        stepsOf(recording).at(-1),
        `sum_input.c, no input: the last step, where scanf waits (steps: ${stepsOf(recording).join(', ')})`
      ).toBe('main:6');
    },
    CLANG_TIMEOUT
  );

  it(
    'reads the input typed so far, then waits for more',
    async () => {
      const recording = await record('sum_input.c', program('sum_input.c'), {
        input: { text: '2\n3\n', eof: false },
      });
      const totals = recording.steps
        .filter((step) => step.line === 6)
        .map((step) => step.variables.total.value);

      expect(recording.end, 'sum_input.c given "2\\n3\\n", no end-of-file: end').toEqual({
        waitingForInput: true,
      });
      expect(totals, 'sum_input.c given "2\\n3\\n": total at each step on line 6').toEqual([
        0, 2, 5,
      ]);
    },
    CLANG_TIMEOUT
  );

  it(
    'gives each read one line at most, as a terminal does',
    async () => {
      // Typing "a" then "b" re-records with both lines. The first read must
      // still get only "a", or the run differs from the one already shown.
      const source = [
        '#include <stdio.h>',
        '#include <unistd.h>',
        'int main(void) {',
        '    char first[16] = {0};',
        '    char second[16] = {0};',
        '    read(0, first, 15);',
        '    read(0, second, 15);',
        '    printf("[%s][%s]", first, second);',
        '    return 0;',
        '}',
      ].join('\n');

      const recording = await record('reads.c', source, {
        input: { text: 'a\nb\n', eof: false },
      });

      expect(recording.end, 'reads.c (two read(0, buf, 15) calls) given "a\\nb\\n": end').toEqual({
        exitCode: 0,
      });
      expect(
        outputOf(recording),
        'reads.c given "a\\nb\\n": output, printing what each read got as [first][second]'
      ).toBe('[a\n][b\n]');
    },
    CLANG_TIMEOUT
  );

  it(
    'returns from a read of no bytes without waiting, as a terminal does',
    async () => {
      const source = [
        '#include <stdio.h>',
        '#include <unistd.h>',
        'int main(void) {',
        '    char c;',
        '    printf("%d", (int)read(0, &c, 0));',
        '    return 0;',
        '}',
      ].join('\n');

      const recording = await record('empty_read.c', source);

      expect(recording.end, 'empty_read.c (read(0, &c, 0)), no input: end').toEqual({
        exitCode: 0,
      });
      expect(outputOf(recording), 'empty_read.c: output, printing what read returned').toBe('0');
    },
    CLANG_TIMEOUT
  );

  it(
    'keeps half a character back while waiting for input',
    async () => {
      // "é" is two bytes in UTF-8, written either side of the read.
      const source = [
        '#include <unistd.h>',
        'int main(void) {',
        '    char c;',
        '    write(1, "\\xc3", 1);',
        '    read(0, &c, 1);',
        '    write(1, "\\xa9", 1);',
        '    return 0;',
        '}',
      ].join('\n');

      const waiting = await record('split.c', source);
      const done = await record('split.c', source, { input: { text: 'x', eof: true } });

      expect(
        waiting.end,
        'split.c (writes é a byte at a time around a read), no input: end'
      ).toEqual({ waitingForInput: true });
      expect(
        outputOf(waiting),
        "split.c, no input: output while waiting, which shouldn't show é's first byte alone"
      ).toBe('');
      expect(outputOf(done), 'split.c given "x" and end-of-file: output').toBe('é');
    },
    CLANG_TIMEOUT
  );

  it(
    'reads to the end of the input once end-of-file is sent',
    async () => {
      const recording = await record('sum_input.c', program('sum_input.c'), {
        input: { text: '2\n3\n', eof: true },
      });

      expect(recording.end, 'sum_input.c given "2\\n3\\n" and end-of-file: end').toEqual({
        exitCode: 0,
      });
      expect(outputOf(recording), 'sum_input.c given "2\\n3\\n" and end-of-file: output').toBe(
        'total 5\n'
      );
    },
    CLANG_TIMEOUT
  );
});
