import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_PROGRAM_STATE } from '@/visualiser-debugger/Types/programState';
import { buildDebuggerEvents } from './buildDebuggerEvents';

describe('buildDebuggerEvents', () => {
  const handlers = {
    setMessage: vi.fn(),
    setActive: vi.fn(),
    setLatestProgramState: vi.fn(),
    addToTimeline: vi.fn(),
    addTypeDeclaration: vi.fn(),
    appendConsoleChunks: vi.fn(),
    updateCurrFocusedTab: vi.fn(),
    setCompilerStatus: vi.fn(),
  };
  const events = buildDebuggerEvents(handlers);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks the session active when it starts', () => {
    events.sessionStarted();

    expect(handlers.setActive, 'sessionStarted(): setActive calls').toHaveBeenCalledWith(true);
    expect(handlers.setMessage, 'sessionStarted(): setMessage calls').toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Debug session started.' })
    );
  });

  it('shows each new state, adding it to the timeline as it arrives', () => {
    events.state(INITIAL_PROGRAM_STATE);

    expect(
      handlers.setLatestProgramState,
      'state(INITIAL_PROGRAM_STATE): setLatestProgramState calls'
    ).toHaveBeenCalledWith(INITIAL_PROGRAM_STATE);
    // Added straight away, not when the page next renders, so a step that
    // resolves can move to it.
    expect(
      handlers.addToTimeline,
      'state(INITIAL_PROGRAM_STATE): addToTimeline calls'
    ).toHaveBeenCalledWith(INITIAL_PROGRAM_STATE);
  });

  it('marks the session inactive when it ends', () => {
    events.sessionEnded();

    expect(handlers.setActive, 'sessionEnded(): setActive calls').toHaveBeenCalledWith(false);
    expect(handlers.setMessage, 'sessionEnded(): setMessage calls').toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Debug session ended.' })
    );
  });

  it('records each type declaration as the debugger sends it, even one named size_t', () => {
    // A program can typedef a struct as size_t; the debugger sends that like
    // any other struct typedef, so it must reach the page too.
    const sizeT = { typeName: 'size_t', fields: [{ name: 'value', typeName: 'int' }] };
    const node = {
      typeName: 'struct node',
      fields: [
        { name: 'value', typeName: 'int' },
        { name: 'next', typeName: 'struct node *' },
      ],
    };

    events.typeDeclaration(sizeT);
    events.typeDeclaration(node);

    expect(
      handlers.addTypeDeclaration.mock.calls,
      'events.typeDeclaration({ typeName: "size_t", fields: value }) then ({ typeName: "struct node", fields: value, next }): ' +
        'the arguments of each addTypeDeclaration call, in order'
    ).toEqual([[sizeT], [node]]);
  });

  it('shows compile errors in the console and switches to it', () => {
    events.compileError(['main.c:3: error: oops']);

    expect(
      handlers.appendConsoleChunks,
      "compileError(['main.c:3: error: oops']): appendConsoleChunks calls"
    ).toHaveBeenCalledWith(['main.c:3: error: oops']);
    expect(
      handlers.updateCurrFocusedTab,
      "compileError(...): updateCurrFocusedTab calls ('2' is the console tab)"
    ).toHaveBeenCalledWith('2');
  });

  it('records the compiler’s loading status', () => {
    events.compilerStatus({ state: 'loading', done: 1, total: 2 });

    expect(
      handlers.setCompilerStatus,
      'compilerStatus({ loading, 1/2 }): setCompilerStatus calls'
    ).toHaveBeenCalledWith({
      state: 'loading',
      done: 1,
      total: 2,
    });
  });

  it('shows program output in the console', () => {
    events.output('hi');

    expect(
      handlers.appendConsoleChunks,
      "output('hi'): appendConsoleChunks calls, one chunk per character"
    ).toHaveBeenCalledWith(['h', 'i']);
  });
});
