import { BackendState, BackendTypeDeclaration } from '@/visualiser-debugger/Types/backendType';
import type { CompilerStatus } from './wasm/compiler';

/** A file from the page's file tree. */
export type SourceFile = { name: string; code: string };

/** What a debugger reports back to the page. */
export type DebuggerEvents = {
  sessionStarted: () => void;
  compileError: (errors: string[]) => void;
  output: (text: string) => void;
  state: (state: BackendState) => void;
  typeDeclaration: (type: BackendTypeDeclaration) => void;
  sessionEnded: () => void;
  /** How far the compiler, which downloads in the browser, has got. */
  compilerStatus: (status: CompilerStatus) => void;
};

/** What the page can ask a debugger to do. */
export interface Debugger {
  /** Replaces the events set earlier. */
  setEvents(events: DebuggerEvents): void;
  /** Compiles the file and starts a session. */
  start(file: SourceFile): void;
  /** Resolves true once the next state has arrived, or false if none does. */
  step(): Promise<boolean>;
  sendStdin(input: string): void;
  sendEOF(): void;
  interrupt(): void;
  close(): void;
}
