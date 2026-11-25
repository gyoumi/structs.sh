import type { BrowserContext, Page } from '@playwright/test';

/** The controls `withTabLifecycle` puts on `window.e2eTab`. */
export interface TabControls {
  hide(): void;
  show(): void;
  freeze(): void;
  resume(): void;
}

/**
 * Lets tests hide and freeze tabs as a real browser does. Headless Chromium keeps every page visible and
 * animating, and `Page.setWebLifecycleState` (CDP) frozen neither fired `freeze`/`resume` nor held back
 * `BroadcastChannel` messages there (checked on 6b632f38), so this init script plays the browser's part
 * on every page the context opens from now on:
 * - hidden: `document.visibilityState` is "hidden" and `document.hidden` true, `visibilitychange` fires on
 *   the way in and out, and `requestAnimationFrame` callbacks wait until the tab is shown (messages and
 *   timers still run, as in a real background tab);
 * - frozen (from visible): `freeze` fires on the way in and `resume` on the way out; while frozen,
 *   `BroadcastChannel` message listeners, `setTimeout` callbacks and animation frames wait, then run in order
 *   after `resume`, and the tab is visible again.
 */
export async function withTabLifecycle(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    /** A frozen tab here is one that was visible (the tests freeze a visible tab, as DevTools can). */
    let state: 'visible' | 'hidden' | 'frozen' = 'visible';
    const realFrame = window.requestAnimationFrame.bind(window);
    const realCancel = window.cancelAnimationFrame.bind(window);
    const realTimeout = window.setTimeout.bind(window);
    const frames = new Map<number, FrameRequestCallback>();
    const tasks: (() => void)[] = [];
    let nextId = -1;
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get: () => (state === 'hidden' ? 'hidden' : 'visible') });
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get: () => state === 'hidden' });
    window.requestAnimationFrame = (callback) => {
      if (state === 'visible') return realFrame(callback);
      const id = nextId;
      nextId -= 1;
      frames.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id) => {
      if (id < 0) frames.delete(id);
      else realCancel(id);
    };
    window.setTimeout = ((handler: TimerHandler, ms?: number, ...args: unknown[]) =>
      realTimeout(() => {
        const run = () => (typeof handler === 'function' ? (handler as (...a: unknown[]) => void)(...args) : undefined);
        if (state === 'frozen') tasks.push(run);
        else run();
      }, ms)) as typeof window.setTimeout;
    const Real = window.BroadcastChannel;
    if (Real) {
      const wrapped = new WeakMap<object, EventListener>();
      const hold = (channel: BroadcastChannel, listener: (event: MessageEvent) => void) => (event: Event) => {
        if (state === 'frozen') tasks.push(() => listener.call(channel, event as MessageEvent));
        else listener.call(channel, event as MessageEvent);
      };
      class HeldChannel extends Real {
        private handler: ((event: MessageEvent) => void) | null = null;
        addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void {
          if (type !== 'message') return super.addEventListener(type, listener, options);
          const fn = typeof listener === 'function' ? listener : (event: Event) => listener.handleEvent(event);
          const held = hold(this, fn as (event: MessageEvent) => void);
          wrapped.set(listener, held);
          super.addEventListener(type, held, options);
        }
        removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void {
          super.removeEventListener(type, wrapped.get(listener) ?? listener, options);
        }
        get onmessage(): ((event: MessageEvent) => void) | null {
          return this.handler;
        }
        set onmessage(fn: ((event: MessageEvent) => void) | null) {
          this.handler = fn;
          super.onmessage = fn ? hold(this, fn) : null;
        }
      }
      window.BroadcastChannel = HeldChannel;
    }
    const runFrames = () => {
      const waiting = [...frames.values()];
      frames.clear();
      waiting.forEach((callback) => realFrame(callback));
    };
    const controls = {
      hide: () => {
        state = 'hidden';
        document.dispatchEvent(new Event('visibilitychange'));
      },
      show: () => {
        state = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        runFrames();
      },
      freeze: () => {
        document.dispatchEvent(new Event('freeze'));
        state = 'frozen';
      },
      resume: () => {
        state = 'visible';
        document.dispatchEvent(new Event('resume'));
        tasks.splice(0).forEach((task) => task());
        runFrames();
      },
    };
    (window as unknown as { e2eTab: typeof controls }).e2eTab = controls;
  });
}

/** Calls one of `withTabLifecycle`'s controls in `page`, which must have been opened after `withTabLifecycle`. */
export async function controlTab(page: Page, action: keyof TabControls): Promise<void> {
  await page.evaluate((name) => (window as unknown as { e2eTab: TabControls }).e2eTab[name](), action);
}
