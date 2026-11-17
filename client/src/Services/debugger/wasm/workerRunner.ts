import type { RunnerMessage, RunRequest } from './runRequest';

export type RunResult = { exitCode: number } | { timedOut: true } | { error: string };

export type RunInWorkerOptions = {
  /** Called with stdout and stderr text as the program writes it. */
  onOutput: (text: string) => void;
  /** How long the program may run before it is stopped. */
  timeLimitMs: number;
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
 * Runs a compiled program in its own Web Worker, so a program that never ends
 * can't freeze the page: past the time limit the worker is stopped. Always
 * resolves, with the exit code, a time-out, or why the run failed.
 */
export const runInWorker = (
  wasm: Uint8Array<ArrayBuffer>,
  { onOutput, timeLimitMs }: RunInWorkerOptions,
  createWorker: () => RunnerWorker = startRunnerWorker
): Promise<RunResult> =>
  new Promise((resolve) => {
    let worker: RunnerWorker | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ended = false;

    const end = (result: RunResult) => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      worker?.terminate();
      resolve(result);
    };
    timer = setTimeout(() => end({ timedOut: true }), timeLimitMs);

    try {
      worker = createWorker();
      worker.onmessage = ({ data }) => {
        if (ended) return;
        if (data.type === 'output') onOutput(data.text);
        else if (data.type === 'finished') end({ exitCode: data.exitCode });
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
