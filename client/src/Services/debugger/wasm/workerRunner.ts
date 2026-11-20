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
  /** Stops the program early, for example when the user compiles again. */
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
export type RunnerPool = {
  take: () => RunnerWorker;
  /**
   * Settles once the worker held for the next run has loaded, or failed to,
   * so the page can say when it no longer needs the network.
   */
  whenReady: () => Promise<void>;
  dispose: () => void;
};

/**
 * The worker a pool holds for the next run: none, so the next run starts its
 * own; one, with what settles whenReady() once it has loaded; or none ever
 * again, once the pool is disposed.
 */
type PoolStage =
  | { stage: 'empty' }
  | { stage: 'holding'; worker: RunnerWorker; loaded: () => void }
  | { stage: 'disposed' };

/**
 * A worker lent to a run: waiting for its answer, having answered (so it has
 * loaded, and is idle once the run is over), or given back.
 */
type LoanStage = 'waiting' | 'answered' | 'returned';

/**
 * Hands out runner workers without fetching anything at run time, so runs
 * keep working once the network is off: a new worker fetches its script
 * again. One worker is started ahead of the first run. A worker that has sent
 * its result is idle, and each run starts its program afresh, so terminating
 * it keeps it for the next run; one stopped mid-run (time-out or stop) or that
 * failed is really terminated, and a replacement starts straight away.
 */
export const createRunnerPool = (createWorker = startRunnerWorker): RunnerPool => {
  let stage: PoolStage = { stage: 'empty' };
  let readyLoaded: Promise<void> = Promise.resolve();

  /** Holds a worker for the next run; `loaded` settles once it has loaded. */
  const keepReady = (worker: RunnerWorker, loaded: () => void) => {
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') loaded();
    };
    // One that fails to load is dropped, so the next run starts its own and
    // reports why, instead of waiting out its time limit.
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
      // Left for the next run to start, so it reports why it couldn't.
      loaded();
    }
  };

  startReady();
  return {
    take() {
      // A run can take the held worker before it has loaded, so the run
      // settles whenReady() instead: once the worker says anything (it has
      // loaded), fails, or is terminated (it's gone).
      const held = stage.stage === 'holding' ? stage : null;
      const loaded = held ? held.loaded : () => {};
      const worker = held ? held.worker : createWorker();
      if (held) stage = { stage: 'empty' };
      let loan: LoanStage = 'waiting';
      const lent: RunnerWorker = {
        onmessage: null,
        onerror: null,
        postMessage: (request) => worker.postMessage(request),
        terminate() {
          if (loan === 'returned') return;
          const answered = loan === 'answered';
          loan = 'returned';
          loaded();
          // Having answered a run, it has loaded.
          if (answered && stage.stage === 'empty') {
            keepReady(worker, () => {});
            readyLoaded = Promise.resolve();
            return;
          }
          worker.terminate();
          if (stage.stage === 'empty') startReady();
        },
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
