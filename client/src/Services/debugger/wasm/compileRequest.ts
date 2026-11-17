import { loadClang } from './compile';
import { CompileResult, CompilerStatus } from './compiler';
import { compileAndInstrument, loadInstrumenter } from './instrumenter';

/** Loads clang, reporting its progress, and the much smaller instrumenter. */
const loadCompiler = async (onProgress: (done: number, total: number) => void) => {
  await Promise.all([loadClang(onProgress), loadInstrumenter()]);
};

export type CompileRequest = { id: number; fileName: string; source: string };
export type CompileResponse = { id: number; result: CompileResult };

/** Asks the worker to start downloading the compiler. */
export type LoadRequest = { load: true };
/** Tells the page how the compiler's download is going. */
export type StatusMessage = { status: CompilerStatus };

/**
 * Loads the compiler, posting its progress and then whether it is ready.
 * Resolves with why the load failed, or null once the compiler is ready.
 */
export const answerLoadRequest = async (
  post: (message: StatusMessage) => void,
  load: (onProgress: (done: number, total: number) => void) => Promise<void> = loadCompiler
) => {
  // clang downloads several files at once, and one can still report progress
  // after another has failed.
  let settled = false;
  try {
    await load((done, total) => {
      if (!settled) post({ status: { state: 'loading', done, total } });
    });
    settled = true;
    post({ status: { state: 'ready' } });
    return null;
  } catch (error) {
    settled = true;
    post({ status: { state: 'failed' } });
    return (error instanceof Error ? error.message : String(error)) || 'unknown error';
  }
};

/**
 * Answers one compile request from the page. It never rejects: if clang
 * itself fails, for example because its files didn't load, the answer is an
 * error the page can show, so a compile never hangs.
 */
export const answerCompileRequest = async (
  { id, fileName, source }: CompileRequest,
  compile: (fileName: string, source: string) => Promise<CompileResult> = compileAndInstrument
): Promise<CompileResponse> => {
  try {
    return { id, result: await compile(fileName, source) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { id, result: { ok: false, errors: `The compiler failed: ${reason}` } };
  }
};

/**
 * Answers a message from the page. A compile first makes sure the compiler
 * has loaded, reporting progress, so a retry after a failed preload shows it.
 */
export const answerCompilerMessage = async (
  data: CompileRequest | LoadRequest,
  post: (message: StatusMessage | CompileResponse) => void,
  {
    load = loadCompiler,
    compile = compileAndInstrument,
  }: {
    load?: (onProgress: (done: number, total: number) => void) => Promise<void>;
    compile?: (fileName: string, source: string) => Promise<CompileResult>;
  } = {}
) => {
  const loadError = await answerLoadRequest(post, load);
  if ('load' in data) return;
  if (loadError !== null) {
    // Answer now rather than have the compile retry the download without
    // progress. The next compile tries loading again.
    post({
      id: data.id,
      result: { ok: false, errors: `The compiler failed to load: ${loadError}` },
    });
    return;
  }
  post(await answerCompileRequest(data, compile));
};
