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

    expect(handlers.setActive).toHaveBeenCalledWith(true);
    expect(handlers.setMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Debug session started.' })
    );
  });

  it('shows each new state, adding it to the timeline as it arrives', () => {
    events.state(INITIAL_PROGRAM_STATE);

    expect(handlers.setLatestProgramState).toHaveBeenCalledWith(INITIAL_PROGRAM_STATE);
    // Added straight away, not when the page next renders, so a step that
    // resolves can move to it.
    expect(handlers.addToTimeline).toHaveBeenCalledWith(INITIAL_PROGRAM_STATE);
  });

  it('marks the session inactive when it ends', () => {
    events.sessionEnded();

    expect(handlers.setActive).toHaveBeenCalledWith(false);
    expect(handlers.setMessage).toHaveBeenCalledWith(
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

    expect(handlers.appendConsoleChunks).toHaveBeenCalledWith(['main.c:3: error: oops']);
    expect(handlers.updateCurrFocusedTab).toHaveBeenCalledWith('2');
  });

  it('records the compiler’s loading status', () => {
    events.compilerStatus({ state: 'loading', done: 1, total: 2 });

    expect(handlers.setCompilerStatus).toHaveBeenCalledWith({
      state: 'loading',
      done: 1,
      total: 2,
    });
  });

  it('shows program output in the console', () => {
    events.output('hi');

    expect(handlers.appendConsoleChunks).toHaveBeenCalledWith(['h', 'i']);
  });
});
