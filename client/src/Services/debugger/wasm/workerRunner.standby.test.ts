import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expectSentToWorkerStartedAhead,
  FakeRunnerWorker,
  reachedBy,
  RECORDING,
  startStandby,
  TIME_LIMIT,
  WASM,
} from './__tests__/runnerTestKit';
import { RecordResult, recordInWorker } from './workerRunner';

// createStandbyRunner keeps a worker started ahead of the next run, keeps it
// after a run it answered, and replaces it when it can't be trusted.

describe('createStandbyRunner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts one worker as soon as it is created, before any run', () => {
    const { created } = startStandby();

    expect(created.length, 'createStandbyRunner(), no take() yet: workers started').toBe(1);
    expect(
      created[0].terminated,
      'createStandbyRunner(), no take() yet: started worker terminated'
    ).toBe(false);
  });

  it('take() hands out the worker it started ahead, without starting another', () => {
    const { standby, created } = startStandby();

    const lent = standby.take();

    expect(created.length, 'createStandbyRunner() then take(): workers started in all').toBe(1);
    expect(
      reachedBy(lent, created),
      'createStandbyRunner() then take(): which worker (by start order) a postMessage on the taken one reaches'
    ).toBe(0);
  });

  it('keeps a worker that answered once its run ends, for the next run', async () => {
    const { standby, created } = startStandby();
    const options = { timeLimitMs: TIME_LIMIT };

    const first = recordInWorker(WASM, options, standby.take);
    expectSentToWorkerStartedAhead(created, 1, 'recordInWorker(standby.take), run 1');
    created[0].send({ type: 'recorded', recording: RECORDING });
    expect(
      await first,
      'recordInWorker(standby.take), run 1, worker sent a recording: result'
    ).toEqual({
      recording: RECORDING,
    });
    expect(
      created[0].terminated,
      'run 1 got its recording, then recordInWorker terminated the taken worker: is the real worker terminated'
    ).toBe(false);

    const second = recordInWorker(WASM, options, standby.take);
    expect(
      created.length,
      'two runs in a row through recordInWorker(standby.take): workers started'
    ).toBe(1);
    expect(
      created[0].received.length,
      'two runs in a row through recordInWorker(standby.take): programs the one worker was sent'
    ).toBe(2);
    created[0].send({ type: 'recorded', recording: RECORDING });
    expect(await second, 'recordInWorker(standby.take), run 2 on the kept worker: result').toEqual({
      recording: RECORDING,
    });
    expect(created.length, 'after two runs in a row: workers started').toBe(1);
  });

  it.each<{
    name: string;
    end: (worker: FakeRunnerWorker, controller: AbortController) => Promise<void> | void;
    result: RecordResult;
  }>([
    {
      name: 'the run timed out before the worker answered',
      end: () => vi.advanceTimersByTimeAsync(TIME_LIMIT).then(() => {}),
      result: { timedOut: true },
    },
    {
      name: 'the run was stopped before the worker answered',
      end: (_, controller) => controller.abort(),
      result: { stopped: true },
    },
    {
      name: 'the worker raised an error event during the run',
      end: (worker) => worker.crash('worker crashed mid-run'),
      result: { error: expect.stringContaining('worker crashed mid-run') },
    },
    {
      // Saying it has loaded isn't an answer to the run.
      name: "the worker sent only { type: 'ready' }, then the run timed out",
      end: async (worker) => {
        worker.sendReady();
        await vi.advanceTimersByTimeAsync(TIME_LIMIT);
      },
      result: { timedOut: true },
    },
  ])('terminates and replaces a worker when $name', async ({ name, end, result }) => {
    const { standby, created } = startStandby();
    const controller = new AbortController();

    const run = recordInWorker(
      WASM,
      { timeLimitMs: TIME_LIMIT, signal: controller.signal },
      standby.take
    );
    expectSentToWorkerStartedAhead(created, 1, `recordInWorker(standby.take), before ${name}`);
    await end(created[0], controller);

    expect(await run, `recordInWorker(standby.take), ${name}: result`).toEqual(result);
    expect(created[0].terminated, `${name}: is the run's worker terminated`).toBe(true);
    expect(created.length, `${name}: workers started (the first plus a replacement)`).toBe(2);
    expect(created[1].terminated, `${name}: is the replacement terminated`).toBe(false);
    expect(
      reachedBy(standby.take(), created),
      `take() after ${name}: which worker (by start order) it hands out`
    ).toBe(1);
    expect(created.length, `take() after ${name}: workers started in all`).toBe(2);
  });

  it('drops an idle worker that fails, such as its script not loading, and the next take() starts a new one', () => {
    const { standby, created } = startStandby();

    expect(
      created.length,
      'createStandbyRunner(): workers started ahead, before the idle one fails'
    ).toBe(1);
    created[0].crash('Failed to fetch runner.worker.js');

    expect(created[0].terminated, 'idle ready worker raised an error event: is it terminated').toBe(
      true
    );

    const lent = standby.take();
    expect(created.length, 'take() after the idle worker failed: workers started in all').toBe(2);
    expect(
      reachedBy(lent, created),
      'take() after the idle worker failed: which worker (by start order) it hands out (0 is the failed one)'
    ).toBe(1);
  });

  it('dispose() terminates the ready worker and starts no replacement', () => {
    const { standby, created } = startStandby();

    expect(created.length, 'createStandbyRunner(): workers started ahead, before dispose()').toBe(
      1
    );
    standby.dispose();

    expect(created[0].terminated, 'dispose() with an idle ready worker: is it terminated').toBe(
      true
    );
    expect(created.length, 'dispose(): workers started in all (no replacement)').toBe(1);
  });

  it('after dispose(), a run that ends terminates its worker and starts no replacement', async () => {
    const { standby, created } = startStandby();

    const answered = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, standby.take);
    expectSentToWorkerStartedAhead(created, 1, 'recordInWorker(standby.take), before dispose()');
    standby.dispose();
    created[0].send({ type: 'recorded', recording: RECORDING });
    expect(await answered, 'take(), dispose(), then the worker sent a recording: result').toEqual({
      recording: RECORDING,
    });
    expect(
      created[0].terminated,
      'run answered after dispose(): is its worker terminated (not kept for another run)'
    ).toBe(true);

    const unanswered = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, standby.take);
    standby.dispose();
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
