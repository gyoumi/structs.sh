import { ProgramState } from '@/visualiser-debugger/Types/programState';
import type { CompilerStatus } from './wasm/compilerTypes';
import type { TypeDeclaration } from './wasm/debugSection';

export type SourceFile = { name: string; code: string };

export type DebuggerEvents = {
  sessionStarted: () => void;
  compileError: (errors: string[]) => void;
  output: (text: string) => void;
  state: (state: ProgramState) => void;
  typeDeclaration: (type: TypeDeclaration) => void;
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
