import { BackendState, BackendTypeDeclaration } from '@/visualiser-debugger/Types/backendType';
import type { CompilerStatus } from './wasm/compiler';

/** `gdb` runs on the server. `wasm` runs in the browser and is being built. */
export type DebuggerKind = 'gdb' | 'wasm';

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
  /** Only the wasm debugger, whose compiler downloads in the browser, sends this. */
  compilerStatus: (status: CompilerStatus) => void;
};

/** What the page can ask a debugger to do. */
export interface Debugger {
  readonly kind: DebuggerKind;
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
