import { expect, type Page, type Route } from '@playwright/test';
import { TransportControls } from './transport-controls';

export type SlotKind = 'empty' | 'occupied' | 'tombstone';

/** One drawn bucket, read from `[data-hash-slot="i"]`. */
export interface DrawnSlot {
  /** The bucket's position, from its `data-hash-slot` attribute. */
  index: number;
  /** The bucket number drawn under it (`[data-hash-index]`). */
  label: string;
  kind: SlotKind;
  /** The visible value text: a key, `DEL`, or '' for an empty bucket. */
  value: string;
  /** Opacity of the solid border (1 for empty and occupied buckets). */
  solid: number;
  /** Opacity of the dashed border (1 for a tombstone). */
  dashed: number;
  /** Opacity of the probe highlight. */
  highlight: number;
}

/** What the hash table shows at one moment. */
export interface HashTableState {
  slots: DrawnSlot[];
  banner: string;
  wrapShown: boolean;
  highlighted: number[];
  /** The C line marked current in the code panel, trimmed, or null when none is. */
  codeLine: string | null;
}

/** The buckets as "0:_ 1:12 2:DEL ...", for failure messages and whole-table comparisons. */
export const describeSlots = (slots: DrawnSlot[]): string =>
  slots.map((slot) => `${slot.index}:${slot.value || '_'}`).join(' ');

/** The stored keys in bucket order. */
export const keysOf = (slots: DrawnSlot[]): number[] =>
  slots.filter((slot) => slot.kind === 'occupied').map((slot) => Number(slot.value));

const CHALLENGES_WASM = /challenges[^/]*\.wasm(\?.*)?$/;

/**
 * Reads the hash table visualiser's drawing (the `data-hash-*` markup promised in
 * docs/hash-table.md, step 2b), its code panel's current line, and the wasm loading
 * and error views. Like `VisualiserPage`, only this file knows that markup.
 */
export class HashTablePage {
  readonly transport: TransportControls;

  constructor(readonly page: Page) {
    this.transport = new TransportControls(page);
  }

  // ---------------------------------------------------------------- drawing

  async slots(): Promise<DrawnSlot[]> {
    return this.page.locator('#visualiser-canvas [data-hash-slot]').evaluateAll((groups) => {
      const opacity = (el: Element | null | undefined) => {
        let total = 1;
        for (let node: Element | null = el ?? null; node && node.tagName.toLowerCase() !== 'svg'; node = node.parentElement) {
          total *= Number(getComputedStyle(node).opacity);
        }
        return el ? Math.round(total * 100) / 100 : 0;
      };
      return groups
        .map((group) => {
          const rects = Array.from(group.querySelectorAll('rect'));
          const stroked = rects.filter((rect) => !rect.hasAttribute('data-hash-highlight') && (rect.getAttribute('stroke') ?? 'none') !== 'none');
          const dashed = stroked.find((rect) => rect.hasAttribute('stroke-dasharray'));
          const solid = stroked.find((rect) => !rect.hasAttribute('stroke-dasharray'));
          const values = Array.from(group.querySelectorAll('[data-hash-value]'))
            .map((text) => ({ text: (text.textContent ?? '').trim(), opacity: opacity(text) }))
            .filter((text) => text.opacity >= 0.5);
          const value = values.length > 0 ? values[values.length - 1].text : '';
          const kind = value === 'DEL' ? 'tombstone' : /^\d+$/.test(value) ? 'occupied' : 'empty';
          return {
            index: Number(group.getAttribute('data-hash-slot')),
            label: (group.querySelector('[data-hash-index]')?.textContent ?? '').trim(),
            kind: kind as 'empty' | 'occupied' | 'tombstone',
            value,
            solid: opacity(solid),
            dashed: opacity(dashed),
            highlight: opacity(group.querySelector('[data-hash-highlight]')),
          };
        })
        .sort((a, b) => a.index - b.index);
    });
  }

  /** The banner line currently shown above the buckets (the most opaque one), or '' when none is drawn. */
  async banner(): Promise<string> {
    const lines = await this.page.locator('#visualiser-canvas [data-hash-banner] text').evaluateAll((texts) =>
      texts.map((text) => ({ text: (text.textContent ?? '').trim(), opacity: Number(getComputedStyle(text).opacity) })),
    );
    const shown = lines.filter((line) => line.opacity >= 0.5);
    return shown.length > 0 ? shown[shown.length - 1].text : '';
  }

  /** The screen-sized status pill shown on narrow phone viewports, or '' when absent. */
  async phoneBanner(): Promise<string> {
    const pill = this.page.locator('[data-hash-phone-banner]');
    if ((await pill.count()) === 0) return '';
    return ((await pill.first().textContent()) ?? '').trim();
  }

  /** Whether the 10 → 0 wrap-around arc is visible. */
  async wrapShown(): Promise<boolean> {
    const wrap = this.page.locator('#visualiser-canvas [data-hash-wrap]');
    if ((await wrap.count()) === 0) return false;
    return wrap.first().evaluate((el) => Number(getComputedStyle(el).opacity) >= 0.5);
  }

  /** The C line marked as current (aria-current="step") in the code panel, or null when no line is. */
  async codeLine(): Promise<string | null> {
    const current = this.page
      .getByRole('list', { name: 'Code for this operation' })
      .locator('li[aria-current="step"] code')
      .filter({ visible: true });
    if ((await current.count()) === 0) return null;
    return ((await current.first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
  }

  /** Whether the highlighted C line is completely inside the visible scroll window of the code list. */
  async codeLineInView(): Promise<boolean> {
    const list = this.page.getByRole('list', { name: 'Code for this operation' });
    const current = list.locator('li[aria-current="step"]');
    if ((await current.count()) === 0) return false;
    return current.first().evaluate((item) => {
      const scroller = item.closest('ol');
      if (!scroller) return false;
      const itemRect = item.getBoundingClientRect();
      const boxRect = scroller.getBoundingClientRect();
      return itemRect.top >= boxRect.top - 1 && itemRect.bottom <= boxRect.bottom + 1;
    });
  }

  async state(): Promise<HashTableState> {
    const slots = await this.slots();
    return {
      slots,
      banner: await this.banner(),
      wrapShown: await this.wrapShown(),
      highlighted: slots.filter((slot) => slot.highlight >= 0.5).map((slot) => slot.index),
      codeLine: await this.codeLine(),
    };
  }

  /** Waits for 11 buckets to be drawn and for the drawing, banner and playback to stop changing, then returns them. */
  async settled(context: string): Promise<HashTableState> {
    await expect
      .poll(async () => (await this.slots()).length, {
        message: `${context}: the hash table should draw 11 buckets ([data-hash-slot] groups in #visualiser-canvas)`,
      })
      .toBe(11);
    let previous = '';
    let state: HashTableState | undefined;
    await expect
      .poll(
        async () => {
          state = await this.state();
          const now = JSON.stringify({ state, progress: await this.transport.progress(context) });
          const still = now === previous;
          previous = now;
          return still;
        },
        { intervals: [200], message: `${context}: the hash table drawing, banner and Animation progress should stop changing` },
      )
      .toBe(true);
    return state!;
  }

  /** Presses Next step, waits for that step to finish, and returns what the table shows. */
  async nextStep(context: string): Promise<HashTableState> {
    await this.pressAndSettle(() => this.transport.stepForward(), 'Next step', context);
    return this.settled(`${context}, after Next step`);
  }

  /** Presses Previous step, waits for the drawing to settle, and returns what the table shows. */
  async previousStep(context: string): Promise<HashTableState> {
    await this.pressAndSettle(() => this.transport.stepBack(), 'Previous step', context);
    return this.settled(`${context}, after Previous step`);
  }

  private async pressAndSettle(press: () => Promise<void>, name: string, context: string): Promise<void> {
    const before = await this.transport.progress(context);
    await press();
    await expect
      .poll(() => this.transport.progress(context), { message: `${context}: ${name} from progress ${before} should move Animation progress` })
      .not.toBe(before);
  }

  /**
   * From a run already played, goes Back to the start and presses Next step until the end, waiting
   * for each step to finish, and returns what the table showed after each step.
   */
  async stepThrough(context: string): Promise<HashTableState[]> {
    await this.transport.rewind();
    const steps: HashTableState[] = [];
    while ((await this.transport.roundedProgress(context)) < 100) {
      if (steps.length > 40) throw new Error(`${context}: more than 40 Next step presses without reaching the end`);
      steps.push(await this.nextStep(`${context}, Next step ${steps.length + 1} from Back to the start`));
    }
    return steps;
  }

  // ------------------------------------------------------------ wasm loading

  /**
   * Answers the next request for challenges.wasm with a 500, then lets later ones through.
   * Returns a reader of how many requests were failed, so a test can check the failure was served.
   */
  async failChallengesWasmOnce(): Promise<() => number> {
    let failed = 0;
    await this.page.route(
      CHALLENGES_WASM,
      async (route: Route) => {
        failed += 1;
        await route.fulfill({ status: 500, contentType: 'text/plain', body: 'challenges.wasm unavailable (e2e)' });
      },
      { times: 1 },
    );
    return () => failed;
  }

  /**
   * Holds the next request for challenges.wasm until the returned function is called, so a test
   * can see the page while the wasm build is still loading. Calling the returned function releases
   * the request and resolves once the browser receives the challenges.wasm response.
   */
  async holdChallengesWasm(): Promise<() => Promise<void>> {
    let release = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const responsePromise = this.page.waitForResponse(CHALLENGES_WASM);
    await this.page.route(
      CHALLENGES_WASM,
      async (route: Route) => {
        await released;
        await route.continue();
      },
      { times: 1 },
    );
    return async () => {
      release();
      await responsePromise;
    };
  }

  async expectLoading(context: string): Promise<void> {
    await expect(this.page.getByRole('status').first(), `${context}: a loading view with role="status" should be shown`).toBeVisible();
    await expect(
      this.page.locator('#visualiser-canvas [data-hash-slot]'),
      `${context}: no hash table buckets should be drawn yet`,
    ).toHaveCount(0);
  }

  async expectLoadError(context: string): Promise<void> {
    await expect(this.page.getByRole('alert'), `${context}: an error view with role="alert" should be shown`).toBeVisible();
    await expect(this.retryButton(), `${context}: the error view should offer a Retry button`).toBeVisible();
  }

  async retry(): Promise<void> {
    await this.retryButton().click();
  }

  async expectNoLoadError(context: string): Promise<void> {
    await expect(this.page.getByRole('alert'), `${context}: the role="alert" error view should be gone`).toHaveCount(0);
  }

  private retryButton() {
    return this.page.getByRole('button', { name: /retry/i });
  }
}
