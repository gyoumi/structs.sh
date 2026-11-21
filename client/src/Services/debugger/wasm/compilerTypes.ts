export type CompileResult =
  | { ok: true; wasm: Uint8Array<ArrayBuffer> }
  | { ok: false; errors: string };

export type CompilerStatus =
  | { state: 'loading'; done: number; total: number }
  | { state: 'ready' }
  | { state: 'failed' };

export interface Compiler {
  compile(fileName: string, source: string): Promise<CompileResult>;
  preload(onStatus: (status: CompilerStatus) => void): void;
  /** Stops the compiler. Compiles still waiting are answered with an error. */
  dispose(): void;
}
