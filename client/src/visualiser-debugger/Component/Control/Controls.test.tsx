// @vitest-environment jsdom
import '@/test/setup';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useDebuggerStore } from '@/Services/debugger/debuggerStore';
import { useCompilerStatusStore } from '@/Services/debugger/compilerStatusStore';
import type { Debugger, DebuggerEvents } from '@/Services/debugger/types';
import { useFrontendStateStore } from '@/visualiser-debugger/Store/frontendStateStore';
import { useGlobalStore } from '@/visualiser-debugger/Store/globalStateStore';
import { useToastStateStore } from '@/visualiser-debugger/Store/toastStateStore';
import { useUserFsStateStore } from '@/visualiser-debugger/Store/userFsStateStore';
import { onboardingStore } from '@/visualiser-debugger/Store/onboardingStore';
import type { ProgramState } from '@/visualiser-debugger/Types/programState';
import Controls from './Controls';

// The step controls under the debugger's editor: Compile, Play (buffer 30
// steps ahead), Step back (Undo icon), Step forward (Redo icon) and the
// timeline slider. They are rendered against a fake debugger whose step()
// stays unanswered until the test answers it, so a test can look at the
// controls while a step is in flight. States reach the timeline the way the
// real debugger sends them: through the events useDebugger gives it.

const BUFFER = 30;

/** A debugger whose step() requests wait until the test answers them. */
class FakeDebugger implements Debugger {
  events: DebuggerEvents | null = null;

  /** How many times step() has been called. */
  steps = 0;

  private waiting: ((gotState: boolean) => void)[] = [];

  private line = 1;

  setEvents(events: DebuggerEvents) {
    this.events = events;
  }

  start() {}

  step() {
    this.steps += 1;
    return new Promise<boolean>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  /** Step requests made and not yet answered. */
  get pending() {
    return this.waiting.length;
  }

  /** Sends the next program state through the events, as the real debugger does. */
  emitState() {
    if (!this.events) throw new Error('test setup: Controls never gave the debugger its events');
    const line = this.line++;
    const location = { fileName: 'main.c', lineText: '', lineNumber: line, function: 'main' };
    const state: ProgramState = { location, variables: {}, heap: {} };
    this.events.state(state);
  }

  /** Answers the oldest step request: with a new state (true), or with none (false). */
  answer(withState = true) {
    const resolve = this.waiting.shift();
    if (!resolve) throw new Error('test setup: answer() called with no step request waiting');
    if (withState) this.emitState();
    resolve(withState);
  }

  sendStdin() {}

  sendEOF() {}

  interrupt() {}

  close() {}
}

// Every store Controls reads or writes, with its state before any test, put back after each.
const stores = [
  useFrontendStateStore,
  useGlobalStore,
  useToastStateStore,
  useCompilerStatusStore,
  useDebuggerStore,
  useUserFsStateStore,
  onboardingStore,
] as { getState(): object; setState(state: object, replace: true): void }[];
const initialStates = stores.map((store) => store.getState());

let fake: FakeDebugger;
/** Every toast text shown since the test started, in order. */
let toasts: string[];
let stopRecordingToasts: () => void;

beforeEach(() => {
  fake = new FakeDebugger();
  useDebuggerStore.setState({ activeDebugger: fake });
  toasts = [];
  stopRecordingToasts = useToastStateStore.subscribe((state, previous) => {
    const message = state.currentToastMessage;
    if (message && message !== previous.currentToastMessage) toasts.push(String(message.content));
  });
});

afterEach(() => {
  stopRecordingToasts();
  stores.forEach((store, i) => store.setState(initialStates[i], true));
});

// What the user sees.

const buttonWith = (testId: string) => {
  const button = screen.getByTestId(testId).closest('button');
  if (!button) throw new Error(`no button around the ${testId} icon`);
  return button;
};
const stepForwardButton = () => buttonWith('RedoIcon');
const stepBackButton = () => buttonWith('UndoIcon');
const compileButton = () => screen.getByRole('button', { name: 'Compile' });
/** The Play button, whether it shows the play icon or the spinner. */
const playButton = () => {
  const inside = screen.queryByTestId('PlayArrowIcon') ?? screen.queryByRole('progressbar');
  const button = inside?.closest('button');
  if (!button) throw new Error('found neither the PlayArrow icon nor the spinner inside a button');
  return button;
};
const spinnerShown = () => screen.queryByRole('progressbar') !== null;
const playIconShown = () => screen.queryByTestId('PlayArrowIcon') !== null;
const slider = () => screen.getByRole('slider');

/** The timeline position the user sees: "state <index> of <count fetched>". */
const view = () => {
  const { currentIndex, states } = useFrontendStateStore.getState();
  return `state ${currentIndex} of ${states.length} fetched`;
};
const at = (index: number, fetched: number) => `state ${index} of ${fetched} fetched`;

// Driving the session.

/** Renders Controls, starts a session, fetches `fetched` states and shows the one at `index`. */
const startSession = (fetched: number, index: number) => {
  render(<Controls />);
  act(() => {
    if (!fake.events) throw new Error('test setup: Controls never gave the debugger its events');
    fake.events.sessionStarted();
    for (let i = 0; i < fetched; i++) fake.emitState();
    useFrontendStateStore.getState().jumpToState(index);
  });
  toasts.length = 0;
};

const endSession = () =>
  act(() => {
    fake.events?.sessionEnded();
  });

const click = (button: HTMLElement) =>
  act(() => {
    fireEvent.click(button);
  });

/** Waits until the controls have a step request waiting, then answers it. */
const answerNextStep = async (withState = true, where = '') => {
  await waitFor(() => {
    if (fake.pending === 0) {
      throw new Error(
        `${where}: expected a step request waiting for an answer, but none is (step() called ${fake.steps} times)`
      );
    }
  });
  await act(async () => {
    fake.answer(withState);
  });
};

/** Answers buffer steps from+1 to `to` (of 30), one request at a time. */
const answerBuffer = async (from: number, to: number, withState = true) => {
  for (let i = from; i < to; i++) {
    // eslint-disable-next-line no-await-in-loop
    await answerNextStep(withState, `buffer step ${i + 1} of ${BUFFER}`);
  }
};

/** Lets any queued promise callbacks and effects run. */
const settle = () => act(async () => {});

describe('step forward (Redo icon)', () => {
  test('before the latest state it moves to the next fetched state at once, without asking the debugger', async () => {
    startSession(3, 0);
    await click(stepForwardButton());
    expect(view(), '3 states fetched, at state 0, clicked step forward').toBe(at(1, 3));
    await settle();
    expect(fake.steps, 'step forward through a fetched state should not call debugger.step()').toBe(
      0
    );
  });

  test('at the latest state it asks for one step, disables both step buttons until the answer, then shows the new state', async () => {
    startSession(2, 1);
    await click(stepForwardButton());
    await settle();
    expect(
      fake.steps,
      '2 fetched, at the latest (1), clicked step forward: debugger.step() calls'
    ).toBe(1);
    expect(
      stepForwardButton().disabled,
      'step forward while its step request is in flight: disabled?'
    ).toBe(true);
    expect(
      stepBackButton().disabled,
      'step back while a step request is in flight: disabled?'
    ).toBe(true);
    expect(view(), 'while the step is in flight the view stays put').toBe(at(1, 2));
    await answerNextStep(true, 'step forward at the latest state');
    expect(view(), 'after the debugger answers with a new state, the view moves to it').toBe(
      at(2, 3)
    );
    expect(
      stepForwardButton().disabled,
      'step forward after the answer (session active): disabled?'
    ).toBe(false);
    expect(stepBackButton().disabled, 'step back after the answer, at state 2: disabled?').toBe(
      false
    );
  });

  test('at the latest state, when the debugger answers with no state, the view stays and both buttons come back', async () => {
    startSession(2, 1);
    await click(stepForwardButton());
    await answerNextStep(false, 'step forward at the latest state');
    expect(view(), 'step() answered false (no new state): the view').toBe(at(1, 2));
    expect(stepForwardButton().disabled, 'step forward after a no-state answer: disabled?').toBe(
      false
    );
    expect(
      stepBackButton().disabled,
      'step back after a no-state answer, at state 1: disabled?'
    ).toBe(false);
  });

  test('after the session ends it is disabled at the latest state and still works before it', async () => {
    startSession(3, 2);
    endSession();
    expect(
      stepForwardButton().disabled,
      'session ended, at the latest state (2 of 3): disabled?'
    ).toBe(true);
    act(() => useFrontendStateStore.getState().jumpToState(1));
    expect(
      stepForwardButton().disabled,
      'session ended, at state 1 of 3 (not latest): disabled?'
    ).toBe(false);
    await click(stepForwardButton());
    expect(view(), 'session ended, clicked step forward at state 1').toBe(at(2, 3));
    expect(fake.steps, 'session ended: debugger.step() calls').toBe(0);
  });
});

describe('step back (Undo icon)', () => {
  test('moves to the previous state and is disabled at the first state', async () => {
    startSession(3, 2);
    expect(stepBackButton().disabled, 'at state 2 of 3: disabled?').toBe(false);
    await click(stepBackButton());
    expect(view(), 'clicked step back at state 2').toBe(at(1, 3));
    await click(stepBackButton());
    expect(view(), 'clicked step back at state 1').toBe(at(0, 3));
    expect(stepBackButton().disabled, 'at the first state (0 of 3): disabled?').toBe(true);
  });
});

describe('play (PlayArrow icon)', () => {
  test('is disabled before a session starts and after it ends', () => {
    render(<Controls />);
    expect(playButton().disabled, 'no session started: Play disabled?').toBe(true);
    act(() => fake.events?.sessionStarted());
    expect(playButton().disabled, 'session started: Play disabled?').toBe(false);
    endSession();
    expect(playButton().disabled, 'session ended: Play disabled?').toBe(true);
  });

  test.each([
    { fetched: 1, index: 0, ahead: 0 },
    { fetched: 29, index: 0, ahead: 28 },
    { fetched: 10, index: 5, ahead: 4 },
  ])(
    'with $ahead states fetched ahead ($fetched fetched, at $index) it starts a buffer: spinner and "Buffer started."',
    async ({ fetched, index, ahead }) => {
      startSession(fetched, index);
      await click(playButton());
      await settle();
      const where = `${ahead} states ahead, clicked Play`;
      expect(spinnerShown(), `${where}: spinner (role progressbar) shown`).toBe(true);
      expect(playIconShown(), `${where}: PlayArrow icon shown`).toBe(false);
      expect(toasts, `${where}: toasts shown`).toEqual(['Buffer started.']);
      expect(fake.steps, `${where}: debugger.step() calls so far`).toBe(1);
    }
  );

  test('a buffer fetches exactly 30 steps, one at a time, then shows "Buffer completed." and the play icon', async () => {
    startSession(1, 0);
    await click(playButton());
    await answerBuffer(0, BUFFER - 1);
    expect(spinnerShown(), 'after 29 of 30 buffer steps answered: spinner shown').toBe(true);
    expect(toasts, 'after 29 of 30 buffer steps answered: toasts').toEqual(['Buffer started.']);
    await answerBuffer(BUFFER - 1, BUFFER);
    await settle();
    expect(fake.steps, 'buffer finished: debugger.step() calls in total').toBe(BUFFER);
    expect(fake.pending, 'buffer finished: step requests still waiting').toBe(0);
    expect(toasts, 'buffer finished: toasts').toEqual(['Buffer started.', 'Buffer completed.']);
    expect(spinnerShown(), 'buffer finished: spinner shown').toBe(false);
    expect(playIconShown(), 'buffer finished: PlayArrow icon shown').toBe(true);
    expect(view(), 'buffer finished: the view stays where it was, with 30 more fetched').toBe(
      at(0, 31)
    );
  });

  test('with 30 states already fetched ahead it shows "Buffer completed." and fetches nothing', async () => {
    startSession(31, 0);
    await click(playButton());
    await settle();
    expect(toasts, '31 fetched, at state 0 (30 ahead), clicked Play: toasts').toEqual([
      'Buffer completed.',
    ]);
    expect(fake.steps, '30 ahead, clicked Play: debugger.step() calls').toBe(0);
    expect(spinnerShown(), '30 ahead, clicked Play: spinner shown').toBe(false);
    expect(playIconShown(), '30 ahead, clicked Play: PlayArrow icon shown').toBe(true);
  });

  test('pressing it twice before its check has run cancels it: no toast, no steps', async () => {
    startSession(1, 0);
    act(() => {
      fireEvent.click(playButton());
      fireEvent.click(playButton());
    });
    await settle();
    expect(toasts, 'Play clicked twice in one batch: toasts').toEqual([]);
    expect(fake.steps, 'Play clicked twice in one batch: debugger.step() calls').toBe(0);
    expect(playIconShown(), 'Play clicked twice in one batch: PlayArrow icon shown').toBe(true);
  });

  test('pressing it while buffering does nothing: one buffer of 30 steps, one "Buffer completed."', async () => {
    startSession(1, 0);
    await click(playButton());
    await answerBuffer(0, 5);
    await click(playButton());
    await settle();
    expect(spinnerShown(), 'clicked Play again after 5 buffer steps: spinner shown').toBe(true);
    expect(toasts, 'clicked Play again while buffering: toasts').toEqual(['Buffer started.']);
    await answerBuffer(5, BUFFER);
    await settle();
    expect(
      fake.steps,
      'Play clicked again while buffering, buffer finished: debugger.step() calls'
    ).toBe(BUFFER);
    expect(toasts, 'Play clicked again while buffering, buffer finished: toasts').toEqual([
      'Buffer started.',
      'Buffer completed.',
    ]);
    expect(playIconShown(), 'buffer finished: PlayArrow icon shown').toBe(true);
  });

  test('Compile cancels a play that was only requested: no buffer starts', async () => {
    startSession(1, 0);
    act(() => {
      fireEvent.click(playButton());
      fireEvent.click(compileButton());
    });
    await settle();
    expect(toasts, 'Play then Compile in one batch: toasts').not.toContain('Buffer started.');
    expect(fake.steps, 'Play then Compile in one batch: debugger.step() calls').toBe(0);
    expect(spinnerShown(), 'Play then Compile in one batch: spinner shown').toBe(false);
  });
});

describe('while buffering', () => {
  test('new: step forward at the latest state is disabled, because the buffer is already fetching', async () => {
    startSession(1, 0);
    await click(playButton());
    await settle();
    expect(spinnerShown(), '1 fetched, at state 0, clicked Play: spinner shown').toBe(true);
    expect(view(), 'buffer started, no step answered yet: the view').toBe(at(0, 1));
    expect(
      stepForwardButton().disabled,
      'buffering, at the latest fetched state (0 of 1): step forward should be disabled'
    ).toBe(true);
    await answerBuffer(0, BUFFER);
    await settle();
    expect(
      stepForwardButton().disabled,
      'buffer finished, at state 0 of 31: step forward disabled?'
    ).toBe(false);
  });

  test('step back, and step forward through states already fetched, still work', async () => {
    startSession(3, 1);
    await click(playButton());
    await settle();
    expect(spinnerShown(), '3 fetched, at state 1, clicked Play: spinner shown').toBe(true);
    expect(stepBackButton().disabled, 'buffering, at state 1: step back disabled?').toBe(false);
    await click(stepBackButton());
    expect(view(), 'buffering, clicked step back at state 1').toBe(at(0, 3));
    expect(stepForwardButton().disabled, 'buffering, at state 0 of 3: step forward disabled?').toBe(
      false
    );
    await click(stepForwardButton());
    await click(stepForwardButton());
    expect(view(), 'buffering, clicked step forward twice from state 0').toBe(at(2, 3));
    await answerBuffer(0, 2);
    expect(view(), 'buffering, 2 buffer steps answered: the view').toBe(at(2, 5));
    await click(stepForwardButton());
    expect(view(), 'buffering, clicked step forward at state 2 of 5').toBe(at(3, 5));
    await settle();
    expect(
      fake.steps,
      'buffering: step() calls are only the buffer’s (2 answered + 1 waiting)'
    ).toBe(3);
  });

  test('the slider does not move the view', async () => {
    startSession(5, 4);
    await click(playButton());
    await settle();
    act(() => {
      fireEvent.change(slider(), { target: { value: 1 } });
    });
    expect(view(), 'buffering, slider moved to 1').toBe(at(4, 5));
  });
});

describe('new: Compile or the session ending while a buffer runs', () => {
  test('Compile keeps the spinner until the running buffer finishes, then the controls return to idle', async () => {
    startSession(1, 0);
    await click(playButton());
    await answerBuffer(0, 3);
    await click(compileButton());
    await settle();
    expect(
      spinnerShown(),
      'clicked Compile after 3 of 30 buffer steps: the spinner should stay until the buffer finishes'
    ).toBe(true);
    await answerBuffer(3, BUFFER, false);
    await settle();
    expect(toasts, 'buffer finished after Compile: toasts include').toContain('Buffer completed.');
    expect(spinnerShown(), 'buffer finished after Compile: spinner shown').toBe(false);
    expect(playIconShown(), 'buffer finished after Compile: PlayArrow icon shown').toBe(true);
    expect(fake.steps, 'buffer finished after Compile: debugger.step() calls').toBe(BUFFER);
  });

  test('the session ending keeps the spinner until the running buffer finishes, then the controls return to idle', async () => {
    startSession(1, 0);
    await click(playButton());
    await answerBuffer(0, 3);
    endSession();
    await settle();
    expect(
      spinnerShown(),
      'session ended after 3 of 30 buffer steps: the spinner should stay until the buffer finishes'
    ).toBe(true);
    await answerBuffer(3, BUFFER, false);
    await settle();
    expect(toasts, 'buffer finished after the session ended: toasts include').toContain(
      'Buffer completed.'
    );
    expect(spinnerShown(), 'buffer finished after the session ended: spinner shown').toBe(false);
    expect(playIconShown(), 'buffer finished after the session ended: PlayArrow icon shown').toBe(
      true
    );
    expect(fake.steps, 'buffer finished after the session ended: debugger.step() calls').toBe(
      BUFFER
    );
  });
});

describe('slider and compiler status', () => {
  test('moving the slider shows that state', () => {
    startSession(5, 4);
    act(() => {
      fireEvent.change(slider(), { target: { value: 1 } });
    });
    expect(view(), '5 fetched, at state 4, slider moved to 1').toBe(at(1, 5));
  });

  test('"Loading compiler N%" shows while the compiler loads and goes once it is ready', () => {
    render(<Controls />);
    act(() =>
      useCompilerStatusStore.getState().setStatus({ state: 'loading', done: 42, total: 100 })
    );
    expect(
      screen.queryByRole('status')?.textContent,
      'compiler status loading 42 of 100: the status text'
    ).toBe('Loading compiler 42%');
    act(() => useCompilerStatusStore.getState().setStatus({ state: 'ready' }));
    expect(screen.queryByRole('status'), 'compiler status ready: the status element').toBeNull();
  });
});
