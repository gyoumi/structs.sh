import { commands, Exit } from '@yowasp/clang';
import { CompileResult } from './compiler';

const OUTPUT = 'program.wasm';

const inputPath = (fileName: string) => (fileName.startsWith('-') ? `./${fileName}` : fileName);

let clangLoad: Promise<void> | null = null;

/**
 * Downloads and prepares clang, once: later calls share the same load, so
 * a compile that starts while the compiler is still loading doesn't download
 * it again. onProgress (bytes done, bytes in total) only hears from the call
 * that started the load. A failed load can be tried again.
 */
export const loadClang = (onProgress: (done: number, total: number) => void = () => {}) => {
  clangLoad ??= Promise.resolve(
    commands.clang(undefined, undefined, {
      fetchProgress: ({ doneLength, totalLength }) => onProgress(doneLength, totalLength),
    })
  ).then(
    () => {},
    (error) => {
      clangLoad = null;
      throw error;
    }
  );
  return clangLoad;
};

/**
 * Compiles one C file with clang, itself running as wasm, to a WASI program
 * with debug info. Runs anywhere: in a Web Worker in the browser, or in Node
 * for tests.
 */
export const compileC = async (fileName: string, source: string): Promise<CompileResult> => {
  await loadClang();
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
