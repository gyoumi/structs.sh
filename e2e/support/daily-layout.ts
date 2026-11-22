import { expect } from '@playwright/test';
import type { DailyLocators } from './daily-locators';

/**
 * Layout and accessibility checks on /daily: slots fitting the viewport, Run scrolling the visualiser into view, and no best score leaking.
 * `DailyPage` exposes each of these as a method.
 */

/** Scrolls Puzzle array vertically into view (keeping scrollX at 0) and asserts every slot button fits fully in the viewport without clipping. */
export async function expectAllSlotsInViewport(ui: DailyLocators, context: string, expectedCount: number): Promise<void> {
  await ui.arrayGroup.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const offset = Math.max(0, (window.innerHeight - rect.height) / 2);
    window.scrollTo({ top: Math.max(0, window.scrollY + rect.top - offset), left: 0, behavior: 'instant' });
  });
  const scrollX = await ui.page.evaluate(() => window.scrollX);
  expect(scrollX, `${context}: window.scrollX should remain 0 after vertically scrolling Puzzle array into view`).toBe(0);
  await expect(ui.slots, `${context}: Puzzle array should render all ${expectedCount} slots`).toHaveCount(expectedCount);
  for (let i = 0; i < expectedCount; i += 1) {
    const slot = ui.slot(i);
    const text = ((await slot.textContent()) ?? '').trim();
    const match = text.match(/-?\d+/);
    const value = match ? match[0] : text;
    await expect(
      slot,
      `${context}: slot ${i} (value ${value}) in Puzzle array must be fully visible in the viewport without clipping or horizontal overflow`,
    ).toBeInViewport({ ratio: 1 });
  }
}

/**
 * Waits (briefly, for smooth scrolling to settle) until both the visualiser's stable stage
 * (`#visualiser-container`, which wraps the pan/zoom-transformed #visualiser-canvas) and the
 * `Playback` toolbar are fully inside the vertical viewport, allowing 1px rounding.
 * On failure the received value spells out each rect, the viewport height and scrollY.
 */
export async function expectVisualiserInViewport(ui: DailyLocators, context: string, timeout = 2_000): Promise<void> {
  const inView = 'stage and Playback toolbar fully in the viewport';
  await expect(ui.playback, `${context}: the Playback toolbar should be visible after Run`).toBeVisible();
  await expect
    .poll(
      async () => {
        const toolbar = await ui.playback.evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return { top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
        });
        return ui.page.evaluate(
          ({ ok, toolbarRect }) => {
            const stage = document.querySelector('#visualiser-container');
            if (!stage) return '#visualiser-container (the visualiser stage) not found on the page';
            const rect = stage.getBoundingClientRect();
            const stageRect = { top: Math.round(rect.top), bottom: Math.round(rect.bottom) };
            const viewportHeight = window.innerHeight;
            const fits = (r: { top: number; bottom: number }) => r.top >= -1 && r.bottom <= viewportHeight + 1;
            if (fits(stageRect) && fits(toolbarRect)) return ok;
            return `stage rect top ${stageRect.top}, bottom ${stageRect.bottom}${fits(stageRect) ? '' : ' (out of view)'}; Playback toolbar top ${toolbarRect.top}, bottom ${toolbarRect.bottom}${fits(toolbarRect) ? '' : ' (out of view)'}; viewport height ${viewportHeight}, scrollY ${Math.round(window.scrollY)}`;
          },
          { ok: inView, toolbarRect: toolbar },
        );
      },
      {
        intervals: [100],
        timeout,
        message: `${context}: Run should scroll the page so both the visualiser stage (#visualiser-container) and the Playback toolbar are fully in the viewport (top >= 0 and bottom <= viewport height, 1px tolerance) within ${timeout} ms`,
      },
    )
    .toBe(inView);
}

/**
 * Asserts the page reveals no best score: no `Best` or `Best reached` status, and no
 * "highest possible" / "best possible" / "best score" / "out of <number>" wording anywhere on the page.
 */
export async function expectNoBestShown(ui: DailyLocators, context: string): Promise<void> {
  for (const name of ['Best', 'Best reached']) {
    await expect(
      ui.status(name),
      `${context}: the page must never show a "${name}" status (the solver's best stays hidden)`,
    ).toHaveCount(0);
  }
  const body = (await ui.page.locator('body').innerText()).replace(/\s+/g, ' ');
  const leak = body.match(/highest possible|best possible|best score|best reached|maximum possible|out of \d+/i);
  expect(
    leak?.[0] ?? null,
    `${context}: the page text must not hint at the solver's best score, but contains "${leak?.[0]}"`,
  ).toBeNull();
}
