import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recording } from './recording';
import type { RunnerMessage, RunRequest } from './runRequest';
import { RecordResult, recordInWorker, RunnerWorker } from './workerRunner';

/** Stands in for the runner worker, so a test can say what it sends back. */
class FakeWorker implements RunnerWorker {
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

  crash(message: string) {
    this.onerror?.({ message } as ErrorEvent);
  }
}

const WASM = new Uint8Array([0, 97, 115, 109]);
const TIME_LIMIT = 5_000;
const RECORDING: Recording = {
  steps: [{ function: 'main', line: 2, depth: 0, output: 'hi\n', variables: {} }],
  outputBeforeFirstStep: '',
  end: { exitCode: 3 },
  types: [],
};

/** Starts a recording on a fake worker. */
const startRun = () => {
  const worker = new FakeWorker();
  let result: RecordResult | undefined;
  const done = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, () => worker).then((settled) => {
    result = settled;
    return settled;
  });
  return { worker, done, result: () => result };
};

describe('recordInWorker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the program to the worker and resolves with its recording', async () => {
    const run = startRun();

    run.worker.send({ type: 'recorded', recording: RECORDING });

    expect(await run.done).toEqual({ recording: RECORDING });
    expect(run.worker.received).toEqual([{ wasm: WASM }]);
    expect(run.worker.terminated).toBe(true);
  });

  it('stops a program that runs past the time limit', async () => {
    const run = startRun();

    await vi.advanceTimersByTimeAsync(TIME_LIMIT - 1);
    expect(run.result()).toBeUndefined();
    expect(run.worker.terminated).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(run.result()).toEqual({ timedOut: true });
    expect(run.worker.terminated).toBe(true);
  });

  it('ignores anything the worker sends after the run has ended', async () => {
    const run = startRun();
    await vi.advanceTimersByTimeAsync(TIME_LIMIT);

    run.worker.send({ type: 'recorded', recording: RECORDING });

    expect(await run.done).toEqual({ timedOut: true });
  });

  it('does not time out a program that has already finished', async () => {
    const run = startRun();
    run.worker.send({ type: 'recorded', recording: RECORDING });

    await vi.advanceTimersByTimeAsync(TIME_LIMIT * 2);

    expect(await run.done).toEqual({ recording: RECORDING });
  });

  it('resolves with an error when the worker reports one', async () => {
    const run = startRun();

    run.worker.send({ type: 'error', message: 'invalid module' });

    const result = await run.done;
    expect(result).toEqual({ error: expect.stringContaining('invalid module') });
    expect(run.worker.terminated).toBe(true);
  });

  it('resolves with an error when the worker itself fails, such as failing to load', async () => {
    const run = startRun();

    run.worker.crash('Failed to fetch runner.worker.js');

    const result = await run.done;
    expect(result).toEqual({ error: expect.stringContaining('Failed to fetch runner.worker.js') });
    expect(run.worker.terminated).toBe(true);
  });

  it('resolves with an error when the worker cannot be created', async () => {
    const result = await recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, () => {
      throw new Error('Workers are not supported');
    });

    expect(result).toEqual({ error: expect.stringContaining('Workers are not supported') });
  });

  it('stops the program when the run is cancelled', async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const done = recordInWorker(
      WASM,
      { timeLimitMs: TIME_LIMIT, signal: controller.signal },
      () => worker
    );

    controller.abort();

    expect(await done).toEqual({ stopped: true });
    expect(worker.terminated).toBe(true);
  });

  it('does not start a run that was cancelled before it began', async () => {
    const createWorker = vi.fn(() => new FakeWorker());
    const controller = new AbortController();
    controller.abort();

    const result = await recordInWorker(
      WASM,
      { timeLimitMs: TIME_LIMIT, signal: controller.signal },
      createWorker
    );

    expect(result).toEqual({ stopped: true });
    expect(createWorker).not.toHaveBeenCalled();
  });

  it('uses a new worker for every run', async () => {
    const createWorker = vi.fn(() => new FakeWorker());
    const options = { timeLimitMs: TIME_LIMIT };

    const runs = [
      recordInWorker(WASM, options, createWorker),
      recordInWorker(WASM, options, createWorker),
    ];
    await vi.advanceTimersByTimeAsync(TIME_LIMIT);
    await Promise.all(runs);

    expect(createWorker).toHaveBeenCalledTimes(2);
  });
});
