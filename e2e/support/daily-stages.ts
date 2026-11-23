import { expect, type Locator } from '@playwright/test';
import type { DailyLocators } from './daily-locators';
import { describeTree, treeFromNodes } from './tree-drawing';
import { readDrawnTexts, type DrawnNode } from './visualiser-drawing';

/** A counter readout and the count it should finish at. */
export interface Counter {
  name: string;
  final: number;
}

/**
 * The drawings inside the two stage regions of `insertion-beats-merge` (`Insertion sort`, `Merge sort`)
 * and `upset-bst-beats-avl` (`BST`, `AVL tree`), and stepping or replaying them on the shared `Playback` toolbar.
 * A drawn value is a visible `<text>` in the region's `<svg>` whose content is a whole number.
 * See "Two stages" in e2e/README.md.
 */
export class DailyStages {
  constructor(private readonly ui: DailyLocators) {}

  region(name: string): Locator {
    return this.ui.page.getByRole('region', { name, exact: true });
  }

  private nodes(name: string): Promise<DrawnNode[]> {
    return readDrawnTexts(this.region(name).locator('svg text'));
  }

  /** The values drawn in the stage, left to right (top to bottom on ties). */
  async values(name: string): Promise<number[]> {
    return (await this.nodes(name)).sort((a, b) => a.x - b.x || a.y - b.y).map((node) => node.value);
  }

  /** The tree drawn in the stage, written as value(left, right); empty when no key is drawn. */
  async tree(name: string): Promise<string> {
    return describeTree(treeFromNodes((await this.nodes(name)).sort((a, b) => a.x - b.x)));
  }

  /** Every drawn value with its stage-local rounded position and fill, so page scroll never looks like playback. */
  async signature(name: string): Promise<string> {
    const origin = (await this.region(name).locator('svg').first().boundingBox()) ?? { x: 0, y: 0 };
    const nodes = (await this.nodes(name)).sort((a, b) => a.x - b.x || a.y - b.y);
    return nodes
      .map((node) => `${node.value}@${Math.round(node.x - origin.x)},${Math.round(node.y - origin.y)} ${node.fill}`)
      .join('; ');
  }

  async expectValues(name: string, expected: readonly number[], message: string): Promise<void> {
    await expect
      .poll(() => this.values(name), { message: `${message} (values drawn in the "${name}" stage's <svg>, left to right)` })
      .toEqual([...expected]);
  }

  async expectTree(name: string, expected: string, message: string): Promise<void> {
    await expect
      .poll(() => this.tree(name), { message: `${message} (tree drawn in the "${name}" stage's <svg>, as value(left, right))` })
      .toBe(expected);
  }

  /**
   * From a paused point (such as Back to the start), presses Next step until every stage's drawing differs
   * from where it started, then checks Animation progress is still below 100 and each counter is below its final count.
   */
  async stepUntilEveryStageChanges(names: readonly string[], counters: readonly Counter[], context: string, maxSteps = 80): Promise<void> {
    const start = await this.signatures(names);
    let unchanged = [...names];
    let steps = 0;
    while (unchanged.length > 0 && steps < maxSteps && (await this.ui.progress(context)) < 100) {
      steps += 1;
      await this.ui.clickWhenReady(this.ui.playbackButton('Next step'), `${context}: Next step button in Playback toolbar`, `step ${steps}`);
      const now = await this.settle(names, `${context} Next step ${steps}`);
      unchanged = names.filter((name, i) => now[i] === start[i]);
    }
    expect(
      unchanged,
      `${context}: pressing Next step on the shared Playback toolbar (${steps} steps) should change the drawing in every stage before the end, but these stages never changed`,
    ).toEqual([]);
    const progress = await this.ui.progress(context);
    expect(progress, `${context}: both stages should change after ${steps} Next steps while Animation progress is still below 100`).toBeLessThan(100);
    for (const { name, final } of counters) {
      const value = await this.ui.readNumber(this.ui.status(name), `"${name}" status readout`, context);
      expect(value, `${context}: after ${steps} Next steps (progress ${progress}), "${name}" should be below its final count ${final}`).toBeLessThan(final);
    }
  }

  /**
   * At the end of a run, presses Replay and waits until every stage advances through at least two
   * distinct non-final frames while Animation progress is below 100 (a reset followed by a frozen drawing fails).
   */
  async expectReplayRedrawsEveryStage(names: readonly string[], context: string): Promise<void> {
    expect(await this.ui.roundedProgress(context), `${context}: Replay is checked from the end of the run`).toBe(100);
    const end = await this.signatures(names);
    const frames = new Map(names.map((name) => [name, new Set<string>()]));
    await this.ui.clickWhenReady(this.ui.playbackButton('Replay'), `${context}: Replay button in Playback toolbar`, 'replaying both stages');
    await expect
      .poll(
        async () => {
          const now = await this.signatures(names);
          if ((await this.ui.progress(context)) < 100) {
            names.forEach((name, i) => {
              if (now[i] !== end[i]) frames.get(name)?.add(now[i]);
            });
          }
          return names.filter((name) => (frames.get(name)?.size ?? 0) < 2);
        },
        {
          intervals: [25],
          message: `${context}: after Replay on the shared Playback toolbar, every stage should reset and advance through at least two distinct non-final frames while Animation progress is below 100 (stages that stayed frozen)`,
        },
      )
      .toEqual([]);
  }

  private signatures(names: readonly string[]): Promise<string[]> {
    return Promise.all(names.map((name) => this.signature(name)));
  }

  private async settle(names: readonly string[], label: string): Promise<string[]> {
    let previous = '';
    let drawings: string[] = [];
    await expect
      .poll(
        async () => {
          await this.ui.waitTwoFrames();
          const playing = await this.ui.isReady(this.ui.playbackButton('Pause'));
          drawings = await this.signatures(names);
          const now = `${await this.ui.progress(label)} | ${drawings.join(' | ')}`;
          const settled = !playing && now === previous;
          previous = now;
          return settled;
        },
        { intervals: [50], message: `${label}: Animation progress and every stage drawing should settle after the step` },
      )
      .toBe(true);
    return drawings;
  }
}
