export type CompileResult =
  | { ok: true; wasm: Uint8Array<ArrayBuffer> }
  | { ok: false; errors: string };

/** Whether the compiler (about 105 MB) has downloaded yet. */
export type CompilerStatus =
  | { state: 'loading'; done: number; total: number }
  | { state: 'ready' }
  | { state: 'failed' };

/** Turns one C file into a wasm program, or the compiler's error messages. */
export interface Compiler {
  compile(fileName: string, source: string): Promise<CompileResult>;
  /** Starts downloading the compiler now, reporting its status as it goes. */
  preload(onStatus: (status: CompilerStatus) => void): void;
  /** Stops the compiler. Compiles still waiting are answered with an error. */
  dispose(): void;
}
