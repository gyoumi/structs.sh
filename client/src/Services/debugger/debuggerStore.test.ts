import { describe, expect, it } from 'vitest';
import { useCompilerStatusStore } from './compilerStatusStore';
import { useDebuggerStore } from './debuggerStore';

describe('useDebuggerStore', () => {
  it('forgets the compiler status when the debugger closes', () => {
    useCompilerStatusStore.getState().setStatus({ state: 'loading', done: 1, total: 2 });

    useDebuggerStore.getState().close();

    expect(useCompilerStatusStore.getState().status).toBeNull();
  });
});
