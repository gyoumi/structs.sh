import type { Recording } from './recording';
import type { RunnerMessage, RunRequest } from './runRequest';

export type RecordResult =
  | { recording: Recording }
  | { timedOut: true }
  | { stopped: true }
  | { error: string };

export type RecordInWorkerOptions = {
  /**
   * How long the worker may take before it is stopped. The recorder stops a
   * program at its own time limit and keeps its steps, so this only catches a
   * program stuck where the recorder can't see it, such as in a long C library
   * call.
   */
  timeLimitMs: number;
  /** Stops the program early, for example when the student compiles again. */
  signal?: AbortSignal;
  /** The input typed so far, and whether end-of-file was sent. */
  input?: { text: string; eof: boolean };
};

/** The part of a Web Worker a run uses, so tests can pass a fake one. */
export interface RunnerWorker {
  onmessage: ((event: MessageEvent<RunnerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: RunRequest): void;
  terminate(): void;
}

const startRunnerWorker = (): RunnerWorker =>
  new Worker(new URL('./runner.worker.ts', import.meta.url), { type: 'module' });

/** Hands out runner workers that were started ahead of time. */
export type RunnerPool = { take: () => RunnerWorker; dispose: () => void };

/**
 * Hands out runner workers without fetching anything at run time, so runs
 * keep working once the network is off: a new worker fetches its script
 * again. One worker is started ahead of the first run. A worker that has sent
 * its result is idle, and each run starts its program afresh, so terminating
 * it keeps it for the next run; one stopped mid-run (time-out or stop) or that
 * failed is really terminated, and a replacement starts straight away.
 */
export const createRunnerPool = (createWorker = startRunnerWorker): RunnerPool => {
  let ready: RunnerWorker | undefined;
  let disposed = false;

  const keepReady = (worker: RunnerWorker) => {
    // One that fails to load is dropped, so the next run starts its own and
    // reports why, instead of waiting out its time limit.
    worker.onmessage = null;
    worker.onerror = () => {
      worker.terminate();
      if (ready === worker) ready = undefined;
    };
    ready = worker;
  };

  const startReady = () => {
    try {
      keepReady(createWorker());
    } catch {
      // Left for the next run to start, so it reports why it couldn't.
    }
  };

  startReady();
  return {
    take() {
      const worker = ready ?? createWorker();
      ready = undefined;
      let answered = false;
      let returned = false;
      const lent: RunnerWorker = {
        onmessage: null,
        onerror: null,
        postMessage: (request) => worker.postMessage(request),
        terminate() {
          if (returned) return;
          returned = true;
          if (answered && !ready && !disposed) {
            keepReady(worker);
            return;
          }
          worker.terminate();
          if (!ready && !disposed) startReady();
        },
      };
      worker.onmessage = (event) => {
        answered = true;
        lent.onmessage?.(event);
      };
      worker.onerror = (event) => lent.onerror?.(event);
      return lent;
    },
    dispose() {
      disposed = true;
      ready?.terminate();
      ready = undefined;
    },
  };
};

/**
 * Records an instrumented program in its own Web Worker, so a program that
 * never ends can't freeze the page: past the time limit the worker is
 * stopped. Always resolves, with the recording, a time-out, or why the
 * recording failed.
 */
export const recordInWorker = (
  wasm: Uint8Array<ArrayBuffer>,
  { timeLimitMs, signal, input }: RecordInWorkerOptions,
  createWorker: () => RunnerWorker = startRunnerWorker
): Promise<RecordResult> =>
  new Promise((resolve) => {
    let worker: RunnerWorker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ended = false;

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const stop = () => end({ stopped: true });
    const end = (result: RecordResult) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', stop);
      worker?.terminate();
      resolve(result);
    };

    if (signal?.aborted) {
      stop();
      return;
    }
    signal?.addEventListener('abort', stop);
    timer = setTimeout(() => end({ timedOut: true }), timeLimitMs);

    try {
      worker = createWorker();
      worker.onmessage = ({ data }) => {
        if (data.type === 'recorded') end({ recording: data.recording });
        else end({ error: data.message });
      };
      worker.onerror = (event) => {
        end({ error: `The program runner failed: ${event.message || 'unknown error'}` });
      };
      // Copied, not transferred, so the caller can run the same program again.
      worker.postMessage(input ? { wasm, input } : { wasm });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      end({ error: `The program runner failed to start: ${reason}` });
    }
  });
