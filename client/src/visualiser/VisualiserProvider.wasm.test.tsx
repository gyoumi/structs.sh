// @vitest-environment jsdom
import '@/test/setup';
import { afterEach, beforeEach, describe, expect, test, vi, type MockInstance } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { calls } from '@/test/FakeSession';
import { VisualiserProvider } from './VisualiserProvider';
import { findTopic, type Topic } from './topics';
import { useSession } from './useVisualiser';

/**
 * Step 3a (docs/hash-table.md, checkpoint 3): a topic marked `requiresWasm` waits for
 * `loadChallenges()` before it creates the drawing, shows a loading status meanwhile and an alert
 * with Retry if challenges.wasm fails. Every other topic attaches at once, with no loading flash.
 *
 * The session is the repo's FakeSession (the real one needs an SVG layout); this test records
 * which topic it was attached to. `loadChallenges` and `isChallengesLoaded` are stubbed so each
 * test decides when (and whether) the wasm build "loads".
 */

const mocks = vi.hoisted(() => ({
  attached: [] as string[],
  loadChallenges: vi.fn<() => Promise<unknown>>(),
  isChallengesLoaded: vi.fn<() => boolean>(),
}));

vi.mock('@/visualiser/session', async () => {
  const { FakeSession } = await import('@/test/FakeSession');
  class RecordingSession extends FakeSession {
    attach(topicTitle: string, canvasTheme: unknown, data?: number[]) {
      mocks.attached.push(topicTitle);
      super.attach(topicTitle, canvasTheme, data);
    }
  }
  return { VisualiserSession: RecordingSession };
});

vi.mock('@/Services/challenges/challenges', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/Services/challenges/challenges')>()),
  loadChallenges: mocks.loadChallenges,
  isChallengesLoaded: mocks.isChallengesLoaded,
}));

interface Deferred {
  promise: Promise<unknown>;
  resolve: () => void;
  reject: (error: Error) => void;
}

const deferred = (): Deferred => {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<unknown>((res, rej) => {
    resolve = () => res({});
    reject = rej;
  });
  return { promise, resolve, reject };
};

const linkedList = findTopic('linked-lists')!;
/** A stand-in wasm topic, so these checks don't depend on the hash-tables entry (topics.hashTable.test.ts covers that). */
const wasmTopic: Topic = { ...linkedList, title: 'Wasm Topic', requiresWasm: true };

/** A child that needs a live SessionContext: useSession() throws without one. */
const SessionChild = () => {
  useSession();
  return <p>drawing area</p>;
};

/** Renders the provider into a container watched from before the first render, so a loading view that flashes and goes is still seen. */
const renderProvider = (topic: Topic) => {
  const container = document.body.appendChild(document.createElement('div'));
  const observer = new MutationObserver(() => {});
  observer.observe(container, { childList: true, subtree: true });
  const result = render(
    <MemoryRouter initialEntries={[`/visualiser/${topic.slug}`]}>
      <Routes>
        <Route
          path="/visualiser/:topic/:data?"
          element={
            <VisualiserProvider topic={topic} canvasTheme={{}}>
              <SessionChild />
            </VisualiserProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
    { container }
  );
  /** Every element with a role="status" or role="alert" that was ever added, even if since removed. */
  const flashed = () =>
    observer
      .takeRecords()
      .flatMap((record) => [...record.addedNodes])
      .filter((node): node is Element => node instanceof Element)
      .flatMap((node) => [node, ...node.querySelectorAll('*')])
      .map((element) => element.getAttribute('role'))
      .filter((role) => role === 'status' || role === 'alert');
  return { ...result, flashed };
};

const child = () => screen.queryByText('drawing area');
const flush = () => act(async () => {});

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  mocks.attached.length = 0;
  mocks.loadChallenges.mockReset();
  mocks.isChallengesLoaded.mockReset().mockReturnValue(false);
  consoleError = vi.spyOn(console, 'error');
});

afterEach(() => {
  cleanup();
  consoleError.mockRestore();
  calls.length = 0;
});

describe('a topic without requiresWasm', () => {
  test('mounts its children on the first render, with no loading view, and never loads the wasm build', () => {
    mocks.loadChallenges.mockReturnValue(new Promise(() => {}));
    const { flashed } = renderProvider(linkedList);
    expect(
      child(),
      'linked-lists (no requiresWasm): children should be mounted right after the first render'
    ).not.toBeNull();
    expect(
      flashed(),
      'linked-lists: role=status/alert elements ever added (a loading flash)'
    ).toEqual([]);
    expect(
      mocks.attached,
      'linked-lists: topics the session was attached to after the first render'
    ).toEqual(['Linked Lists']);
    expect(
      mocks.loadChallenges,
      'linked-lists: loadChallenges() calls (only wasm topics load it)'
    ).not.toHaveBeenCalled();
  });
});

describe('a requiresWasm topic', () => {
  test('when the wasm build is already loaded, mounts its children on the first render with no loading view', () => {
    mocks.isChallengesLoaded.mockReturnValue(true);
    mocks.loadChallenges.mockReturnValue(Promise.resolve({}));
    const { flashed } = renderProvider(wasmTopic);
    expect(
      child(),
      'requiresWasm topic, isChallengesLoaded() true: children should be mounted right after the first render'
    ).not.toBeNull();
    expect(
      flashed(),
      'requiresWasm topic, already loaded: role=status/alert elements ever added (a loading flash)'
    ).toEqual([]);
    expect(
      mocks.attached,
      'requiresWasm topic, already loaded: topics the session was attached to'
    ).toEqual(['Wasm Topic']);
  });

  test('while loadChallenges() is pending, shows role=status and neither mounts the children nor attaches the session', async () => {
    const load = deferred();
    mocks.loadChallenges.mockReturnValue(load.promise);
    renderProvider(wasmTopic);
    await flush();
    expect(
      mocks.loadChallenges,
      'requiresWasm topic, not loaded yet: loadChallenges() calls'
    ).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('status'),
      'requiresWasm topic, loadChallenges() pending: a loading view with role="status"'
    ).not.toBeNull();
    expect(
      child(),
      'requiresWasm topic, loadChallenges() pending: children should not be mounted yet'
    ).toBeNull();
    expect(
      mocks.attached,
      'requiresWasm topic, loadChallenges() pending: session.attach should not have run yet'
    ).toEqual([]);
  });

  test('once loadChallenges() resolves, mounts the children with a live session and drops the loading view', async () => {
    const load = deferred();
    mocks.loadChallenges.mockReturnValue(load.promise);
    renderProvider(wasmTopic);
    await flush();
    mocks.isChallengesLoaded.mockReturnValue(true);
    await act(async () => load.resolve());
    expect(
      await screen.findByText('drawing area'),
      'requiresWasm topic, loadChallenges() resolved: children (which call useSession()) should mount'
    ).not.toBeNull();
    expect(
      screen.queryByRole('status'),
      'requiresWasm topic, loaded: the role="status" loading view should be gone'
    ).toBeNull();
    expect(
      screen.queryByRole('alert'),
      'requiresWasm topic, loaded: no role="alert" error view'
    ).toBeNull();
    expect(
      mocks.attached,
      'requiresWasm topic, loaded: topics the session was attached to'
    ).toEqual(['Wasm Topic']);
  });

  test('when loadChallenges() rejects, shows role=alert with a Retry button, and Retry loads again and recovers', async () => {
    const first = deferred();
    const second = deferred();
    mocks.loadChallenges.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    renderProvider(wasmTopic);
    await flush();
    await act(async () => first.reject(new Error('404 Not Found')));

    const alert = await screen.findByRole('alert');
    expect(
      alert,
      'requiresWasm topic, loadChallenges() rejected: an error view with role="alert"'
    ).not.toBeNull();
    expect(child(), 'requiresWasm topic, load failed: children should not be mounted').toBeNull();
    expect(
      mocks.attached,
      'requiresWasm topic, load failed: session.attach should not have run'
    ).toEqual([]);
    const retry = screen.getByRole('button', { name: /retry/i });
    expect(
      retry.getAttribute('type'),
      'the Retry button after a failed load: its type attribute'
    ).toBe('button');

    fireEvent.click(retry);
    await flush();
    expect(
      mocks.loadChallenges,
      'after clicking Retry: loadChallenges() calls (first load + retry)'
    ).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByRole('status'),
      'after clicking Retry, retry pending: back to the role="status" loading view'
    ).not.toBeNull();
    expect(
      screen.queryByRole('alert'),
      'after clicking Retry, retry pending: the role="alert" error view should be gone'
    ).toBeNull();

    mocks.isChallengesLoaded.mockReturnValue(true);
    await act(async () => second.resolve());
    expect(
      await screen.findByText('drawing area'),
      'after Retry resolved: children should mount'
    ).not.toBeNull();
    expect(
      screen.queryByRole('alert'),
      'after Retry resolved: no role="alert" error view'
    ).toBeNull();
    expect(
      screen.queryByRole('status'),
      'after Retry resolved: no role="status" loading view'
    ).toBeNull();
    expect(mocks.attached, 'after Retry resolved: topics the session was attached to').toEqual([
      'Wasm Topic',
    ]);
  });

  test('unmounting while loading, then the load finishing, neither throws nor attaches nor logs an error', async () => {
    const load = deferred();
    mocks.loadChallenges.mockReturnValue(load.promise);
    const { unmount } = renderProvider(wasmTopic);
    await flush();
    expect(
      () => unmount(),
      'unmounting a requiresWasm topic while loadChallenges() is pending'
    ).not.toThrow();
    mocks.isChallengesLoaded.mockReturnValue(true);
    await act(async () => load.resolve());
    expect(
      mocks.attached,
      'requiresWasm topic unmounted while loading, then the load resolved: session.attach calls'
    ).toEqual([]);
    expect(
      consoleError.mock.calls.map((args) => String(args[0])),
      'requiresWasm topic unmounted while loading, then the load resolved: console.error calls (e.g. a state update after unmount)'
    ).toEqual([]);
  });

  test('unmounting while loading, then the load failing, logs no error and raises no unhandled rejection', async () => {
    const load = deferred();
    mocks.loadChallenges.mockReturnValue(load.promise);
    const { unmount } = renderProvider(wasmTopic);
    await flush();
    unmount();
    await act(async () => load.reject(new Error('network down')));
    expect(
      consoleError.mock.calls.map((args) => String(args[0])),
      'requiresWasm topic unmounted while loading, then the load rejected: console.error calls'
    ).toEqual([]);
  });
});
