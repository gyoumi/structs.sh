import { expect, type Browser, type Locator, type Page } from '@playwright/test';
import type { DailyChallenge } from './daily-fixtures';
import { DailyLocators } from './daily-locators';
import { DailyPage } from './daily-page';

export type Theme = 'light' | 'dark';

/** What one stage looks like: its background and the colours of every visible shape drawn in it. */
export interface StageLook {
  /** The stage's accessible name, up to the first full stop (for example "Quicksort drawing"). */
  stage: string;
  /** The first non-transparent background colour behind the drawing. */
  background: string;
  /** Each visible shape as `<tag> fill <colour> stroke <colour>`, counted and sorted, e.g. `rect fill rgb(35, 34, 94) stroke rgb(35, 34, 94) x8`. */
  colours: string[];
}

/** Each drawn number in one stage with its position in the stage's SVG coordinates, left to right. */
export interface StageContent {
  stage: string;
  drawn: { value: number; x: number; y: number }[];
}

/**
 * How `after` differs from `before`: a stage drawing different numbers, or a number that moved more than
 * `tolerance` SVG units (text boxes shift by a pixel when the glyphs are recoloured or re-rendered). Empty when the same.
 */
export const contentDifferences = (before: StageContent[], after: StageContent[], tolerance = 3): string[] => {
  const show = (content?: StageContent) => content?.drawn.map(({ value, x, y }) => `${value}@${x},${y}`).join(' ') ?? '(no stage)';
  const differences: string[] = [];
  for (let i = 0; i < Math.max(before.length, after.length); i += 1) {
    const [was, now] = [before[i], after[i]];
    const moved =
      !was || !now || was.drawn.length !== now.drawn.length ||
      was.drawn.some((node, j) => node.value !== now.drawn[j].value || Math.abs(node.x - now.drawn[j].x) > tolerance || Math.abs(node.y - now.drawn[j].y) > tolerance);
    if (moved) differences.push(`stage ${i + 1} "${was?.stage ?? now?.stage}" drew [${show(was)}] before, [${show(now)}] after`);
  }
  return differences;
};

/** A settled snapshot of every stage on /daily and the playback position. */
export interface StageView {
  looks: StageLook[];
  contents: StageContent[];
  /** The playback's step readout: `Step N of M`, or `No steps yet`. */
  step: string;
}

const STEP_TEXT = /^\s*(No steps yet|Step \d+ of \d+)\s*$/;

/**
 * The /daily stages as a player sees them (background and drawn colours, what is drawn where), the
 * header's `Dark mode` theme toggle, and the playback's `Step N of M` readout.
 * A stage is an element with `role="application"` and `aria-roledescription="drawing"`; a shape is
 * any visible rect, circle, ellipse, line, path, polyline, polygon or text in its `<svg>`.
 */
export class DailyStageView {
  private readonly ui: DailyLocators;

  constructor(readonly page: Page) {
    this.ui = new DailyLocators(page);
  }

  private get themeToggle(): Locator {
    return this.page.getByRole('button', { name: 'Dark mode', exact: true });
  }

  private get stages(): Locator {
    return this.page.locator('[role="application"][aria-roledescription="drawing"]');
  }

  private get stepReadout(): Locator {
    return this.ui.playback.locator('xpath=..').getByText(STEP_TEXT);
  }

  /** The header's `Dark mode` toggle is pressed for `dark` and not pressed for `light`. */
  async expectTheme(theme: Theme, context: string): Promise<void> {
    await expect(this.themeToggle, `${context}: the header should have a "Dark mode" toggle button`).toBeVisible();
    await expect(
      this.themeToggle,
      `${context}: the page should be in ${theme} mode ("Dark mode" toggle aria-pressed=${theme === 'dark'})`,
    ).toHaveAttribute('aria-pressed', String(theme === 'dark'));
  }

  /** Clicks the header's `Dark mode` toggle to switch from the other theme to `to`. */
  async switchTheme(to: Theme, context: string): Promise<void> {
    await this.expectTheme(to === 'dark' ? 'light' : 'dark', `${context}, before switching to ${to}`);
    await this.themeToggle.click();
    await this.expectTheme(to, `${context}, after clicking the "Dark mode" toggle`);
  }

  /** Focuses the header's `Dark mode` toggle and presses `key` on it, as a keyboard player would, to switch to `to`. */
  async pressThemeToggle(to: Theme, key: 'Enter' | 'Space', context: string): Promise<void> {
    await this.expectTheme(to === 'dark' ? 'light' : 'dark', `${context}, before pressing ${key} on the theme toggle`);
    await this.themeToggle.focus();
    await expect(this.themeToggle, `${context}: the "Dark mode" toggle should take keyboard focus`).toBeFocused();
    await this.page.keyboard.press(key);
    await this.expectTheme(to, `${context}, after pressing ${key} on the focused "Dark mode" toggle`);
  }

  /** Keyboard focus is on the header's `Dark mode` toggle; the failure names the element that has focus instead. */
  async expectThemeToggleFocused(message: string): Promise<void> {
    await expect
      .poll(
        async () =>
          (await this.themeToggle.evaluate((el) => el === document.activeElement))
            ? 'the "Dark mode" toggle'
            : `focus is on ${await this.ui.describeActiveElement()}`,
        { message, timeout: 1_000, intervals: [50] },
      )
      .toBe('the "Dark mode" toggle');
  }

  /** Waits until the first stage's background colour is no longer `from`: the stage has been redrawn after a theme switch. */
  async expectStageBackgroundChanged(from: string, message: string): Promise<void> {
    await expect
      .poll(async () => (await this.looks())[0]?.background, { message: `${message} (background behind the first stage, was ${from})`, timeout: 3_000 })
      .not.toBe(from);
  }

  /** The playback's step readout, for example `Step 96 of 96` or `No steps yet`. */
  async stepText(context: string): Promise<string> {
    await expect(
      this.stepReadout,
      `${context}: the playback should show a "Step N of M" or "No steps yet" readout (shown on screens wider than 1360px)`,
    ).toBeVisible();
    return ((await this.stepReadout.textContent()) ?? '').trim();
  }

  async expectStepText(expected: string, message: string): Promise<void> {
    await expect
      .poll(() => this.stepText(message), { message: `${message} (the playback's step readout)` })
      .toBe(expected);
  }

  /** The named button in the `Playback` toolbar (`Play`, `Replay`, `Previous step`, ...) is visible and enabled or disabled. */
  async expectPlaybackButton(name: string, enabled: boolean, message: string): Promise<void> {
    const button = this.ui.playback.getByRole('button', { name, exact: true });
    await expect(button, `${message} (a "${name}" button should be in the Playback toolbar)`).toBeVisible();
    if (enabled) await expect(button, `${message} ("${name}" should be enabled)`).toBeEnabled();
    else await expect(button, `${message} ("${name}" should be disabled)`).toBeDisabled();
  }

  async looks(): Promise<StageLook[]> {
    return this.stages.evaluateAll((apps) =>
      apps.map((app) => {
        let background = '(none)';
        for (let el: Element | null = app; el; el = el.parentElement) {
          const colour = getComputedStyle(el).backgroundColor;
          if (colour && colour !== 'transparent' && colour !== 'rgba(0, 0, 0, 0)') {
            background = colour;
            break;
          }
        }
        const svg = app.querySelector('svg');
        const counts = new Map<string, number>();
        for (const shape of svg ? Array.from(svg.querySelectorAll('rect, circle, ellipse, line, path, polyline, polygon, text')) : []) {
          let visible = true;
          for (let el: Element | null = shape; el && el !== svg; el = el.parentElement) {
            const style = getComputedStyle(el);
            if (Number(style.opacity) === 0 || style.visibility === 'hidden' || style.display === 'none') visible = false;
          }
          if (!visible) continue;
          const style = getComputedStyle(shape);
          const key = `${shape.tagName.toLowerCase()} fill ${style.fill} stroke ${style.stroke}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        return {
          stage: (app.getAttribute('aria-label') ?? '').split('.')[0],
          background,
          colours: [...counts].map(([key, n]) => `${key} x${n}`).sort(),
        };
      }),
    );
  }

  async contents(): Promise<StageContent[]> {
    return this.stages.evaluateAll((apps) =>
      apps.map((app) => {
        const svg = app.querySelector('svg');
        const toSvg = svg?.getScreenCTM()?.inverse();
        const drawn = Array.from(svg?.querySelectorAll('text') ?? [])
          .filter((text) => /^\d+$/.test(text.textContent?.trim() ?? ''))
          .filter((text) => {
            for (let el: Element | null = text; el && el !== svg; el = el.parentElement) {
              const style = getComputedStyle(el);
              if (Number(style.opacity) === 0 || style.visibility === 'hidden' || style.display === 'none') return false;
            }
            return true;
          })
          .map((text) => {
            const box = text.getBoundingClientRect();
            const point = toSvg ? new DOMPoint(box.x + box.width / 2, box.y).matrixTransform(toSvg) : new DOMPoint(box.x, box.y);
            return { value: text.textContent?.trim() ?? '', x: Math.round(point.x), y: Math.round(point.y) };
          })
          .map(({ value, x, y }) => ({ value: Number(value), x, y }))
          .sort((a, b) => a.x - b.x || a.y - b.y);
        return { stage: (app.getAttribute('aria-label') ?? '').split('.')[0], drawn };
      }),
    );
  }

  /** Waits until playback is paused and every stage, and the step readout, stop changing, then returns them. */
  async settledView(context: string): Promise<StageView> {
    await expect(this.stages.first(), `${context}: /daily should draw at least one stage`).toBeVisible();
    let previous = '';
    let view: StageView = { looks: [], contents: [], step: '' };
    await expect
      .poll(
        async () => {
          await this.ui.waitTwoFrames();
          const playing = await this.ui.isReady(this.ui.playbackButton('Pause'));
          view = { looks: await this.looks(), contents: await this.contents(), step: await this.stepText(context) };
          const now = JSON.stringify(view);
          const settled = !playing && now === previous;
          previous = now;
          return settled;
        },
        { intervals: [100], message: `${context}: playback should be paused and every stage drawing should stop changing` },
      )
      .toBe(true);
    return view;
  }

  /** Polls until every stage's background and drawn colours equal `expected` (a fresh page's look at the same point). */
  async expectLooks(expected: StageLook[], message: string, timeout = 3_000): Promise<void> {
    await expect.poll(() => this.looks(), { message, timeout, intervals: [100] }).toEqual(expected);
  }
}

/**
 * Opens /daily in a new browser context whose system colour scheme is `theme`, with nothing saved,
 * serves `challenge`, plays `play` there, and returns the settled stage view: what the stages look like
 * when the page is freshly loaded in that theme.
 */
export async function viewInFreshPage(
  browser: Browser,
  theme: Theme,
  challenge: DailyChallenge,
  play: (daily: DailyPage) => Promise<void>,
  context: string,
): Promise<StageView> {
  const fresh = await browser.newContext({ colorScheme: theme });
  try {
    const page = await fresh.newPage();
    const daily = new DailyPage(page);
    const view = new DailyStageView(page);
    await daily.serve(challenge);
    await daily.open();
    await view.expectTheme(theme, `${context} (fresh page with system colour scheme ${theme})`);
    await play(daily);
    return await view.settledView(`${context} (fresh page in ${theme})`);
  } finally {
    await fresh.close();
  }
}
