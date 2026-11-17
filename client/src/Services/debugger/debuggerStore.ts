import { create } from 'zustand';
import { useCompilerStatusStore } from './compilerStatusStore';
import { createDebugger, debuggerKindFromSearch } from './createDebugger';
import { Debugger } from './types';

interface DebuggerStore {
  debuggerClient: Debugger | null;
  /** Creates the debugger the page's URL asks for, if there isn't one. */
  initialise: () => void;
  close: () => void;
}

export const useDebuggerStore = create<DebuggerStore>((set, get) => ({
  debuggerClient: null,
  initialise: () => {
    if (!get().debuggerClient) {
      set({ debuggerClient: createDebugger(debuggerKindFromSearch(window.location.search)) });
    }
  },
  close: () => {
    get().debuggerClient?.close();
    set({ debuggerClient: null });
    useCompilerStatusStore.getState().clear();
  },
}));
