import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunnerMessage, RunRequest } from './runRequest';
import { RunnerWorker, RunResult, runInWorker } from './workerRunner';

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

/** Starts a run on a fake worker and tracks what the page would see. */
const startRun = () => {
  const worker = new FakeWorker();
  const output: string[] = [];
  let result: RunResult | undefined;
  const done = runInWorker(
    WASM,
    { onOutput: (text) => output.push(text), timeLimitMs: TIME_LIMIT },
    () => worker
  ).then((settled) => {
    result = settled;
    return settled;
  });
  return { worker, output, done, result: () => result };
};

describe('runInWorker', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends the program to the worker and resolves with its exit code', async () => {
    const run = startRun();

    run.worker.send({ type: 'output', text: 'one\n' });
    run.worker.send({ type: 'output', text: 'two\n' });
    run.worker.send({ type: 'finished', exitCode: 3 });

    expect(await run.done).toEqual({ exitCode: 3 });
    expect(run.worker.received).toEqual([{ wasm: WASM }]);
    expect(run.output).toEqual(['one\n', 'two\n']);
    expect(run.worker.terminated).toBe(true);
  });

  it('stops a program that runs past the time limit', async () => {
    const run = startRun();
    run.worker.send({ type: 'output', text: 'looping\n' });

    await vi.advanceTimersByTimeAsync(TIME_LIMIT - 1);
    expect(run.result()).toBeUndefined();
    expect(run.worker.terminated).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(run.result()).toEqual({ timedOut: true });
    expect(run.worker.terminated).toBe(true);
    expect(run.output).toEqual(['looping\n']);
  });

  it('ignores anything the worker sends after the run has ended', async () => {
    const run = startRun();
    await vi.advanceTimersByTimeAsync(TIME_LIMIT);

    run.worker.send({ type: 'output', text: 'late\n' });
    run.worker.send({ type: 'finished', exitCode: 0 });

    expect(await run.done).toEqual({ timedOut: true });
    expect(run.output).toEqual([]);
  });

  it('does not time out a program that has already finished', async () => {
    const run = startRun();
    run.worker.send({ type: 'finished', exitCode: 0 });

    await vi.advanceTimersByTimeAsync(TIME_LIMIT * 2);

    expect(await run.done).toEqual({ exitCode: 0 });
  });

  it('resolves with an error when the program traps', async () => {
    const run = startRun();

    run.worker.send({ type: 'error', message: 'unreachable' });

    const result = await run.done;
    expect(result).toEqual({ error: expect.stringContaining('unreachable') });
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
    const result = await runInWorker(WASM, { onOutput: () => {}, timeLimitMs: TIME_LIMIT }, () => {
      throw new Error('Workers are not supported');
    });

    expect(result).toEqual({ error: expect.stringContaining('Workers are not supported') });
  });

  it('uses a new worker for every run', async () => {
    const createWorker = vi.fn(() => new FakeWorker());
    const options = { onOutput: () => {}, timeLimitMs: TIME_LIMIT };

    const runs = [
      runInWorker(WASM, options, createWorker),
      runInWorker(WASM, options, createWorker),
    ];
    await vi.advanceTimersByTimeAsync(TIME_LIMIT);
    await Promise.all(runs);

    expect(createWorker).toHaveBeenCalledTimes(2);
  });
});
