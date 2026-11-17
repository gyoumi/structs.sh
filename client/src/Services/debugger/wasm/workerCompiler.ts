import { CompileResult, Compiler } from './compiler';
import type { CompileRequest, CompileResponse } from './compileRequest';

const startCompilerWorker = () =>
  new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });

/**
 * Compiles in a Web Worker, so loading and running clang doesn't freeze the
 * page. The worker starts on the first compile.
 */
export const createWorkerCompiler = (createWorker = startCompilerWorker): Compiler => {
  const pending = new Map<number, (result: CompileResult) => void>();
  let worker: Worker | null = null;
  let nextId = 0;

  const settleAll = (result: CompileResult) => {
    pending.forEach((resolve) => resolve(result));
    pending.clear();
  };

  const startWorker = () => {
    const created = createWorker();
    created.onmessage = ({ data }: MessageEvent<CompileResponse>) => {
      pending.get(data.id)?.(data.result);
      pending.delete(data.id);
    };
    created.onerror = (event) => {
      settleAll({
        ok: false,
        errors: `The compiler failed to load: ${event.message || 'unknown error'}`,
      });
      worker = null;
    };
    return created;
  };

  return {
    compile(fileName, source) {
      worker ??= startWorker();
      const id = nextId++;
      const request: CompileRequest = { id, fileName, source };
      return new Promise((resolve) => {
        pending.set(id, resolve);
        worker!.postMessage(request);
      });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      settleAll({ ok: false, errors: 'The compiler was stopped.' });
    },
  };
};
