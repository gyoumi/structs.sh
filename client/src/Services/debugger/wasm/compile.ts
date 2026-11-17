import { commands, Exit } from '@yowasp/clang';
import { CompileResult } from './compiler';

const OUTPUT = 'program.wasm';

const inputPath = (fileName: string) => (fileName.startsWith('-') ? `./${fileName}` : fileName);

/**
 * Compiles one C file with clang, itself running as wasm, to a WASI program
 * with debug info. Runs anywhere: in a Web Worker in the browser, or in Node
 * for tests.
 */
export const compileC = async (fileName: string, source: string): Promise<CompileResult> => {
  const decoder = new TextDecoder();
  let errors = '';

  try {
    const files = await commands.clang(
      // -x c compiles the file as C whatever its name ends in. clang reads a
      // name like "-main.c" as an option even after --, so it gets a ./ path.
      ['-g', '-O0', '-fno-color-diagnostics', '-o', OUTPUT, '-x', 'c', inputPath(fileName)],
      { [fileName]: source },
      {
        stderr: (bytes) => {
          errors += decoder.decode(bytes ?? undefined, { stream: bytes !== null });
        },
      }
    );
    return { ok: true, wasm: files?.[OUTPUT] as Uint8Array<ArrayBuffer> };
  } catch (error) {
    if (error instanceof Exit) return { ok: false, errors };
    throw error;
  }
};
