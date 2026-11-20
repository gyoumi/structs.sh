import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DebuggerEvents } from './types';
import type { Recorder } from './wasmDebugger';
import type { Recording, Step } from './wasm/recording';
import {
  createEvents,
  flush,
  HELLO,
  outputCalls,
  startedDebugger,
  statesShown,
} from './__tests__/wasmDebuggerTestKit';

// A WasmDebugger session whose program reads stdin: typing a line records the
// run again with the input so far, and stepping carries on from where it was.

describe('WasmDebugger input', () => {
  let events: DebuggerEvents;

  beforeEach(() => {
    events = createEvents();
  });

  const PROMPT_STEP = { ...HELLO.steps[1], output: 'Number: ' };
  /** Waits after printing a prompt, until input arrives. */
  const WAITING: Recording = {
    ...HELLO,
    steps: [HELLO.steps[0], PROMPT_STEP],
    end: { waitingForInput: true },
  };
  const FINISHED: Recording = {
    ...HELLO,
    steps: [HELLO.steps[0], PROMPT_STEP, { ...HELLO.steps[1], line: 4 }],
  };

  /** A recorder that finishes once it's given input, and notes what it was given. */
  const inputRecorder = () => {
    const inputs: { text: string; eof: boolean }[] = [];
    const recorder: Recorder = async (_wasm, { input }) => {
      inputs.push(input);
      return { recording: input.text || input.eof ? FINISHED : WAITING };
    };
    return { recorder, inputs };
  };

  it('stays in the session while the program waits, and carries on once input is typed', async () => {
    const { recorder, inputs } = inputRecorder();
    const wasm = await startedDebugger(events, recorder, 'sum.c');
    const what = 'sum.c (prints "Number: " on its 2nd step, then waits for input)';

    expect(await wasm.step(), `${what}: 1st step() result`).toBe(true);
    expect(await wasm.step(), `${what}: 2nd step() result`).toBe(true);
    // Waiting: nothing more to show, but the session goes on, and the
    // prompt is shown once however often step is clicked.
    expect(await wasm.step(), `${what}, waiting: 3rd step() result`).toBe(false);
    expect(await wasm.step(), `${what}, waiting: 4th step() result`).toBe(false);
    expect(events.sessionEnded, `${what}, waiting: sessionEnded events`).not.toHaveBeenCalled();
    expect(
      outputCalls(events),
      `${what}, waiting: output events, with all their arguments`
    ).toEqual([['hi\n'], ['Number: ']]);

    wasm.sendStdin('5');
    expect(inputs.at(-1), `${what}, sendStdin('5'): input the recorder was given`).toEqual({
      text: '5\n',
      eof: false,
    });

    expect(await wasm.step(), `${what}, given "5": next step() result`).toBe(true);
    expect(
      statesShown(events).at(-1),
      `${what}, given "5": state sent by that step (all: ${statesShown(events).join(', ')})`
    ).toBe('main:4');
    expect(await wasm.step(), `${what}, given "5": step() past the last step`).toBe(false);
    expect(
      events.sessionEnded,
      `${what}, given "5", run to the end: sessionEnded events`
    ).toHaveBeenCalledOnce();
    expect(
      outputCalls(events).slice(0, 2),
      `${what}, given "5": the first two output events, with all their arguments, which shouldn't repeat after the re-recording`
    ).toEqual([['hi\n'], ['Number: ']]);
  });

  it('shows output the waiting statement prints once its input arrives', async () => {
    // printf("%c\n", getchar()): the statement waits, then prints.
    const waiting: Recording = { ...WAITING, steps: [HELLO.steps[0], HELLO.steps[1]] };
    const finished: Recording = {
      ...FINISHED,
      steps: [HELLO.steps[0], { ...HELLO.steps[1], output: 'a\n' }, FINISHED.steps[2]],
    };
    const recorder: Recorder = async (_wasm, { input }) => ({
      recording: input.text ? finished : waiting,
    });
    const wasm = await startedDebugger(events, recorder, 'echo.c');

    await wasm.step();
    await wasm.step();
    expect(await wasm.step(), 'echo.c, waiting on its 2nd step: 3rd step() result').toBe(false);
    wasm.sendStdin('a');
    expect(await wasm.step(), 'echo.c, given "a": next step() result').toBe(true);

    expect(
      outputCalls(events),
      'echo.c, given "a": output events, with all their arguments, including the "a\\n" the waiting statement printed'
    ).toEqual([['hi\n'], ['a\n']]);
  });

  it('ends the session on Ctrl+C while the program waits, and ignores input after', async () => {
    const { recorder, inputs } = inputRecorder();
    const wasm = await startedDebugger(events, recorder, 'sum.c');
    await wasm.step();
    await wasm.step();
    await wasm.step();

    wasm.interrupt();
    await flush();
    wasm.sendStdin('5');

    expect(
      events.sessionEnded,
      'sum.c, interrupt() while waiting: sessionEnded events'
    ).toHaveBeenCalledOnce();
    expect(events.output, 'sum.c, interrupt() while waiting: last output').toHaveBeenLastCalledWith(
      expect.stringMatching(/stopped/)
    );
    expect(
      inputs.length,
      'sum.c, sendStdin("5") after interrupt(): recordings made (only the first, with no input)'
    ).toBe(1);
    expect(await wasm.step(), 'sum.c, after interrupt(): step() result').toBe(false);
  });

  describe('paused right after a call returned', () => {
    // scanf("%d", &values[slot()]) on line 7: slot() returns, then scanf
    // waits, so main has no step of its own yet. The recorder says where it
    // is paused in end.at.
    const stepOn = (
      fn: string,
      line: number,
      depth: number,
      variables: Step['variables'] = {}
    ): Step => ({
      function: fn,
      line,
      depth,
      output: '',
      variables,
      heap: {},
    });
    const VALUES = { values: { addr: '0x1000', typeName: 'int [2]', value: [0, 0] } };
    const AT = stepOn('main', 7, 0, VALUES);
    const FULL_STEPS = [
      stepOn('main', 6, 0),
      stepOn('main', 7, 0, VALUES),
      stepOn('slot', 3, 1),
      stepOn('main', 8, 0, { values: { ...VALUES.values, value: [0, 5] } }),
    ];
    /** The run before any input: the full run's first steps, paused at AT. */
    const PAUSED: Recording = {
      ...HELLO,
      steps: FULL_STEPS.slice(0, 3),
      end: { waitingForInput: true, at: AT },
    };
    const FULL: Recording = { ...HELLO, steps: FULL_STEPS, end: { exitCode: 5 } };
    const pausedRecorder: Recorder = async (_wasm, { input }) => ({
      recording: input.text || input.eof ? FULL : PAUSED,
    });

    // The page moves to a new state only when step() resolves true, so the
    // paused state counts as the next state once, but not as a recorded step.
    it('shows where the program is paused, once, when stepping past the last step while it waits', async () => {
      const wasm = await startedDebugger(events, pausedRecorder, 'slot.c');

      const stepped = [await wasm.step(), await wasm.step(), await wasm.step()];
      expect(
        stepped,
        'slot.c paused at main:7 after 3 steps: step() results for the 3 recorded steps'
      ).toEqual([true, true, true]);
      expect(
        await wasm.step(),
        'slot.c, no input yet: 4th step(), past the 3 recorded steps while waiting with end.at = main:7, should resolve true (it sent the paused state)'
      ).toBe(true);
      expect(
        statesShown(events),
        'slot.c: states shown after stepping past the last step while waiting; the paused state main:7 (end.at) should follow slot:3'
      ).toEqual(['main:6', 'main:7', 'slot:3', 'main:7']);
      expect(
        Object.keys(vi.mocked(events.state).mock.lastCall?.[0].variables ?? {}),
        "slot.c: variables in the paused state shown (end.at's)"
      ).toEqual(['values']);

      expect(
        await wasm.step(),
        'slot.c, no input yet: 5th step(), again while still waiting after the paused state was shown, should resolve false (nothing new)'
      ).toBe(false);
      expect(
        statesShown(events),
        'slot.c: states shown after stepping again while waiting (nothing new)'
      ).toEqual(['main:6', 'main:7', 'slot:3', 'main:7']);
      expect(
        events.sessionEnded,
        'slot.c: sessionEnded while waiting for input'
      ).not.toHaveBeenCalled();
    });

    it('after the input arrives, the next step is the full run’s next step, none skipped or repeated', async () => {
      const wasm = await startedDebugger(events, pausedRecorder, 'slot.c');
      await wasm.step();
      await wasm.step();
      await wasm.step();
      await wasm.step(); // past the last step: shows the paused state

      wasm.sendStdin('5');

      expect(await wasm.step(), 'slot.c given "5" after pausing: step() result').toBe(true);
      expect(
        statesShown(events).at(-1),
        `slot.c given "5" after pausing: state shown by the next step should be the full run's 4th step, main:8 (states shown: ${statesShown(events).join(', ')})`
      ).toBe('main:8');
      expect(
        statesShown(events).filter((state) => state === 'slot:3'),
        `slot.c: times slot:3 was shown (states shown: ${statesShown(events).join(', ')})`
      ).toHaveLength(1);
      expect(
        await wasm.step(),
        'slot.c given "5": step() after the last step of the full run'
      ).toBe(false);
      expect(
        events.sessionEnded,
        'slot.c given "5": sessionEnded after the last step'
      ).toHaveBeenCalledOnce();
    });
  });

  it('sends end-of-file, keeping the input typed before it', async () => {
    const { recorder, inputs } = inputRecorder();
    const wasm = await startedDebugger(events, recorder, 'sum.c');

    wasm.sendStdin('1');
    wasm.sendStdin('2');
    wasm.sendEOF();

    expect(
      inputs,
      'sum.c, sendStdin("1"), sendStdin("2"), then sendEOF(): the input each recording was given'
    ).toEqual([
      { text: '', eof: false },
      { text: '1\n', eof: false },
      { text: '1\n2\n', eof: false },
      { text: '1\n2\n', eof: true },
    ]);
  });
});
