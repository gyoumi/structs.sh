export type CompileResult =
  | { ok: true; wasm: Uint8Array<ArrayBuffer> }
  | { ok: false; errors: string };

/** Turns one C file into a wasm program, or the compiler's error messages. */
export interface Compiler {
  compile(fileName: string, source: string): Promise<CompileResult>;
  /** Stops the compiler. Compiles still waiting are answered with an error. */
  dispose(): void;
}
