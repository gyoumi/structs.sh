import { create } from 'zustand';
import { useCompilerStatusStore } from './compilerStatusStore';
import { Debugger } from './types';
import { WasmDebugger } from './wasmDebugger';

interface DebuggerStore {
  debuggerClient: Debugger | null;
  /** Creates the debugger, if there isn't one. */
  initialise: () => void;
  close: () => void;
}

export const useDebuggerStore = create<DebuggerStore>((set, get) => ({
  debuggerClient: null,
  initialise: () => {
    if (!get().debuggerClient) {
      set({ debuggerClient: new WasmDebugger() });
    }
  },
  close: () => {
    get().debuggerClient?.close();
    set({ debuggerClient: null });
    useCompilerStatusStore.getState().clear();
  },
}));
