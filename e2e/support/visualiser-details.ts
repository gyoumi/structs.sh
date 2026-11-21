import { expect, type Locator } from '@playwright/test';
import { describeTree, readTree, unbalancedValues } from './tree-drawing';
import { VisualiserPage } from './visualiser-page';

/**
 * Checks on the visualiser beyond what `VisualiserPage` drives: the shape of a
 * drawn tree, which operation boxes are marked invalid, and where the page is
 * scrolled. Like `VisualiserPage`, only this file knows the markup it reads.
 */
export class DetailedVisualiserPage extends VisualiserPage {
  private get operationsRegion(): Locator {
    return this.page.getByRole('region', { name: 'Operations' });
  }

  private get runButton(): Locator {
    return this.operationsRegion.getByRole('button', { name: /^Run / });
  }

  // -------------------------------------------------------------------- trees

  /** The drawn tree written as value(left, right), e.g. "50(30(20, 40), 70)". */
  async tree(): Promise<string> {
    return describeTree(await readTree(this.page));
  }

  /** The drawn values whose left and right subtrees differ in height by more than 1. */
  async unbalancedValues(): Promise<number[]> {
    return unbalancedValues(await readTree(this.page));
  }

  // -------------------------------------------------------------------- boxes

  /** The labels of the operation's input boxes marked aria-invalid="true", in order. */
  async invalidBoxes(): Promise<string[]> {
    const names: string[] = [];
    for (const box of await this.operationsRegion.getByRole('textbox').all()) {
      if ((await box.getAttribute('aria-invalid')) !== 'true') continue;
      const snapshot = await box.ariaSnapshot();
      names.push(snapshot.match(/textbox "([^"]*)"/)?.[1] ?? snapshot);
    }
    return names;
  }

  /** Types into the operation's box with this label, replacing what it held. */
  async typeInBox(label: string, text: string): Promise<void> {
    await this.operationsRegion.getByRole('textbox', { name: label, exact: true }).fill(text);
  }

  // ---------------------------------------------------------------- scrolling

  /** Chooses an operation, fills in its boxes, and scrolls its Run button to the middle of the screen without pressing it. */
  async prepareRun(command: string, ...args: (number | string)[]): Promise<void> {
    await this.page.getByRole('radio', { name: this.label(command), exact: true }).click();
    const inputs = this.operationsRegion.getByRole('textbox');
    for (const [index, value] of args.entries()) {
      await inputs.nth(index).fill(String(value));
    }
    // A phone browser scrolls a focused box into view over several frames, which would undo the scroll below.
    await this.waitForScrollToSettle();
    await this.runButton.evaluate((button) => button.scrollIntoView({ block: 'center', behavior: 'instant' }));
    await this.waitForScrollToSettle();
  }

  private async waitForScrollToSettle(): Promise<void> {
    let previous = -1;
    await expect
      .poll(async () => {
        const now = await this.scrollY();
        const still = now === previous;
        previous = now;
        return still;
      }, { intervals: [150] })
      .toBe(true);
  }

  async pressRun(): Promise<void> {
    await this.runButton.click();
  }

  async scrollY(): Promise<number> {
    return Math.round(await this.page.evaluate(() => window.scrollY));
  }

  /**
   * Watches window.scrollY for a second and returns the value furthest from
   * `from`. A smooth scroll can start a few frames after Run is pressed, so a
   * single reading can miss it.
   */
  async scrollAwayFrom(from: number): Promise<number> {
    const furthest = await this.page.evaluate(
      (start) =>
        new Promise<number>((resolve) => {
          const began = performance.now();
          let far = window.scrollY;
          const tick = () => {
            if (Math.abs(window.scrollY - start) > Math.abs(far - start)) far = window.scrollY;
            if (performance.now() - began > 1000) resolve(far);
            else requestAnimationFrame(tick);
          };
          tick();
        }),
      from,
    );
    return Math.round(furthest);
  }

  /** How much of the drawing area's height is on screen, from 0 to 1. */
  async drawingInView(): Promise<number> {
    return this.fractionInView(this.page.locator('#visualiser-container'));
  }

  /** How much of the operation's error message is on screen, from 0 to 1. */
  async errorInView(): Promise<number> {
    return this.fractionInView(this.operationsRegion.getByRole('status'));
  }

  private async fractionInView(target: Locator): Promise<number> {
    const fraction = await target.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const visible = Math.max(0, Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0));
      return box.height > 0 ? visible / box.height : 0;
    });
    return Math.round(fraction * 100) / 100;
  }
}
