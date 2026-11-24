import { expect, type Locator, type Page } from '@playwright/test';

/**
 * The /daily page's ARIA locators and the small read/click helpers that
 * `DailyPage` and its helper modules (`daily-layout.ts`, `daily-stepping.ts`) share.
 *
 * See "The daily game" in e2e/README.md for the page contract these locators rely on.
 * Tests use `DailyPage`, not this class.
 */
export class DailyLocators {
  constructor(readonly page: Page) {}

  get rulesRegion(): Locator { return this.page.getByRole('region', { name: 'Challenge rules' }); }
  get arrayGroup(): Locator { return this.page.getByRole('group', { name: 'Challenge array' }); }
  get slots(): Locator { return this.arrayGroup.getByRole('button'); }
  slot(index: number): Locator { return this.slots.nth(index); }
  button(name: string): Locator { return this.page.getByRole('button', { name, exact: true }); }
  get playback(): Locator { return this.page.getByRole('toolbar', { name: 'Playback' }); }
  playbackButton(name: string): Locator { return this.playback.getByRole('button', { name }); }
  get timeline(): Locator { return this.page.getByRole('slider', { name: 'Animation progress' }); }
  get speedPicker(): Locator { return this.page.getByRole('combobox', { name: 'Speed' }); }
  status(name: string): Locator { return this.page.getByRole('status', { name, exact: true }); }

  async progress(context?: string): Promise<number> {
    const prefix = context ? `${context}: ` : '';
    await this.expectVisible(this.timeline, `${prefix}Animation progress slider`, 'reading playback progress');
    const ariaNow = await this.timeline.getAttribute('aria-valuenow');
    if (ariaNow !== null && ariaNow.trim() !== '') return Number(ariaNow);
    return Number(await this.timeline.inputValue());
  }

  async roundedProgress(context?: string): Promise<number> {
    return Math.round(await this.progress(context));
  }

  async counter(context?: string): Promise<number> {
    return this.readNumber(this.status('Comparisons'), 'Comparisons counter', context);
  }

  async readNumber(locator: Locator, label: string, context?: string): Promise<number> {
    const prefix = context ? `${context}: ` : '';
    await this.expectVisible(locator, `${prefix}${label}`, 'reading its value');
    const text = ((await locator.textContent()) ?? '').trim();
    const match = text.match(/-?\d+/);
    if (!match) throw new Error(`${prefix}Expected ${label} to contain a number, got "${text}"`);
    return Number(match[0]);
  }

  async describeActiveElement(): Promise<string> {
    return this.page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return 'none';
      const tag = el.tagName.toLowerCase();
      const role = el.getAttribute('role');
      const label = el.getAttribute('aria-label');
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
      const parts = [tag];
      if (role) parts.push(`role="${role}"`);
      if (label) parts.push(`aria-label="${label}"`);
      if (text) parts.push(`"${text}"`);
      return parts.join(' ');
    });
  }

  async expectVisible(locator: Locator, label: string, action: string): Promise<void> {
    await expect(locator, `${label} should be visible when ${action}`).toBeVisible();
  }

  async clickWhenReady(locator: Locator, label: string, action: string): Promise<void> {
    await expect(locator, `${label} should be visible before ${action}`).toBeVisible();
    await expect(locator, `${label} should be enabled before ${action}`).toBeEnabled();
    await locator.click();
  }

  async isReady(locator: Locator): Promise<boolean> {
    return (await locator.isVisible()) && (await locator.isEnabled({ timeout: 250 }).catch(() => false));
  }

  async waitTwoFrames(): Promise<void> {
    await this.page.evaluate(
      () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
    );
  }
}
