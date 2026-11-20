import { create } from 'zustand';
import type { CompilerStatus } from './wasm/compilerTypes';

interface CompilerStatusStore {
  /** null until the debugger first reports on loading the compiler. */
  status: CompilerStatus | null;
  setStatus: (status: CompilerStatus) => void;
  clear: () => void;
}

export const useCompilerStatusStore = create<CompilerStatusStore>((set) => ({
  status: null,
  setStatus: (status) => set({ status }),
  clear: () => set({ status: null }),
}));
