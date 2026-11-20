import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeRunnerWorker, RECORDING, TIME_LIMIT, WASM } from './__tests__/runnerTestKit';
import { RecordResult, recordInWorker } from './workerRunner';

// recordInWorker on its own worker each run. The standby runner, which keeps
// a worker ready between runs, is in workerRunner.standby.test.ts and
// workerRunner.whenReady.test.ts.

/** Starts a recording on a fake worker. */
const startRun = () => {
  const worker = new FakeRunnerWorker();
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

    expect(await run.done, 'worker sent a recording: result').toEqual({ recording: RECORDING });
    expect(run.worker.received, 'messages posted to the worker').toEqual([{ wasm: WASM }]);
    expect(run.worker.terminated, 'worker sent a recording: worker terminated').toBe(true);
  });

  it('stops a program that runs past the time limit', async () => {
    const run = startRun();

    await vi.advanceTimersByTimeAsync(TIME_LIMIT - 1);
    expect(
      run.result(),
      `no answer, ${TIME_LIMIT - 1}ms of a ${TIME_LIMIT}ms limit: result`
    ).toBeUndefined();
    expect(
      run.worker.terminated,
      `${TIME_LIMIT - 1}ms of a ${TIME_LIMIT}ms limit: worker terminated`
    ).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(run.result(), `no answer by the ${TIME_LIMIT}ms limit: result`).toEqual({
      timedOut: true,
    });
    expect(run.worker.terminated, `${TIME_LIMIT}ms limit reached: worker terminated`).toBe(true);
  });

  it('ignores anything the worker sends after the run has ended', async () => {
    const run = startRun();
    await vi.advanceTimersByTimeAsync(TIME_LIMIT);

    run.worker.send({ type: 'recorded', recording: RECORDING });

    expect(await run.done, 'recording sent after the time limit: result').toEqual({
      timedOut: true,
    });
  });

  it('does not time out a program that has already finished', async () => {
    const run = startRun();
    run.worker.send({ type: 'recorded', recording: RECORDING });

    await vi.advanceTimersByTimeAsync(TIME_LIMIT * 2);

    expect(await run.done, 'recording sent, then twice the time limit passed: result').toEqual({
      recording: RECORDING,
    });
  });

  it.each([
    {
      name: "the worker sends { type: 'error', message: 'invalid module' }",
      fail: (worker: FakeRunnerWorker) => worker.send({ type: 'error', message: 'invalid module' }),
      text: 'invalid module',
    },
    {
      // Such as failing to load its script.
      name: "the worker raises an error event 'Failed to fetch runner.worker.js'",
      fail: (worker: FakeRunnerWorker) => worker.crash('Failed to fetch runner.worker.js'),
      text: 'Failed to fetch runner.worker.js',
    },
  ])('resolves with an error when $name', async ({ name, fail, text }) => {
    const run = startRun();

    fail(run.worker);

    expect(await run.done, `${name}: result`).toEqual({ error: expect.stringContaining(text) });
    expect(run.worker.terminated, `${name}: worker terminated`).toBe(true);
  });

  it('resolves with an error when the worker cannot be created', async () => {
    const result = await recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, () => {
      throw new Error('Workers are not supported');
    });

    expect(result, "createWorker threw 'Workers are not supported': result").toEqual({
      error: expect.stringContaining('Workers are not supported'),
    });
  });

  it('stops the program when the run is cancelled', async () => {
    const worker = new FakeRunnerWorker();
    const controller = new AbortController();
    const done = recordInWorker(
      WASM,
      { timeLimitMs: TIME_LIMIT, signal: controller.signal },
      () => worker
    );

    controller.abort();

    expect(await done, 'signal aborted mid-run: result').toEqual({ stopped: true });
    expect(worker.terminated, 'signal aborted mid-run: worker terminated').toBe(true);
  });

  it('does not start a run that was cancelled before it began', async () => {
    const createWorker = vi.fn(() => new FakeRunnerWorker());
    const controller = new AbortController();
    controller.abort();

    const result = await recordInWorker(
      WASM,
      { timeLimitMs: TIME_LIMIT, signal: controller.signal },
      createWorker
    );

    expect(result, 'signal aborted before the run: result').toEqual({ stopped: true });
    expect(
      createWorker,
      'signal aborted before the run: createWorker calls'
    ).not.toHaveBeenCalled();
  });

  it('uses a new worker for every run', async () => {
    const createWorker = vi.fn(() => new FakeRunnerWorker());
    const options = { timeLimitMs: TIME_LIMIT };

    const runs = [
      recordInWorker(WASM, options, createWorker),
      recordInWorker(WASM, options, createWorker),
    ];
    await vi.advanceTimersByTimeAsync(TIME_LIMIT);
    await Promise.all(runs);

    expect(
      createWorker,
      'two recordInWorker runs given createWorker: createWorker calls'
    ).toHaveBeenCalledTimes(2);
  });
});
