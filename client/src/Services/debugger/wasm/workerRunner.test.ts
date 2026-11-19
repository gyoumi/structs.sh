import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Recording } from './recording';
import type { RunnerMessage, RunRequest } from './runRequest';
import {
  createRunnerPool,
  RecordResult,
  recordInWorker,
  RunnerPool,
  RunnerWorker,
} from './workerRunner';

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

  /**
   * Says the worker's script and imports have loaded. The message is
   * `{ type: 'ready' }`, which runner.worker.ts posts once it has loaded.
   */
  sendReady() {
    this.onmessage?.({ data: { type: 'ready' } } as unknown as MessageEvent<RunnerMessage>);
  }
}

const WASM = new Uint8Array([0, 97, 115, 109]);
const TIME_LIMIT = 5_000;
const RECORDING: Recording = {
  steps: [{ function: 'main', line: 2, depth: 0, output: 'hi\n', variables: {}, heap: {} }],
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

  it('resolves with an error when the worker reports one', async () => {
    const run = startRun();

    run.worker.send({ type: 'error', message: 'invalid module' });

    const result = await run.done;
    expect(result, "worker sent { type: 'error', message: 'invalid module' }: result").toEqual({
      error: expect.stringContaining('invalid module'),
    });
    expect(run.worker.terminated, 'worker sent an error message: worker terminated').toBe(true);
  });

  it('resolves with an error when the worker itself fails, such as failing to load', async () => {
    const run = startRun();

    run.worker.crash('Failed to fetch runner.worker.js');

    const result = await run.done;
    expect(
      result,
      "worker raised an error event 'Failed to fetch runner.worker.js': result"
    ).toEqual({
      error: expect.stringContaining('Failed to fetch runner.worker.js'),
    });
    expect(run.worker.terminated, 'worker raised an error event: worker terminated').toBe(true);
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
    const worker = new FakeWorker();
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
    const createWorker = vi.fn(() => new FakeWorker());
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
    const createWorker = vi.fn(() => new FakeWorker());
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

/** A pool whose workers are fakes, listed in the order the pool started them. */
const startPool = () => {
  const created: FakeWorker[] = [];
  const pool = createRunnerPool(() => {
    const worker = new FakeWorker();
    created.push(worker);
    return worker;
  });
  return { pool, created };
};

/** Which of the pool's workers, by start order, a message posted to `lent` reaches. */
const reachedBy = (lent: RunnerWorker, created: FakeWorker[]) => {
  const before = created.map((worker) => worker.received.length);
  lent.postMessage({ wasm: WASM });
  return created.findIndex((worker, i) => worker.received.length > before[i]);
};

/**
 * Checks that the run just started went to the worker the pool started ahead
 * (the first one created), so a test that answers on that worker fails here
 * with a message, rather than with a TypeError or a hang.
 */
const expectSentToWorkerStartedAhead = (
  created: FakeWorker[],
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

describe('createRunnerPool', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts one worker as soon as it is created, before any run', () => {
    const { created } = startPool();

    expect(created.length, 'createRunnerPool(), no take() yet: workers started').toBe(1);
    expect(
      created[0].terminated,
      'createRunnerPool(), no take() yet: started worker terminated'
    ).toBe(false);
  });

  it('take() hands out the worker it started ahead, without starting another', () => {
    const { pool, created } = startPool();

    const lent = pool.take();

    expect(created.length, 'createRunnerPool() then take(): workers started in all').toBe(1);
    expect(
      reachedBy(lent, created),
      'createRunnerPool() then take(): which worker (by start order) a postMessage on the taken one reaches'
    ).toBe(0);
  });

  it('keeps a worker that answered once its run ends, for the next run', async () => {
    const { pool, created } = startPool();
    const options = { timeLimitMs: TIME_LIMIT };

    const first = recordInWorker(WASM, options, pool.take);
    expectSentToWorkerStartedAhead(created, 1, 'recordInWorker(pool.take), run 1');
    created[0].send({ type: 'recorded', recording: RECORDING });
    expect(
      await first,
      'recordInWorker(pool.take), run 1, worker sent a recording: result'
    ).toEqual({
      recording: RECORDING,
    });
    expect(
      created[0].terminated,
      'run 1 got its recording, then recordInWorker terminated the taken worker: is the real worker terminated'
    ).toBe(false);

    const second = recordInWorker(WASM, options, pool.take);
    expect(
      created.length,
      'two runs in a row through recordInWorker(pool.take): workers started'
    ).toBe(1);
    expect(
      created[0].received.length,
      'two runs in a row through recordInWorker(pool.take): programs the one worker was sent'
    ).toBe(2);
    created[0].send({ type: 'recorded', recording: RECORDING });
    expect(await second, 'recordInWorker(pool.take), run 2 on the kept worker: result').toEqual({
      recording: RECORDING,
    });
    expect(created.length, 'after two runs in a row: workers started').toBe(1);
  });

  it('terminates a worker whose run timed out before it answered, and starts a replacement', async () => {
    const { pool, created } = startPool();

    const run = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, pool.take);
    await vi.advanceTimersByTimeAsync(TIME_LIMIT);

    expect(await run, 'recordInWorker(pool.take), worker never answered: result').toEqual({
      timedOut: true,
    });
    expect(
      created[0].terminated,
      'run timed out before an answer: is the real worker terminated'
    ).toBe(true);
    expect(
      created.length,
      'run timed out before an answer: workers started (the first plus a replacement)'
    ).toBe(2);
    expect(created[1].terminated, 'run timed out: is the replacement terminated').toBe(false);
    expect(
      reachedBy(pool.take(), created),
      'take() after a timed-out run: which worker (by start order) it hands out'
    ).toBe(1);
    expect(created.length, 'take() after a timed-out run: workers started in all').toBe(2);
  });

  it('terminates a worker whose run was stopped before it answered, and starts a replacement', async () => {
    const { pool, created } = startPool();
    const controller = new AbortController();

    const run = recordInWorker(
      WASM,
      { timeLimitMs: TIME_LIMIT, signal: controller.signal },
      pool.take
    );
    controller.abort();

    expect(await run, 'recordInWorker(pool.take), stopped before an answer: result').toEqual({
      stopped: true,
    });
    expect(
      created[0].terminated,
      'run stopped before an answer: is the real worker terminated'
    ).toBe(true);
    expect(
      created.length,
      'run stopped before an answer: workers started (the first plus a replacement)'
    ).toBe(2);
    expect(created[1].terminated, 'run stopped: is the replacement terminated').toBe(false);
  });

  it('terminates and replaces a worker that fails during a run', async () => {
    const { pool, created } = startPool();

    const run = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, pool.take);
    expectSentToWorkerStartedAhead(
      created,
      1,
      'recordInWorker(pool.take), before the worker fails'
    );
    created[0].crash('worker crashed mid-run');

    expect(await run, 'recordInWorker(pool.take), worker raised an error event: result').toEqual({
      error: expect.stringContaining('worker crashed mid-run'),
    });
    expect(created[0].terminated, 'worker raised an error during its run: is it terminated').toBe(
      true
    );
    expect(
      created.length,
      'worker raised an error during its run: workers started (the first plus a replacement)'
    ).toBe(2);
    expect(created[1].terminated, 'worker failed mid-run: is the replacement terminated').toBe(
      false
    );
    expect(
      reachedBy(pool.take(), created),
      'take() after a run whose worker failed: which worker (by start order) it hands out'
    ).toBe(1);
  });

  it('drops an idle worker that fails, such as its script not loading, and the next take() starts a new one', () => {
    const { pool, created } = startPool();

    expect(
      created.length,
      'createRunnerPool(): workers started ahead, before the idle one fails'
    ).toBe(1);
    created[0].crash('Failed to fetch runner.worker.js');

    expect(created[0].terminated, 'idle ready worker raised an error event: is it terminated').toBe(
      true
    );

    const lent = pool.take();
    expect(created.length, 'take() after the idle worker failed: workers started in all').toBe(2);
    expect(
      reachedBy(lent, created),
      'take() after the idle worker failed: which worker (by start order) it hands out (0 is the failed one)'
    ).toBe(1);
  });

  it('dispose() terminates the ready worker and starts no replacement', () => {
    const { pool, created } = startPool();

    expect(created.length, 'createRunnerPool(): workers started ahead, before dispose()').toBe(1);
    pool.dispose();

    expect(created[0].terminated, 'dispose() with an idle ready worker: is it terminated').toBe(
      true
    );
    expect(created.length, 'dispose(): workers started in all (no replacement)').toBe(1);
  });

  it('after dispose(), a run that ends terminates its worker and starts no replacement', async () => {
    const { pool, created } = startPool();

    const answered = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, pool.take);
    expectSentToWorkerStartedAhead(created, 1, 'recordInWorker(pool.take), before dispose()');
    pool.dispose();
    created[0].send({ type: 'recorded', recording: RECORDING });
    expect(await answered, 'take(), dispose(), then the worker sent a recording: result').toEqual({
      recording: RECORDING,
    });
    expect(
      created[0].terminated,
      'run answered after dispose(): is its worker terminated (not kept for another run)'
    ).toBe(true);

    const unanswered = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, pool.take);
    pool.dispose();
    await vi.advanceTimersByTimeAsync(TIME_LIMIT);
    expect(await unanswered, 'take() after dispose(), worker never answered: result').toEqual({
      timedOut: true,
    });
    expect(
      created.length,
      'two runs ended after dispose(): workers started in all (one per take(), no replacements)'
    ).toBe(2);
  });
});

/**
 * The pool's whenReady(): settles once the worker it holds for the next run
 * has loaded (resolves), or can't load (resolves or rejects, as long as it
 * doesn't hang). Reached through a cast so this file type-checks before the
 * pool has it.
 */
const whenReadyOf = (pool: RunnerPool) => {
  const { whenReady } = pool as RunnerPool & { whenReady?: () => Promise<void> };
  expect(
    typeof whenReady,
    'createRunnerPool(): pool.whenReady, which says when the worker it holds has loaded'
  ).toBe('function');
  return whenReady!();
};

/** Whether a promise has settled once pending work has run: 'pending', 'resolved' or 'rejected'. */
const settledState = async (promise: Promise<unknown>) => {
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

describe('createRunnerPool, knowing when its worker has loaded', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('whenReady() waits until the worker it started ahead says it has loaded', async () => {
    const { pool, created } = startPool();
    const ready = whenReadyOf(pool);

    expect(
      await settledState(ready),
      "createRunnerPool(), worker started but has not sent { type: 'ready' }: whenReady()"
    ).toBe('pending');

    created[0].sendReady();

    expect(
      await settledState(ready),
      "createRunnerPool(), then the worker sent { type: 'ready' } while idle: whenReady()"
    ).toBe('resolved');
  });

  it('whenReady() settles, rather than hanging, when the worker it holds fails to load', async () => {
    const { pool, created } = startPool();
    const ready = whenReadyOf(pool);

    created[0].crash('Failed to fetch runner.worker.js');

    expect(
      ['resolved', 'rejected'],
      'createRunnerPool(), idle worker raised an error event before it loaded: whenReady() should have settled'
    ).toContain(await settledState(ready));
  });

  it('whenReady() settles, rather than hanging, when no worker can be started', async () => {
    const pool = createRunnerPool(() => {
      throw new Error('Workers are not supported');
    });

    expect(
      ['resolved', 'rejected'],
      "createRunnerPool() whose createWorker throws 'Workers are not supported': whenReady() should have settled"
    ).toContain(await settledState(whenReadyOf(pool)));
  });

  it('a run started before its worker has loaded waits, then gets its recording', async () => {
    const { pool, created } = startPool();

    const run = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, pool.take);
    expectSentToWorkerStartedAhead(
      created,
      1,
      'recordInWorker(pool.take) before the worker loaded'
    );
    created[0].sendReady();
    expect(
      await settledState(run),
      "run started before the worker loaded, then the worker sent { type: 'ready' }: the run should still be waiting for its recording"
    ).toBe('pending');
    created[0].send({ type: 'recorded', recording: RECORDING });

    expect(
      await run,
      "run started before the worker loaded; worker sent { type: 'ready' }, then a recording: result"
    ).toEqual({ recording: RECORDING });
  });

  it('a worker that only said it loaded has not answered: a run that times out still terminates and replaces it', async () => {
    const { pool, created } = startPool();

    const run = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, pool.take);
    expectSentToWorkerStartedAhead(
      created,
      1,
      'recordInWorker(pool.take) before the worker loaded'
    );
    created[0].sendReady();
    await vi.advanceTimersByTimeAsync(TIME_LIMIT);

    expect(
      await run,
      "worker sent { type: 'ready' } but no recording within the time limit: result"
    ).toEqual({ timedOut: true });
    expect(
      created[0].terminated,
      "worker sent only { type: 'ready' }, then the run timed out: is the real worker terminated"
    ).toBe(true);
    expect(created.length, 'run timed out: workers started (the first plus a replacement)').toBe(2);
  });

  it('whenReady() after a worker was replaced waits for the replacement to load', async () => {
    const { pool, created } = startPool();
    created[0].sendReady();
    const run = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, pool.take);
    await vi.advanceTimersByTimeAsync(TIME_LIMIT);
    await run;
    expect(created.length, 'run timed out: workers started (the first plus a replacement)').toBe(2);

    const ready = whenReadyOf(pool);
    expect(
      await settledState(ready),
      "replacement started after a timed-out run, not yet sent { type: 'ready' }: whenReady()"
    ).toBe('pending');

    created[1].sendReady();
    expect(await settledState(ready), "replacement sent { type: 'ready' }: whenReady()").toBe(
      'resolved'
    );
  });

  it('whenReady() resolves for a worker kept after a run, which has loaded', async () => {
    const { pool, created } = startPool();
    created[0].sendReady();
    const run = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, pool.take);
    created[0].send({ type: 'recorded', recording: RECORDING });
    await run;

    expect(created.length, 'run answered: workers started (the answered one is kept)').toBe(1);
    expect(
      await settledState(whenReadyOf(pool)),
      'whenReady() after a run whose worker answered and was kept'
    ).toBe('resolved');
  });
});
