import type { Recording } from './recording';
import type { RunnerMessage, RunRequest } from './runRequest';

export type RecordResult =
  | { recording: Recording }
  | { timedOut: true }
  | { stopped: true }
  | { error: string };

export type RecordInWorkerOptions = {
  /**
   * A backstop: the recorder stops a program at its own, shorter time limit
   * and keeps its steps, so this only catches a program stuck where the
   * recorder can't see it, such as in a long C library call.
   */
  timeLimitMs: number;
  signal?: AbortSignal;
  /** The input typed so far, and whether end-of-file was sent. */
  input?: { text: string; eof: boolean };
};

export interface RunnerWorker {
  onmessage: ((event: MessageEvent<RunnerMessage>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(request: RunRequest): void;
  terminate(): void;
}

const startRunnerWorker = (): RunnerWorker =>
  new Worker(new URL('./runner.worker.ts', import.meta.url), { type: 'module' });

export type StandbyRunner = {
  take: () => RunnerWorker;
  /** Settles once the worker held for the next run has loaded, or failed to. */
  whenReady: () => Promise<void>;
  dispose: () => void;
};

type StandbyStage =
  | { stage: 'empty' }
  | { stage: 'holding'; worker: RunnerWorker; loaded: () => void }
  | { stage: 'disposed' };

type LoanStage = 'waiting' | 'answered' | 'returned';

/**
 * Hands out runner workers without fetching anything at run time, as a new
 * worker fetches its script again, which fails once the network is off. One
 * worker is started ahead of the first run.
 */
export const createStandbyRunner = (createWorker = startRunnerWorker): StandbyRunner => {
  let stage: StandbyStage = { stage: 'empty' };
  let readyLoaded: Promise<void> = Promise.resolve();

  const keepReady = (worker: RunnerWorker, loaded: () => void) => {
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') loaded();
    };
    worker.onerror = () => {
      loaded();
      worker.terminate();
      if (stage.stage === 'holding' && stage.worker === worker) stage = { stage: 'empty' };
    };
    stage = { stage: 'holding', worker, loaded };
  };

  const startReady = () => {
    let loaded = () => {};
    readyLoaded = new Promise((resolve) => {
      loaded = resolve;
    });
    try {
      keepReady(createWorker(), loaded);
    } catch {
      loaded();
    }
  };

  startReady();
  return {
    take() {
      const held = stage.stage === 'holding' ? stage : null;
      const loaded = held ? held.loaded : () => {};
      const worker = held ? held.worker : createWorker();
      if (held) stage = { stage: 'empty' };
      let loan: LoanStage = 'waiting';
      const release = () => {
        if (loan === 'returned') return;
        const answered = loan === 'answered';
        loan = 'returned';
        loaded();
        if (answered && stage.stage === 'empty') {
          keepReady(worker, () => {});
          readyLoaded = Promise.resolve();
          return;
        }
        worker.terminate();
        if (stage.stage === 'empty') startReady();
      };
      const lent: RunnerWorker = {
        onmessage: null,
        onerror: null,
        postMessage: (request) => worker.postMessage(request),
        terminate: release,
      };
      worker.onmessage = (event) => {
        loaded();
        if (event.data.type !== 'ready' && loan === 'waiting') loan = 'answered';
        lent.onmessage?.(event);
      };
      worker.onerror = (event) => {
        loaded();
        lent.onerror?.(event);
      };
      return lent;
    },
    whenReady: () => readyLoaded,
    dispose() {
      const held = stage;
      stage = { stage: 'disposed' };
      if (held.stage === 'holding') held.worker.terminate();
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
        // Only says its script loaded: a run sent before then just waits.
        if (data.type === 'ready') return;
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
