import { BackendState, BackendTypeDeclaration } from '@/visualiser-debugger/Types/backendType';
import type { CompilerStatus } from './wasm/compiler';

export type SourceFile = { name: string; code: string };

export type DebuggerEvents = {
  sessionStarted: () => void;
  compileError: (errors: string[]) => void;
  output: (text: string) => void;
  state: (state: BackendState) => void;
  typeDeclaration: (type: BackendTypeDeclaration) => void;
  sessionEnded: () => void;
  compilerStatus: (status: CompilerStatus) => void;
};

export interface Debugger {
  /** Replaces the events set earlier. */
  setEvents(events: DebuggerEvents): void;
  start(file: SourceFile): void;
  /** Resolves true once the next state has arrived, or false if none does. */
  step(): Promise<boolean>;
  sendStdin(input: string): void;
  sendEOF(): void;
  interrupt(): void;
  close(): void;
}
