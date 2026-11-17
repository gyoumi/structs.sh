import { compileC } from './compile';
import { CompileResult } from './compiler';

// Built from instrumenter/ by `pnpm run instrumenter` (see the repo root's
// package.json). It isn't committed.
const INSTRUMENTER_URL = new URL('./generated/instrumenter.wasm', import.meta.url);

/** What the instrumenter's wasm exports: see instrumenter/src/lib.rs. */
type InstrumenterExports = {
  memory: WebAssembly.Memory;
  alloc: (length: number) => number;
  instrument: (pointer: number, length: number) => number;
  result_ptr: () => number;
  result_len: () => number;
  free_result: () => void;
};

const readBytes = async (url: URL) => {
  if (url.protocol === 'file:') {
    // Under Node, for tests.
    const { readFile } = await import('node:fs/promises');
    return new Uint8Array(await readFile(url));
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return new Uint8Array(await response.arrayBuffer());
};

let instrumenterLoad: Promise<InstrumenterExports> | null = null;

/** Loads the instrumenter once. A failed load can be tried again. */
export const loadInstrumenter = () => {
  instrumenterLoad ??= readBytes(INSTRUMENTER_URL)
    .then((bytes) => WebAssembly.instantiate(bytes, {}))
    .then(({ instance }) => instance.exports as unknown as InstrumenterExports)
    .catch((error) => {
      instrumenterLoad = null;
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `The instrumenter could not be loaded (run "pnpm run instrumenter" to build it): ${reason}`
      );
    });
  return instrumenterLoad;
};

/** Rewrites a compiled program so the debugger can record it. */
export const instrumentProgram = async (
  wasm: Uint8Array<ArrayBuffer>
): Promise<Uint8Array<ArrayBuffer>> => {
  const instrumenter = await loadInstrumenter();
  const input = instrumenter.alloc(wasm.length);
  new Uint8Array(instrumenter.memory.buffer, input, wasm.length).set(wasm);
  const status = instrumenter.instrument(input, wasm.length);
  // Read after the call: the instrumenter's memory may have grown.
  const output = new Uint8Array(
    instrumenter.memory.buffer,
    instrumenter.result_ptr(),
    instrumenter.result_len()
  ).slice();
  instrumenter.free_result();
  if (status !== 0) {
    throw new Error(`The instrumenter failed: ${new TextDecoder().decode(output)}`);
  }
  return output;
};

/** Compiles a C file, then instruments the program if it compiled. */
export const compileAndInstrument = async (
  fileName: string,
  source: string
): Promise<CompileResult> => {
  const compiled = await compileC(fileName, source);
  if (!compiled.ok) return compiled;
  try {
    return { ok: true, wasm: await instrumentProgram(compiled.wasm) };
  } catch (error) {
    return { ok: false, errors: error instanceof Error ? error.message : String(error) };
  }
};
