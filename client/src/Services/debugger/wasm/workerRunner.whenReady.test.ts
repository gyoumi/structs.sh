import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expectSentToWorkerStartedAhead,
  RECORDING,
  settledState,
  startStandby,
  TIME_LIMIT,
  WASM,
} from './__tests__/runnerTestKit';
import { createStandbyRunner, RecordResult, recordInWorker } from './workerRunner';

// The standby runner's whenReady(): settles once the worker it holds for the
// next run has loaded (resolves), or can't load (resolves or rejects, as long
// as it doesn't hang).

describe('createStandbyRunner, knowing when its worker has loaded', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('whenReady() waits until the worker it started ahead says it has loaded', async () => {
    const { standby, created } = startStandby();
    const ready = standby.whenReady();

    expect(
      await settledState(ready),
      "createStandbyRunner(), worker started but has not sent { type: 'ready' }: whenReady()"
    ).toBe('pending');

    created[0].sendReady();

    expect(
      await settledState(ready),
      "createStandbyRunner(), then the worker sent { type: 'ready' } while idle: whenReady()"
    ).toBe('resolved');
  });

  it('whenReady() settles, rather than hanging, when the worker it holds fails to load', async () => {
    const { standby, created } = startStandby();
    const ready = standby.whenReady();

    created[0].crash('Failed to fetch runner.worker.js');

    expect(
      ['resolved', 'rejected'],
      'createStandbyRunner(), idle worker raised an error event before it loaded: whenReady() should have settled'
    ).toContain(await settledState(ready));
  });

  it('whenReady() settles, rather than hanging, when no worker can be started', async () => {
    const standby = createStandbyRunner(() => {
      throw new Error('Workers are not supported');
    });

    expect(
      ['resolved', 'rejected'],
      "createStandbyRunner() whose createWorker throws 'Workers are not supported': whenReady() should have settled"
    ).toContain(await settledState(standby.whenReady()));
  });

  it('a run started before its worker has loaded waits, then gets its recording', async () => {
    const { standby, created } = startStandby();

    const run = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, standby.take);
    expectSentToWorkerStartedAhead(
      created,
      1,
      'recordInWorker(standby.take) before the worker loaded'
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

  it('whenReady() after a worker was replaced waits for the replacement to load', async () => {
    const { standby, created } = startStandby();
    created[0].sendReady();
    const run = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, standby.take);
    await vi.advanceTimersByTimeAsync(TIME_LIMIT);
    await run;
    expect(created.length, 'run timed out: workers started (the first plus a replacement)').toBe(2);

    const ready = standby.whenReady();
    expect(
      await settledState(ready),
      "replacement started after a timed-out run, not yet sent { type: 'ready' }: whenReady()"
    ).toBe('pending');

    created[1].sendReady();
    expect(await settledState(ready), "replacement sent { type: 'ready' }: whenReady()").toBe(
      'resolved'
    );
  });

  describe('a whenReady() promise taken before a run takes the worker that has not loaded yet', () => {
    it('settles when the worker says it has loaded during the run', async () => {
      const { standby, created } = startStandby();
      const ready = standby.whenReady();

      const run = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, standby.take);
      expectSentToWorkerStartedAhead(
        created,
        1,
        'recordInWorker(standby.take) after whenReady(), before the worker loaded'
      );
      created[0].sendReady();

      expect(
        ['resolved', 'rejected'],
        "whenReady() called, then a run took the unloaded worker, then it sent { type: 'ready' } mid-run: the earlier whenReady() promise should have settled"
      ).toContain(await settledState(ready));

      created[0].send({ type: 'recorded', recording: RECORDING });
      expect(await run, 'same run, worker then sent a recording: result').toEqual({
        recording: RECORDING,
      });
    });

    it('settles when the worker answers the run without having said it loaded', async () => {
      const { standby, created } = startStandby();
      const ready = standby.whenReady();

      const run = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, standby.take);
      expectSentToWorkerStartedAhead(
        created,
        1,
        'recordInWorker(standby.take) after whenReady(), before the worker loaded'
      );
      created[0].send({ type: 'recorded', recording: RECORDING });
      expect(await run, "worker sent a recording, never { type: 'ready' }: result").toEqual({
        recording: RECORDING,
      });

      expect(
        ['resolved', 'rejected'],
        "whenReady() called, then a run took the unloaded worker, which answered with a recording (no { type: 'ready' }): the earlier whenReady() promise should have settled"
      ).toContain(await settledState(ready));
    });

    it.each<{
      name: string;
      end: (controller: AbortController) => Promise<unknown> | void;
      result: RecordResult;
    }>([
      {
        name: 'the run times out',
        end: () => vi.advanceTimersByTimeAsync(TIME_LIMIT),
        result: { timedOut: true },
      },
      {
        name: 'the run is stopped',
        end: (controller) => controller.abort(),
        result: { stopped: true },
      },
    ])(
      'settles when $name before anything arrives and the worker is terminated',
      async ({ name, end, result }) => {
        const { standby, created } = startStandby();
        const ready = standby.whenReady();
        const controller = new AbortController();

        const run = recordInWorker(
          WASM,
          { timeLimitMs: TIME_LIMIT, signal: controller.signal },
          standby.take
        );
        expectSentToWorkerStartedAhead(
          created,
          1,
          'recordInWorker(standby.take) after whenReady(), before the worker loaded'
        );
        await end(controller);
        expect(await run, `${name} before the worker sent anything: result`).toEqual(result);
        expect(
          created[0].terminated,
          `${name} before an answer: is the run's worker terminated`
        ).toBe(true);

        // It may settle straight away, or once the replacement has loaded.
        created[1]?.sendReady();
        expect(
          ['resolved', 'rejected'],
          `whenReady() called, then a run took the unloaded worker and ${name} (worker terminated; ` +
            "replacement, if any, then sent { type: 'ready' }): the earlier whenReady() promise should have settled"
        ).toContain(await settledState(ready));
      }
    );
  });

  it('whenReady() resolves for a worker kept after a run, which has loaded', async () => {
    const { standby, created } = startStandby();
    created[0].sendReady();
    const run = recordInWorker(WASM, { timeLimitMs: TIME_LIMIT }, standby.take);
    created[0].send({ type: 'recorded', recording: RECORDING });
    await run;

    expect(created.length, 'run answered: workers started (the answered one is kept)').toBe(1);
    expect(
      await settledState(standby.whenReady()),
      'whenReady() after a run whose worker answered and was kept'
    ).toBe('resolved');
  });
});
