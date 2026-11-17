import { compileC } from './compile';
import { CompileResult } from './compiler';

export type CompileRequest = { id: number; fileName: string; source: string };
export type CompileResponse = { id: number; result: CompileResult };

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
