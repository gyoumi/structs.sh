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
