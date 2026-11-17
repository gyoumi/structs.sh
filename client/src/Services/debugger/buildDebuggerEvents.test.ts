import { beforeEach, describe, expect, it, vi } from 'vitest';
import { INITIAL_BACKEND_STATE } from '@/visualiser-debugger/Types/backendType';
import { buildDebuggerEvents } from './buildDebuggerEvents';

describe('buildDebuggerEvents', () => {
  const page = {
    setMessage: vi.fn(),
    setActive: vi.fn(),
    updateNextFrame: vi.fn(),
    updateTypeDeclaration: vi.fn(),
    appendConsoleChunks: vi.fn(),
    updateCurrFocusedTab: vi.fn(),
  };
  const events = buildDebuggerEvents(page);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks the session active when it starts', () => {
    events.sessionStarted();

    expect(page.setActive).toHaveBeenCalledWith(true);
    expect(page.setMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Debug session started.' })
    );
  });

  it('shows each new state', () => {
    events.state(INITIAL_BACKEND_STATE);

    expect(page.updateNextFrame).toHaveBeenCalledWith(INITIAL_BACKEND_STATE);
  });

  it('marks the session inactive when it ends', () => {
    events.sessionEnded();

    expect(page.setActive).toHaveBeenCalledWith(false);
    expect(page.setMessage).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Debug session ended.' })
    );
  });

  it('records type declarations, except size_t', () => {
    const node = {
      file: 'main.c',
      line_num: '3',
      original_line: '',
      typeName: 'struct node' as const,
    };

    events.typeDeclaration({ ...node, typeName: 'size_t' as never });
    events.typeDeclaration(node);

    expect(page.updateTypeDeclaration).toHaveBeenCalledExactlyOnceWith(node);
  });

  it('shows compile errors in the console and switches to it', () => {
    events.compileError(['main.c:3: error: oops']);

    expect(page.appendConsoleChunks).toHaveBeenCalledWith(['main.c:3: error: oops']);
    expect(page.updateCurrFocusedTab).toHaveBeenCalledWith('2');
  });

  it('shows program output in the console', () => {
    events.output('hi');

    expect(page.appendConsoleChunks).toHaveBeenCalledWith(['h', 'i']);
  });
});
