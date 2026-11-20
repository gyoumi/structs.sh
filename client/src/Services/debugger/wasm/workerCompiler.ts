import { CompileResult, Compiler, CompilerStatus } from './compilerTypes';
import type { CompileRequest, CompileResponse, LoadRequest, StatusMessage } from './compileRequest';

const startCompilerWorker = () =>
  new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });

/**
 * Compiles in a Web Worker, so loading and running clang doesn't freeze the
 * page. The worker starts on preload() or the first compile.
 */
export const createWorkerCompiler = (createWorker = startCompilerWorker): Compiler => {
  const pending = new Map<number, (result: CompileResult) => void>();
  let worker: Worker | null = null;
  let nextId = 0;
  let reportStatus: (status: CompilerStatus) => void = () => {};

  const settleAll = (result: CompileResult) => {
    pending.forEach((resolve) => resolve(result));
    pending.clear();
  };

  const startWorker = () => {
    const created = createWorker();
    created.onmessage = ({ data }: MessageEvent<CompileResponse | StatusMessage>) => {
      if ('status' in data) {
        reportStatus(data.status);
        return;
      }
      pending.get(data.id)?.(data.result);
      pending.delete(data.id);
    };
    created.onerror = (event) => {
      reportStatus({ state: 'failed' });
      settleAll({
        ok: false,
        errors: `The compiler failed to load: ${event.message || 'unknown error'}`,
      });
      // An error event doesn't always stop a worker, so stop it before
      // forgetting it.
      created.terminate();
      worker = null;
    };
    return created;
  };

  return {
    compile(fileName, source) {
      const id = nextId++;
      const request: CompileRequest = { id, fileName, source };
      return new Promise((resolve) => {
        pending.set(id, resolve);
        try {
          worker ??= startWorker();
          worker.postMessage(request);
        } catch (error) {
          pending.delete(id);
          const reason = error instanceof Error ? error.message : String(error);
          resolve({ ok: false, errors: `The compiler failed to start: ${reason}` });
        }
      });
    },
    preload(onStatus) {
      reportStatus = onStatus;
      try {
        worker ??= startWorker();
        const request: LoadRequest = { load: true };
        worker.postMessage(request);
      } catch {
        onStatus({ state: 'failed' });
      }
    },
    dispose() {
      reportStatus = () => {};
      worker?.terminate();
      worker = null;
      settleAll({ ok: false, errors: 'The compiler was stopped.' });
    },
  };
};
