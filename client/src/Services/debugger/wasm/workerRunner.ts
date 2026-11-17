import type { RunnerMessage, RunRequest } from './runRequest';

export type RunResult =
  | { exitCode: number }
  | { timedOut: true }
  | { stopped: true }
  | { error: string };

export type RunInWorkerOptions = {
  /** Called with stdout and stderr text as the program writes it. */
  onOutput: (text: string) => void;
  /** How long the program may run before it is stopped. */
  timeLimitMs: number;
  /** Stops the program early, for example when the student compiles again. */
  signal?: AbortSignal;
};

/** The part of a Web Worker a run uses, so tests can pass a fake one. */
export interface RunnerWorker {
  onmessage: ((event: MessageEvent<RunnerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: RunRequest): void;
  terminate(): void;
}

/**
 * How long output collects before it goes to the console in one update. A
 * printing loop sends thousands of small writes, and the console redraws on
 * each update.
 */
const OUTPUT_BATCH_MS = 50;

const startRunnerWorker = (): RunnerWorker =>
  new Worker(new URL('./runner.worker.ts', import.meta.url), { type: 'module' });

/**
 * Runs a compiled program in its own Web Worker, so a program that never ends
 * can't freeze the page: past the time limit the worker is stopped. Always
 * resolves, with the exit code, a time-out, or why the run failed.
 */
export const runInWorker = (
  wasm: Uint8Array<ArrayBuffer>,
  { onOutput, timeLimitMs, signal }: RunInWorkerOptions,
  createWorker: () => RunnerWorker = startRunnerWorker
): Promise<RunResult> =>
  new Promise((resolve) => {
    let worker: RunnerWorker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ended = false;
    let batch = '';
    let batchTimer: ReturnType<typeof setTimeout> | undefined;

    const flushOutput = () => {
      clearTimeout(batchTimer);
      batchTimer = undefined;
      if (!batch) return;
      const text = batch;
      batch = '';
      onOutput(text);
    };

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const stop = () => end({ stopped: true });
    const end = (result: RunResult) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      if ('stopped' in result) clearTimeout(batchTimer);
      else flushOutput();
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
        if (ended) return;
        if (data.type === 'output') {
          batch += data.text;
          batchTimer ??= setTimeout(flushOutput, OUTPUT_BATCH_MS);
        } else if (data.type === 'finished') end({ exitCode: data.exitCode });
        else end({ error: data.message });
      };
      worker.onerror = (event) => {
        end({ error: `The program runner failed: ${event.message || 'unknown error'}` });
      };
      // Copied, not transferred, so the caller can run the same program again.
      worker.postMessage({ wasm });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      end({ error: `The program runner failed to start: ${reason}` });
    }
  });
