import { create } from 'zustand';
import type { CompilerStatus } from './wasm/compiler';

interface CompilerStatusStore {
  /** null until a debugger that downloads a compiler reports on it. */
  status: CompilerStatus | null;
  setStatus: (status: CompilerStatus) => void;
  clear: () => void;
}

export const useCompilerStatusStore = create<CompilerStatusStore>((set) => ({
  status: null,
  setStatus: (status) => set({ status }),
  clear: () => set({ status: null }),
}));
