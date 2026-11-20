import { TIME_LIMIT_MS } from './wasm/recording';
import { createRunnerPool, RecordResult, recordInWorker } from './wasm/workerRunner';

/**
 * Extra time the worker gets past the recorder's own time limit, so the
 * recorder normally stops the program first and keeps its steps.
 */
const WORKER_GRACE_MS = 2_000;

/** What the program reads from stdin: the text typed so far, and whether end-of-file was sent. */
export type Input = { text: string; eof: boolean };

/** Records a compiled, instrumented program. */
export type Recorder = ((
  wasm: Uint8Array<ArrayBuffer>,
  options: { signal: AbortSignal; input: Input }
) => Promise<RecordResult>) & {
  /** Settles once what the next run needs has loaded, or failed to. */
  whenReady?: () => Promise<void>;
  /** Stops anything the recorder started ahead of its next run. */
  dispose?: () => void;
};

/**
 * Records in runner workers, the next one started now, alongside the compiler
 * preload, so runs don't fetch anything and keep working offline.
 */
export const createWorkerRecorder = (): Recorder => {
  const runners = createRunnerPool();
  const record: Recorder = (wasm, options) =>
    recordInWorker(
      wasm,
      { ...options, timeLimitMs: TIME_LIMIT_MS + WORKER_GRACE_MS },
      runners.take
    );
  record.whenReady = runners.whenReady;
  record.dispose = runners.dispose;
  return record;
};
