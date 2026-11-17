import { CompileResult, Compiler } from './compiler';
import type { CompileRequest } from './compiler.worker';

/**
 * Compiles in a Web Worker, so loading and running clang doesn't freeze the
 * page. The worker starts on the first compile.
 */
export const createWorkerCompiler = (): Compiler => {
  const pending = new Map<number, (result: CompileResult) => void>();
  let worker: Worker | null = null;
  let nextId = 0;

  const startWorker = () => {
    const created = new Worker(new URL('./compiler.worker.ts', import.meta.url), {
      type: 'module',
    });
    created.onmessage = ({ data }: MessageEvent<{ id: number; result: CompileResult }>) => {
      pending.get(data.id)?.(data.result);
      pending.delete(data.id);
    };
    created.onerror = (event) => {
      const failed: CompileResult = {
        ok: false,
        errors: `The compiler failed to load: ${event.message || 'unknown error'}`,
      };
      pending.forEach((resolve) => resolve(failed));
      pending.clear();
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
  };
};
