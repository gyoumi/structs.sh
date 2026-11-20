import { expect, vi } from 'vitest';
import type { Recording } from '../recording';
import type { RunnerMessage, RunRequest } from '../runRequest';
import { createStandbyRunner, RunnerWorker, StandbyRunner } from '../workerRunner';

// Helpers for the tests of wasm/workerRunner.ts and of WasmDebugger with a real
// standby runner.

/** Stands in for a runner Web Worker, so a test says when it loads and what it sends back. */
export class FakeRunnerWorker implements RunnerWorker {
  onmessage: RunnerWorker['onmessage'] = null;

  onerror: RunnerWorker['onerror'] = null;

  received: RunRequest[] = [];

  terminated = false;

  postMessage(request: RunRequest) {
    this.received.push(request);
  }

  terminate() {
    this.terminated = true;
  }

  send(message: RunnerMessage) {
    this.onmessage?.({ data: message } as MessageEvent<RunnerMessage>);
  }

  /** Raises an error event, as a worker whose script fails to load or throws does. */
  crash(message: string) {
    this.onerror?.({ message } as ErrorEvent);
  }

  /** What runner.worker.ts posts once its script and imports have loaded. */
  sendReady() {
    this.send({ type: 'ready' });
  }
}

export const WASM = new Uint8Array([0, 97, 115, 109]);

export const TIME_LIMIT = 5_000;

export const RECORDING: Recording = {
  steps: [{ function: 'main', line: 2, depth: 0, output: 'hi\n', variables: {}, heap: {} }],
  outputBeforeFirstStep: '',
  end: { exitCode: 3 },
  types: [],
};

/** A standby runner whose workers are fakes, listed in the order it started them. */
export const startStandby = () => {
  const created: FakeRunnerWorker[] = [];
  const standby = createStandbyRunner(() => {
    const worker = new FakeRunnerWorker();
    created.push(worker);
    return worker;
  });
  return { standby, created };
};

/**
 * Calls the standby runner's whenReady() detached from it, as the page's
 * recorder does (it copies the function onto the recorder).
 */
export const whenReadyOf = (standby: StandbyRunner) => {
  const { whenReady } = standby;
  return whenReady();
};

/** Which of the standby runner's workers, by start order, a message posted to `lent` reaches. */
export const reachedBy = (lent: RunnerWorker, created: FakeRunnerWorker[]) => {
  const before = created.map((worker) => worker.received.length);
  lent.postMessage({ wasm: WASM });
  return created.findIndex((worker, i) => worker.received.length > before[i]);
};

/**
 * Checks that the run just started went to the worker the standby runner started ahead
 * (the first one created), so a test that answers on that worker fails here
 * with a message, rather than with a TypeError or a hang.
 */
export const expectSentToWorkerStartedAhead = (
  created: FakeRunnerWorker[],
  programs: number,
  context: string
) => {
  expect(
    created.length,
    `${context}: workers started (one should have been started ahead)`
  ).toBeGreaterThanOrEqual(1);
  expect(created[0].received.length, `${context}: programs sent to the worker started ahead`).toBe(
    programs
  );
};

/**
 * Whether a promise has settled once pending work has run: 'pending',
 * 'resolved' or 'rejected'. Needs fake timers.
 */
export const settledState = async (promise: Promise<unknown>) => {
  let state = 'pending';
  promise.then(
    () => {
      state = 'resolved';
    },
    () => {
      state = 'rejected';
    }
  );
  await vi.advanceTimersByTimeAsync(0);
  return state;
};
