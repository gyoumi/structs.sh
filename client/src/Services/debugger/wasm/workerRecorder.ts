import { TIME_LIMIT_MS as RECORDER_TIME_LIMIT_MS } from './recording';
import { createStandbyRunner, RecordResult, recordInWorker } from './workerRunner';

const GRACE_FOR_RECORDER_TO_STOP_FIRST_MS = 2_000;
const WORKER_TIME_LIMIT_MS = RECORDER_TIME_LIMIT_MS + GRACE_FOR_RECORDER_TO_STOP_FIRST_MS;

/** What the program reads from stdin: the text typed so far, and whether end-of-file was sent. */
export type Input = { text: string; eof: boolean };

/** Records a compiled, instrumented program. */
export type Recorder = ((
  wasm: Uint8Array<ArrayBuffer>,
  options: { signal: AbortSignal; input: Input }
) => Promise<RecordResult>) & {
  /** Settles once what the next run needs has loaded, or failed to. */
  whenReady?: () => Promise<void>;
  dispose?: () => void;
};

export const createWorkerRecorder = (): Recorder => {
  const standby = createStandbyRunner();
  const record: Recorder = (wasm, options) =>
    recordInWorker(wasm, { ...options, timeLimitMs: WORKER_TIME_LIMIT_MS }, standby.take);
  record.whenReady = standby.whenReady;
  record.dispose = standby.dispose;
  return record;
};
