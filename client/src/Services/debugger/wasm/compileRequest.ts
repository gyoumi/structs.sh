import { compileC, loadClang } from './compile';
import { CompileResult, CompilerStatus } from './compiler';

export type CompileRequest = { id: number; fileName: string; source: string };
export type CompileResponse = { id: number; result: CompileResult };

/** Asks the worker to start downloading the compiler. */
export type LoadRequest = { load: true };
/** Tells the page how the compiler's download is going. */
export type StatusMessage = { status: CompilerStatus };

/** Loads the compiler, posting its progress and then whether it is ready. */
export const answerLoadRequest = async (
  post: (message: StatusMessage) => void,
  load: (onProgress: (done: number, total: number) => void) => Promise<void> = loadClang
) => {
  try {
    await load((done, total) => post({ status: { state: 'loading', done, total } }));
    post({ status: { state: 'ready' } });
  } catch {
    // The reason reaches the student when they compile.
    post({ status: { state: 'failed' } });
  }
};

/**
 * Answers one compile request from the page. It never rejects: if clang
 * itself fails, for example because its files didn't load, the answer is an
 * error the page can show, so a compile never hangs.
 */
export const answerCompileRequest = async (
  { id, fileName, source }: CompileRequest,
  compile: (fileName: string, source: string) => Promise<CompileResult> = compileC
): Promise<CompileResponse> => {
  try {
    return { id, result: await compile(fileName, source) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { id, result: { ok: false, errors: `The compiler failed: ${reason}` } };
  }
};
