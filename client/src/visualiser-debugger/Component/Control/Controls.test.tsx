// @vitest-environment jsdom
import '@/test/setup';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useDebuggerStore } from '@/Services/debugger/debuggerStore';
import { useCompilerStatusStore } from '@/Services/debugger/compilerStatusStore';
import type { Debugger, DebuggerEvents, SourceFile } from '@/Services/debugger/types';
import { useFrontendStateStore } from '@/visualiser-debugger/Store/frontendStateStore';
import { useGlobalStore } from '@/visualiser-debugger/Store/globalStateStore';
import { useToastStateStore } from '@/visualiser-debugger/Store/toastStateStore';
import { useUserFsStateStore } from '@/visualiser-debugger/Store/userFsStateStore';
import { onboardingStore } from '@/visualiser-debugger/Store/onboardingStore';
import type { ProgramState } from '@/visualiser-debugger/Types/programState';
import Controls from './Controls';

const BUFFER = 30;
const FIXTURE_FILE_PATH = 'root/2521_Tut02/linked_list_delete.c';

class DebuggerAnsweringStepsOnCue implements Debugger {
  events: DebuggerEvents | null = null;

  stepCalls = 0;

  startedFiles: SourceFile[] = [];

  private unanswered: ((gotState: boolean) => void)[] = [];

  private line = 1;

  setEvents(events: DebuggerEvents) {
    this.events = events;
  }

  start(file: SourceFile) {
    this.startedFiles.push(file);
  }

  step() {
    this.stepCalls += 1;
    return new Promise<boolean>((resolve) => {
      this.unanswered.push(resolve);
    });
  }

  get unansweredSteps() {
    return this.unanswered.length;
  }

  emitState() {
    if (!this.events) throw new Error('test setup: Controls never gave the debugger its events');
    const location = {
      fileName: 'main.c',
      lineText: '',
      lineNumber: this.line++,
      function: 'main',
    };
    const state: ProgramState = { location, variables: {}, heap: {} };
    this.events.state(state);
  }

  answerOldestStep(withState: boolean) {
    const resolve = this.unanswered.shift();
    if (!resolve) throw new Error('test setup: no step request is waiting for an answer');
    if (withState) this.emitState();
    resolve(withState);
  }

  sendStdin() {}

  sendEOF() {}

  interrupt() {}

  close() {}
}

const storesControlsTouches = [
  useFrontendStateStore,
  useGlobalStore,
  useToastStateStore,
  useCompilerStatusStore,
  useDebuggerStore,
  useUserFsStateStore,
  onboardingStore,
] as { getState(): object; setState(state: object, replace: true): void }[];
const initialStoreStates = storesControlsTouches.map((store) => store.getState());

let fake: DebuggerAnsweringStepsOnCue;
let toastsShown: string[];
let stopRecordingToasts: () => void;

beforeEach(() => {
  fake = new DebuggerAnsweringStepsOnCue();
  useDebuggerStore.setState({ activeDebugger: fake });
  toastsShown = [];
  stopRecordingToasts = useToastStateStore.subscribe((state, previous) => {
    const message = state.currentToastMessage;
    if (message && message !== previous.currentToastMessage) toastsShown.push(`${message.content}`);
  });
});

afterEach(() => {
  stopRecordingToasts();
  storesControlsTouches.forEach((store, i) => store.setState(initialStoreStates[i], true));
});

const buttonAroundIcon = (testId: string) => {
  const button = screen.getByTestId(testId).closest('button');
  if (!button) throw new Error(`no button around the ${testId} icon`);
  return button;
};
const stepForwardButton = () => buttonAroundIcon('RedoIcon');
const stepBackButton = () => buttonAroundIcon('UndoIcon');
const compileButton = () => screen.getByRole('button', { name: 'Compile' });
const playButtonShowingIconOrSpinner = () => {
  const inside = screen.queryByTestId('PlayArrowIcon') ?? screen.queryByRole('progressbar');
  const button = inside?.closest('button');
  if (!button) throw new Error('found neither the PlayArrow icon nor the spinner inside a button');
  return button;
};
const playButtonShows = () => {
  const icon = screen.queryByTestId('PlayArrowIcon') !== null;
  const spinner = screen.queryByRole('progressbar') !== null;
  if (icon === spinner) return icon ? 'both icon and spinner' : 'neither icon nor spinner';
  return icon ? 'play icon' : 'spinner';
};
const stepButtonsDisabled = () => ({
  back: stepBackButton().disabled,
  forward: stepForwardButton().disabled,
});
const BOTH_DISABLED = { back: true, forward: true };
const BOTH_ENABLED = { back: false, forward: false };
const BUFFER_TOASTS = ['Buffer started.', 'Buffer completed.'];
const slider = () => screen.getByRole('slider');

const timelinePosition = () => {
  const { currentIndex, states } = useFrontendStateStore.getState();
  return `state ${currentIndex} of ${states.length} fetched`;
};
const at = (index: number, fetched: number) => `state ${index} of ${fetched} fetched`;

const renderInSessionAt = (index: number, fetched: number) => {
  render(<Controls />);
  act(() => {
    if (!fake.events) throw new Error('test setup: Controls never gave the debugger its events');
    fake.events.sessionStarted();
    for (let i = 0; i < fetched; i++) fake.emitState();
    useFrontendStateStore.getState().jumpToState(index);
  });
  toastsShown.length = 0;
};

const endSession = () =>
  act(() => {
    fake.events?.sessionEnded();
  });

const click = (button: HTMLElement) =>
  act(() => {
    fireEvent.click(button);
  });

const waitThenAnswerStep = async (withState: boolean, which: string) => {
  await waitFor(() => {
    if (fake.unansweredSteps === 0) {
      throw new Error(
        `${which}: expected a step request waiting for an answer, but none is (step() called ${fake.stepCalls} times)`
      );
    }
  });
  await act(async () => {
    fake.answerOldestStep(withState);
  });
};

const answerBufferSteps = async (from: number, to: number, withState = true) => {
  for (let i = from; i < to; i++) {
    // eslint-disable-next-line no-await-in-loop
    await waitThenAnswerStep(withState, `buffer step ${i + 1} of ${BUFFER}`);
  }
};

const flushPromisesAndEffects = () => act(async () => {});

describe('step forward (Redo icon)', () => {
  test('before the latest state it moves to the next fetched state at once, without asking the debugger', async () => {
    renderInSessionAt(0, 3);
    await click(stepForwardButton());
    expect(timelinePosition(), 'at state 0 of 3, clicked step forward').toBe(at(1, 3));
    await flushPromisesAndEffects();
    expect(fake.stepCalls, 'step forward through a fetched state: step() calls').toBe(0);
  });

  test('at the latest state it asks for one step, disables both step buttons until the answer, then shows the new state', async () => {
    renderInSessionAt(1, 2);
    await click(stepForwardButton());
    await flushPromisesAndEffects();
    const where = 'at the latest state (1 of 2), clicked step forward';
    expect(fake.stepCalls, `${where}: step() calls`).toBe(1);
    expect(stepButtonsDisabled(), `${where}, unanswered: disabled?`).toEqual(BOTH_DISABLED);
    expect(timelinePosition(), `${where}, unanswered: the view stays`).toBe(at(1, 2));
    await waitThenAnswerStep(true, 'step forward at the latest state');
    expect(timelinePosition(), `${where}, answered with a state`).toBe(at(2, 3));
    expect(stepButtonsDisabled(), `${where}, answered: disabled?`).toEqual(BOTH_ENABLED);
  });

  test('at the latest state, when the debugger answers with no state, the view stays and both buttons come back', async () => {
    renderInSessionAt(1, 2);
    await click(stepForwardButton());
    await waitThenAnswerStep(false, 'step forward at the latest state');
    const where = 'at state 1 of 2, step forward answered with no state';
    expect(timelinePosition(), `${where}: the view`).toBe(at(1, 2));
    expect(stepButtonsDisabled(), `${where}: disabled?`).toEqual(BOTH_ENABLED);
  });

  test('after the session ends it is disabled at the latest state and still works before it', async () => {
    renderInSessionAt(2, 3);
    endSession();
    const where = 'session ended';
    expect(stepForwardButton().disabled, `${where}, at state 2 of 3: disabled?`).toBe(true);
    act(() => useFrontendStateStore.getState().jumpToState(1));
    expect(stepForwardButton().disabled, `${where}, at state 1 of 3: disabled?`).toBe(false);
    await click(stepForwardButton());
    expect(timelinePosition(), `${where}, clicked step forward at state 1`).toBe(at(2, 3));
    expect(fake.stepCalls, `${where}: step() calls`).toBe(0);
  });
});

describe('step back (Undo icon)', () => {
  test('moves to the previous state and is disabled at the first state', async () => {
    renderInSessionAt(2, 3);
    expect(stepBackButton().disabled, 'at state 2 of 3: disabled?').toBe(false);
    await click(stepBackButton());
    expect(timelinePosition(), 'clicked step back at state 2').toBe(at(1, 3));
    await click(stepBackButton());
    expect(timelinePosition(), 'clicked step back at state 1').toBe(at(0, 3));
    expect(stepBackButton().disabled, 'at the first state (0 of 3): disabled?').toBe(true);
  });
});

describe('play (PlayArrow icon)', () => {
  test('is disabled before a session starts and after it ends', () => {
    render(<Controls />);
    const playDisabled = () => playButtonShowingIconOrSpinner().disabled;
    expect(playDisabled(), 'no session started: Play disabled?').toBe(true);
    act(() => fake.events?.sessionStarted());
    expect(playDisabled(), 'session started: Play disabled?').toBe(false);
    endSession();
    expect(playDisabled(), 'session ended: Play disabled?').toBe(true);
  });

  test.each([
    { fetched: 1, index: 0, ahead: 0 },
    { fetched: 29, index: 0, ahead: 28 },
    { fetched: 10, index: 5, ahead: 4 },
  ])(
    'with $ahead states fetched ahead ($fetched fetched, at $index) it starts a buffer: spinner and "Buffer started."',
    async ({ fetched, index, ahead }) => {
      renderInSessionAt(index, fetched);
      await click(playButtonShowingIconOrSpinner());
      await flushPromisesAndEffects();
      const where = `${ahead} states ahead, clicked Play`;
      expect(playButtonShows(), `${where}: the Play button shows`).toBe('spinner');
      expect(toastsShown, `${where}: toasts`).toEqual(['Buffer started.']);
      expect(fake.stepCalls, `${where}: step() calls so far`).toBe(1);
    }
  );

  test('a buffer fetches exactly 30 steps, one at a time, then shows "Buffer completed." and the play icon', async () => {
    renderInSessionAt(0, 1);
    await click(playButtonShowingIconOrSpinner());
    await answerBufferSteps(0, BUFFER - 1);
    const where = 'after 29 of 30 buffer steps answered';
    expect(playButtonShows(), `${where}: the Play button shows`).toBe('spinner');
    expect(toastsShown, `${where}: toasts`).toEqual(['Buffer started.']);
    await answerBufferSteps(BUFFER - 1, BUFFER);
    await flushPromisesAndEffects();
    expect(fake.stepCalls, 'buffer finished: step() calls in total').toBe(BUFFER);
    expect(fake.unansweredSteps, 'buffer finished: step requests still waiting').toBe(0);
    expect(toastsShown, 'buffer finished: toasts').toEqual(BUFFER_TOASTS);
    expect(playButtonShows(), 'buffer finished: the Play button shows').toBe('play icon');
    expect(timelinePosition(), 'buffer finished: the view stays, 30 more fetched').toBe(at(0, 31));
  });

  test('with 30 states already fetched ahead it shows "Buffer completed." and fetches nothing', async () => {
    renderInSessionAt(0, 31);
    await click(playButtonShowingIconOrSpinner());
    await flushPromisesAndEffects();
    const where = 'at state 0 of 31 (30 ahead), clicked Play';
    expect(toastsShown, `${where}: toasts`).toEqual(['Buffer completed.']);
    expect(fake.stepCalls, `${where}: step() calls`).toBe(0);
    expect(playButtonShows(), `${where}: the Play button shows`).toBe('play icon');
  });

  test('pressing it twice before its check has run cancels it: no toast, no steps', async () => {
    renderInSessionAt(0, 1);
    act(() => {
      fireEvent.click(playButtonShowingIconOrSpinner());
      fireEvent.click(playButtonShowingIconOrSpinner());
    });
    await flushPromisesAndEffects();
    const where = 'Play clicked twice in one batch';
    expect(toastsShown, `${where}: toasts`).toEqual([]);
    expect(fake.stepCalls, `${where}: step() calls`).toBe(0);
    expect(playButtonShows(), `${where}: the Play button shows`).toBe('play icon');
  });

  test('pressing it while buffering does nothing: one buffer of 30 steps, one "Buffer completed."', async () => {
    renderInSessionAt(0, 1);
    await click(playButtonShowingIconOrSpinner());
    await answerBufferSteps(0, 5);
    await click(playButtonShowingIconOrSpinner());
    await flushPromisesAndEffects();
    const where = 'clicked Play again after 5 of 30 buffer steps';
    expect(playButtonShows(), `${where}: the Play button shows`).toBe('spinner');
    expect(toastsShown, `${where}: toasts`).toEqual(['Buffer started.']);
    await answerBufferSteps(5, BUFFER);
    await flushPromisesAndEffects();
    expect(fake.stepCalls, `${where}, buffer finished: step() calls`).toBe(BUFFER);
    expect(toastsShown, `${where}, buffer finished: toasts`).toEqual(BUFFER_TOASTS);
    expect(playButtonShows(), `${where}, buffer finished: Play shows`).toBe('play icon');
  });

  test('Compile cancels a play that was only requested: no buffer starts', async () => {
    renderInSessionAt(0, 1);
    act(() => {
      fireEvent.click(playButtonShowingIconOrSpinner());
      fireEvent.click(compileButton());
    });
    await flushPromisesAndEffects();
    const where = 'Play then Compile in one batch';
    expect(toastsShown, `${where}: toasts`).not.toContain('Buffer started.');
    expect(fake.stepCalls, `${where}: step() calls`).toBe(0);
    expect(playButtonShows(), `${where}: the Play button shows`).toBe('play icon');
  });
});

describe('play while one step is being fetched', () => {
  test('waits for the step: play icon stays and step buttons stay disabled, then the buffer runs as if Play were just pressed', async () => {
    renderInSessionAt(1, 2);
    await click(stepForwardButton());
    await click(playButtonShowingIconOrSpinner());
    await flushPromisesAndEffects();
    const where = 'at state 1 of 2, clicked step forward then Play, step unanswered';
    expect(playButtonShows(), `${where}: the Play button shows`).toBe('play icon');
    expect(stepButtonsDisabled(), `${where}: disabled?`).toEqual(BOTH_DISABLED);
    expect(toastsShown, `${where}: toasts`).toEqual([]);
    expect(fake.stepCalls, `${where}: step() calls`).toBe(1);
    await waitThenAnswerStep(true, 'the step forward request');
    await flushPromisesAndEffects();
    const after = 'step answered with a state after Play was pressed';
    expect(timelinePosition(), `${after}: the view moves to the new state`).toBe(at(2, 3));
    expect(toastsShown, `${after}: toasts`).toEqual(['Buffer started.']);
    expect(playButtonShows(), `${after}: the Play button shows`).toBe('spinner');
    await answerBufferSteps(0, BUFFER);
    await flushPromisesAndEffects();
    expect(fake.stepCalls, `${after}, buffer finished: step() calls (1 + 30)`).toBe(1 + BUFFER);
    expect(toastsShown, `${after}, buffer finished: toasts`).toEqual(BUFFER_TOASTS);
    expect(playButtonShows(), `${after}, buffer finished: Play shows`).toBe('play icon');
  });

  test('pressing Play twice before the step answers cancels it: no buffer after the answer', async () => {
    renderInSessionAt(1, 2);
    await click(stepForwardButton());
    await click(playButtonShowingIconOrSpinner());
    await click(playButtonShowingIconOrSpinner());
    await waitThenAnswerStep(true, 'the step forward request');
    await flushPromisesAndEffects();
    const where = 'step forward, then Play twice, then the step answered with a state';
    expect(timelinePosition(), `${where}: the view`).toBe(at(2, 3));
    expect(toastsShown, `${where}: toasts`).toEqual([]);
    expect(fake.stepCalls, `${where}: step() calls`).toBe(1);
    expect(playButtonShows(), `${where}: the Play button shows`).toBe('play icon');
    expect(stepButtonsDisabled(), `${where}: disabled?`).toEqual(BOTH_ENABLED);
  });
});

describe('while buffering', () => {
  test('new: step forward at the latest state is disabled, because the buffer is already fetching', async () => {
    renderInSessionAt(0, 1);
    await click(playButtonShowingIconOrSpinner());
    await flushPromisesAndEffects();
    expect(playButtonShows(), 'at state 0 of 1, clicked Play: the Play button shows').toBe(
      'spinner'
    );
    expect(timelinePosition(), 'buffer started, no step answered yet').toBe(at(0, 1));
    expect(
      stepForwardButton().disabled,
      'buffering, at the latest fetched state (0 of 1): step forward should be disabled'
    ).toBe(true);
    await answerBufferSteps(0, BUFFER);
    await flushPromisesAndEffects();
    expect(stepForwardButton().disabled, 'buffer finished, at state 0 of 31: disabled?').toBe(
      false
    );
  });

  test('step back, and step forward through states already fetched, still work', async () => {
    renderInSessionAt(1, 3);
    await click(playButtonShowingIconOrSpinner());
    await flushPromisesAndEffects();
    expect(playButtonShows(), 'at state 1 of 3, clicked Play: Play shows').toBe('spinner');
    expect(stepBackButton().disabled, 'buffering, at state 1: step back disabled?').toBe(false);
    await click(stepBackButton());
    expect(timelinePosition(), 'buffering, clicked step back at state 1').toBe(at(0, 3));
    expect(stepForwardButton().disabled, 'buffering, at state 0 of 3: disabled?').toBe(false);
    await click(stepForwardButton());
    await click(stepForwardButton());
    expect(timelinePosition(), 'buffering, step forward twice from state 0').toBe(at(2, 3));
    await answerBufferSteps(0, 2);
    expect(timelinePosition(), 'buffering, 2 buffer steps answered').toBe(at(2, 5));
    await click(stepForwardButton());
    expect(timelinePosition(), 'buffering, step forward at state 2 of 5').toBe(at(3, 5));
    await flushPromisesAndEffects();
    expect(fake.stepCalls, 'buffering: step() calls, only the buffer’s (2 + 1 waiting)').toBe(3);
  });

  test('the slider does not move the view', async () => {
    renderInSessionAt(4, 5);
    await click(playButtonShowingIconOrSpinner());
    await flushPromisesAndEffects();
    act(() => {
      fireEvent.change(slider(), { target: { value: 1 } });
    });
    expect(timelinePosition(), 'buffering, slider moved to 1').toBe(at(4, 5));
  });
});

describe('new: Compile or the session ending while a buffer runs', () => {
  test('Compile starts a new session but keeps the spinner until the running buffer finishes, then the controls return to idle', async () => {
    renderInSessionAt(0, 1);
    act(() => useUserFsStateStore.getState().setFocusFilePath(FIXTURE_FILE_PATH));
    await click(playButtonShowingIconOrSpinner());
    await answerBufferSteps(0, 3);
    await click(compileButton());
    await flushPromisesAndEffects();
    const where = `${FIXTURE_FILE_PATH} selected, clicked Compile after 3 of 30 buffer steps`;
    expect(
      fake.startedFiles.map(({ name }) => name),
      `${where}: files the debugger was started with`
    ).toEqual(['linked_list_delete.c']);
    expect(fake.unansweredSteps, `${where}: buffer step requests still waiting`).toBe(1);
    expect(playButtonShows(), `${where}: spinner until the buffer ends`).toBe('spinner');
    await answerBufferSteps(3, BUFFER, false);
    await flushPromisesAndEffects();
    const after = 'buffer finished after Compile';
    expect(toastsShown, `${after}: toasts include`).toContain('Buffer completed.');
    expect(playButtonShows(), `${after}: the Play button shows`).toBe('play icon');
    expect(fake.stepCalls, `${after}: step() calls`).toBe(BUFFER);
  });

  test('the session ending keeps the spinner until the running buffer finishes, then the controls return to idle', async () => {
    renderInSessionAt(0, 1);
    await click(playButtonShowingIconOrSpinner());
    await answerBufferSteps(0, 3);
    endSession();
    await flushPromisesAndEffects();
    const where = 'session ended after 3 of 30 buffer steps';
    expect(playButtonShows(), `${where}: spinner until the buffer ends`).toBe('spinner');
    await answerBufferSteps(3, BUFFER, false);
    await flushPromisesAndEffects();
    const after = 'buffer finished after the session ended';
    expect(toastsShown, `${after}: toasts include`).toContain('Buffer completed.');
    expect(playButtonShows(), `${after}: the Play button shows`).toBe('play icon');
    expect(fake.stepCalls, `${after}: step() calls`).toBe(BUFFER);
  });
});

describe('slider and compiler status', () => {
  test('moving the slider shows that state', () => {
    renderInSessionAt(4, 5);
    act(() => {
      fireEvent.change(slider(), { target: { value: 1 } });
    });
    expect(timelinePosition(), 'at state 4 of 5, slider moved to 1').toBe(at(1, 5));
  });

  test('"Loading compiler N%" shows while the compiler loads and goes once it is ready', () => {
    render(<Controls />);
    const { setStatus } = useCompilerStatusStore.getState();
    act(() => setStatus({ state: 'loading', done: 42, total: 100 }));
    const status = () => screen.queryByRole('status')?.textContent ?? null;
    expect(status(), 'compiler loading 42 of 100: the status text').toBe('Loading compiler 42%');
    act(() => setStatus({ state: 'ready' }));
    expect(status(), 'compiler ready: the status text').toBeNull();
  });
});
