import { create } from 'zustand';
import { useCompilerStatusStore } from './compilerStatusStore';
import { Debugger } from './types';
import { WasmDebugger } from './wasmDebugger';

interface DebuggerStore {
  activeDebugger: Debugger | null;
  initialise: () => void;
  close: () => void;
}

export const useDebuggerStore = create<DebuggerStore>((set, get) => ({
  activeDebugger: null,
  initialise: () => {
    if (!get().activeDebugger) {
      set({ activeDebugger: new WasmDebugger() });
    }
  },
  close: () => {
    get().activeDebugger?.close();
    set({ activeDebugger: null });
    useCompilerStatusStore.getState().clear();
  },
}));
