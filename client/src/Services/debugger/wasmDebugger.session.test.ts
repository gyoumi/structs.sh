import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DebuggerEvents } from './types';
import { WasmDebugger } from './wasmDebugger';
import type { Recording, RunEnd } from './wasm/recording';
import type { RecordResult } from './wasm/workerRunner';
import {
  COMPILED,
  compilerReturning,
  controlledCompiler,
  controlledRecorder,
  createEvents,
  flush,
  HELLO,
  HELLO_SOURCE,
  outputCalls,
  recorderReturning,
  startedDebugger,
  statesShown,
} from './__tests__/wasmDebuggerTestKit';

// A WasmDebugger session: compiling, replaying the recording one step at a
// time, and ending. Input is in wasmDebugger.input.test.ts and the compiler's
// loading status in wasmDebugger.compilerStatus.test.ts.

describe('WasmDebugger', () => {
  let events: DebuggerEvents;

  beforeEach(() => {
    events = createEvents();
  });

  it('compiles the user’s file', async () => {
    const compiler = compilerReturning(COMPILED);
    const wasm = new WasmDebugger(compiler);
    wasm.setEvents(events);

    wasm.start({ name: 'counter.c', code: 'int main(void) { return 0; }' });

    await vi.waitFor(() =>
      expect(compiler.compile, 'start(counter.c): compiler.compile calls').toHaveBeenCalledWith(
        'counter.c',
        'int main(void) { return 0; }'
      )
    );
  });

  it('starts a session when the program compiles', async () => {
    const wasm = new WasmDebugger(compilerReturning(COMPILED));
    wasm.setEvents(events);

    wasm.start({ name: 'counter.c', code: '' });

    await vi.waitFor(() =>
      expect(
        events.sessionStarted,
        'counter.c compiled: sessionStarted events'
      ).toHaveBeenCalledOnce()
    );
    expect(events.compileError, 'counter.c compiled: compileError events').not.toHaveBeenCalled();
  });

  it('reports compile errors and does not start a session', async () => {
    const errors = "main.c:2:13: error: use of undeclared identifier 'x'";
    const wasm = new WasmDebugger(compilerReturning({ ok: false, errors }));
    wasm.setEvents(events);

    wasm.start({ name: 'main.c', code: '' });

    await vi.waitFor(() =>
      expect(
        events.compileError,
        'main.c failed to compile: compileError events'
      ).toHaveBeenCalledWith([errors])
    );
    expect(
      events.sessionStarted,
      'main.c failed to compile: sessionStarted events'
    ).not.toHaveBeenCalled();
  });

  it('ignores an earlier compile that finishes after a newer one has started', async () => {
    const { compiler, finish } = controlledCompiler();
    const wasm = new WasmDebugger(compiler);
    wasm.setEvents(events);

    wasm.start({ name: 'main.c', code: 'int main(void) { return 0; }' });
    wasm.start({ name: 'main.c', code: 'int main(void) { return x; }' });
    finish(1, { ok: false, errors: 'main.c:1: error' });
    finish(0, { ok: true, wasm: new Uint8Array() });
    await flush();

    expect(
      events.compileError,
      'two compiles; the newer fails first, then the older succeeds: compileError events'
    ).toHaveBeenCalledExactlyOnceWith(['main.c:1: error']);
    expect(
      events.sessionStarted,
      'two compiles; the older one, which succeeded last, is stale: sessionStarted events'
    ).not.toHaveBeenCalled();
  });

  it('stops the compiler and reports nothing once closed', async () => {
    const { compiler, finish } = controlledCompiler();
    const wasm = new WasmDebugger(compiler);
    wasm.setEvents(events);

    wasm.start({ name: 'main.c', code: '' });
    wasm.close();
    finish(0, { ok: true, wasm: new Uint8Array() });
    await flush();

    expect(
      compiler.dispose,
      'close() during a compile: compiler.dispose calls'
    ).toHaveBeenCalledOnce();
    expect(
      events.sessionStarted,
      'close() during a compile that then succeeds: sessionStarted events'
    ).not.toHaveBeenCalled();
  });

  it('replays the recording one statement per step, with the output each statement printed', async () => {
    const wasm = await startedDebugger(events, recorderReturning(HELLO));

    expect(await wasm.step(), 'hello.c (2 recorded steps): 1st step() result').toBe(true);
    expect(events.state, 'hello.c, 1st step(): the state sent').toHaveBeenLastCalledWith({
      location: {
        fileName: 'hello.c',
        lineText: '    puts("hi");',
        lineNumber: 2,
        function: 'main',
      },
      variables: {},
      heap: {},
    });
    expect(
      events.output,
      'hello.c, 1st step(), on puts("hi") which hasn\'t run yet: output events'
    ).not.toHaveBeenCalled();

    // puts has now run, so its output shows with the next line.
    expect(await wasm.step(), 'hello.c: 2nd step() result').toBe(true);
    expect(
      outputCalls(events),
      'hello.c, 2nd step(), after puts ran: output events, with all their arguments'
    ).toEqual([['hi\n']]);
    expect(
      vi.mocked(events.state).mock.lastCall?.[0].location,
      'hello.c, 2nd step(): location of the state sent'
    ).toMatchObject({ lineNumber: 3 });
    expect(
      events.sessionEnded,
      'hello.c, on the last recorded step: sessionEnded events'
    ).not.toHaveBeenCalled();
  });

  it('sends each step’s variables, and the struct types before the first step', async () => {
    const node = {
      typeName: 'struct node',
      fields: [
        { name: 'value', typeName: 'int' },
        { name: 'next', typeName: 'struct node *' },
      ],
    };
    const list = { addr: '0x10ff8', typeName: 'struct node *', value: '0x11010' };
    const heap = {
      '0x11010': {
        addr: '0x11010',
        typeName: 'struct node',
        value: {
          value: { typeName: 'int', value: 1 },
          next: { typeName: 'struct node *', value: '0x0' },
        },
      },
    };
    const recording: Recording = {
      ...HELLO,
      steps: [{ ...HELLO.steps[0], variables: { list }, heap }],
      types: [node],
    };
    const wasm = await startedDebugger(events, recorderReturning(recording), 'list.c');

    await wasm.step();

    expect(
      events.typeDeclaration,
      'list.c, a recording with struct node: typeDeclaration events'
    ).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(node));
    expect(
      vi.mocked(events.state).mock.lastCall?.[0].variables,
      'list.c, 1st step(): variables of the state sent'
    ).toEqual({ list });
    expect(
      vi.mocked(events.state).mock.lastCall?.[0].heap,
      'list.c, 1st step(): heap of the state sent'
    ).toEqual(heap);
    expect(
      vi.mocked(events.typeDeclaration).mock.invocationCallOrder[0],
      'list.c: call order of the first typeDeclaration, which should come before the first state'
    ).toBeLessThan(vi.mocked(events.state).mock.invocationCallOrder[0]);
  });

  it('ends the session after the last step, saying how the program ended', async () => {
    const wasm = await startedDebugger(events, recorderReturning(HELLO));

    await wasm.step();
    await wasm.step();
    expect(await wasm.step(), 'hello.c (2 recorded steps): 3rd step() result').toBe(false);

    expect(events.state, 'hello.c, stepped 3 times: state events').toHaveBeenCalledTimes(2);
    expect(
      events.output,
      'hello.c, stepped past the end of a run that exited with 0: last output'
    ).toHaveBeenLastCalledWith(expect.stringContaining('exit code 0'));
    expect(
      events.sessionEnded,
      'hello.c, stepped past the end: sessionEnded events'
    ).toHaveBeenCalledOnce();

    expect(await wasm.step(), 'hello.c, after the session ended: 4th step() result').toBe(false);
    expect(
      events.sessionEnded,
      'hello.c, stepped again after the session ended: sessionEnded events'
    ).toHaveBeenCalledOnce();
  });

  it('shows output printed before the first statement with the first step', async () => {
    const wasm = await startedDebugger(
      events,
      recorderReturning({ ...HELLO, outputBeforeFirstStep: 'early\n' })
    );

    await wasm.step();

    expect(
      outputCalls(events),
      'hello.c with "early\\n" printed before the first statement, 1st step(): output events, with all their arguments'
    ).toEqual([['early\n']]);
  });

  it.each([
    [{ crashed: 'unreachable' }, /crashed.*unreachable/],
    [{ stepLimit: 100_000 }, /stopped after .*100,000/],
    [{ timeLimit: 10_000 }, /stopped .*too long/],
    [{ sizeLimit: 50_000_000 }, /stopped .*too much/],
  ] satisfies [RunEnd, RegExp][])(
    'says how a program that ended with %o ended',
    async (end, message) => {
      const wasm = await startedDebugger(events, recorderReturning({ ...HELLO, end }));
      const what = `hello.c, a run that ended with ${JSON.stringify(end)}, stepped past its 2 steps`;

      await wasm.step();
      await wasm.step();
      await wasm.step();

      expect(events.output, `${what}: last output`).toHaveBeenLastCalledWith(
        expect.stringMatching(message)
      );
      expect(events.sessionEnded, `${what}: sessionEnded events`).toHaveBeenCalledOnce();
    }
  );

  it.each([
    [{ timedOut: true }, /stopped .*too long/],
    [{ error: 'invalid module' }, /invalid module/],
  ] satisfies [RecordResult, RegExp][])(
    'ends the session straight away when there is no recording (%o)',
    async (result, message) => {
      const wasm = new WasmDebugger(compilerReturning(COMPILED), async () => result);
      wasm.setEvents(events);
      const what = `loop.c, the recorder gave ${JSON.stringify(result)} and no recording`;

      wasm.start({ name: 'loop.c', code: '' });
      await flush();

      expect(events.output, `${what}: output`).toHaveBeenCalledWith(expect.stringMatching(message));
      expect(events.sessionEnded, `${what}: sessionEnded events`).toHaveBeenCalledOnce();
      expect(await wasm.step(), `${what}: step() result`).toBe(false);
    }
  );

  it('waits for the recording to finish before the first step', async () => {
    const { recorder, finish } = controlledRecorder();
    const wasm = await startedDebugger(events, recorder);

    const step = wasm.step();
    await flush();
    expect(
      events.state,
      'hello.c, step() while still recording: state events'
    ).not.toHaveBeenCalled();

    finish(0, { recording: HELLO });
    expect(await step, 'hello.c, the recording then finished: that step() result').toBe(true);
    expect(
      events.state,
      'hello.c, the recording then finished: state events'
    ).toHaveBeenCalledOnce();
  });

  it('steps through the newest program after compiling again', async () => {
    const recordings = [HELLO, { ...HELLO, steps: [{ ...HELLO.steps[1], line: 1 }] }];
    const wasm = await startedDebugger(events, async () => ({ recording: recordings.shift()! }));
    await wasm.step();
    wasm.start({ name: 'hello.c', code: HELLO_SOURCE });
    await flush();
    await wasm.step();

    expect(
      statesShown(events).at(-1),
      `hello.c, compiled again (the new recording starts on line 1), 1st step(): state sent (all: ${statesShown(events).join(', ')})`
    ).toBe('main:1');
  });

  it('does not record a program that fails to compile', async () => {
    const recorder = vi.fn(recorderReturning(HELLO));
    const wasm = new WasmDebugger(compilerReturning({ ok: false, errors: 'oops' }), recorder);
    wasm.setEvents(events);

    wasm.start({ name: 'main.c', code: '' });
    await flush();

    expect(recorder, 'main.c failed to compile: recorder calls').not.toHaveBeenCalled();
  });

  it('stops the recording when compiling again, interrupting, or closing', async () => {
    const { recorder, signals } = controlledRecorder();
    const wasm = new WasmDebugger(compilerReturning(COMPILED), recorder);
    wasm.setEvents(events);

    wasm.start({ name: 'loop.c', code: '' });
    await flush();
    wasm.start({ name: 'loop.c', code: '' });
    await flush();
    expect(
      signals.map((signal) => signal.aborted),
      'loop.c compiled twice while recording: whether each recording was aborted'
    ).toEqual([true, false]);

    wasm.interrupt();
    expect(signals[1].aborted, 'interrupt() while recording: 2nd recording aborted').toBe(true);

    wasm.start({ name: 'loop.c', code: '' });
    await flush();
    wasm.close();
    expect(signals[2].aborted, 'close() while recording: 3rd recording aborted').toBe(true);
  });

  it('ends the session when the program is interrupted while it is being recorded', async () => {
    const { recorder } = controlledRecorder();
    const wasm = await startedDebugger(events, recorder, 'loop.c', '');

    wasm.interrupt();
    await flush();

    expect(events.output, 'loop.c, interrupt() while recording: output').toHaveBeenCalledWith(
      expect.stringMatching(/stopped/)
    );
    expect(
      events.sessionEnded,
      'loop.c, interrupt() while recording: sessionEnded events'
    ).toHaveBeenCalledOnce();
  });

  it('does not record a program whose compile was interrupted', async () => {
    const { compiler, finish } = controlledCompiler();
    const recorder = vi.fn(recorderReturning(HELLO));
    const wasm = new WasmDebugger(compiler, recorder);
    wasm.setEvents(events);

    wasm.start({ name: 'main.c', code: '' });
    wasm.interrupt();
    finish(0, COMPILED);
    await flush();

    expect(
      recorder,
      'main.c, interrupt() during its compile, which then succeeded: recorder calls'
    ).not.toHaveBeenCalled();
    expect(
      events.sessionStarted,
      'main.c, interrupt() during its compile, which then succeeded: sessionStarted events'
    ).not.toHaveBeenCalled();
  });
});
