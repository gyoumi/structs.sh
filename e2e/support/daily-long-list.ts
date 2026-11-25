import { expect, type Page } from '@playwright/test';
import { describeNodes, StageGeometry, type StageFrame } from './stage-geometry';
import { TransportControls } from './transport-controls';

/** One read of the stage while the run played, with how far through it was and when. */
export interface TimedFrame extends StageFrame {
  progress: number;
  at: number;
}

/**
 * The Index drift stage on /daily as a list grows long: where its nodes are drawn, how big, whether the node
 * `curr` walks stays on the stage, and seeking along the run with the `Animation progress` slider.
 */
export class DailyLongList {
  readonly geometry: StageGeometry;
  readonly transport: TransportControls;

  constructor(readonly page: Page) {
    this.geometry = new StageGeometry(page);
    this.transport = new TransportControls(page);
  }

  /** Clicks the `Animation progress` slider at `fraction` (0 to 1) of its length, which pauses there. */
  async seekTo(fraction: number, context: string): Promise<void> {
    const track = this.page.locator('[data-slot="slider-control"]').filter({ has: this.transport.timeline });
    await track.scrollIntoViewIfNeeded();
    const box = await track.boundingBox();
    if (!box) throw new Error(`${context}: the Animation progress slider is not visible`);
    await this.page.mouse.click(box.x + box.width * fraction, box.y + box.height / 2);
    await expect
      .poll(() => this.transport.progress(context), { message: `${context}: clicking the Animation progress slider at ${Math.round(fraction * 100)}% should move playback there` })
      .toBeGreaterThan(fraction * 100 - 15);
  }

  /** Reads the stage every 100 ms while the run plays, until Animation progress reaches 100. */
  async framesUntilEnd(context: string, timeout = 60_000): Promise<TimedFrame[]> {
    const frames: TimedFrame[] = [];
    const started = Date.now();
    await expect
      .poll(
        async () => {
          const progress = await this.transport.progress(context);
          frames.push({ ...(await this.geometry.frame()), progress, at: Date.now() - started });
          return Math.round(progress);
        },
        { intervals: [100], timeout, message: `${context}: the run should play to the end (Animation progress 100)` },
      )
      .toBe(100);
    return frames;
  }

  /**
   * What went wrong in `frames` while the run played: a frame drawing any node narrower than `minWidth`
   * (less 0.5px), and any stretch longer than `graceMs` when the node `curr` points at was off the stage.
   * A pan that glides to the node can leave it off-stage for a moment, so shorter stretches are allowed.
   */
  followProblems(frames: readonly TimedFrame[], minWidth: number, graceMs = 800): string[] {
    const problems: string[] = [];
    const small = frames.filter((frame) => frame.nodes.some((node) => node.width < minWidth - 0.5));
    if (small.length > 0) {
      const first = small[0];
      const widths = [...new Set(first.nodes.map((node) => node.width))].join(', ');
      problems.push(
        `${small.length} of ${frames.length} reads drew nodes narrower than the ${minWidth}px of the start list; the first, at progress ${first.progress.toFixed(1)}, drew ${first.nodes.length} nodes ${widths}px wide`,
      );
    }
    let offSince: TimedFrame | null = null;
    const reportOff = (until: TimedFrame) => {
      if (offSince && until.at - offSince.at > graceMs) {
        problems.push(
          `curr was on node ${offSince.walked?.value} off the stage from progress ${offSince.progress.toFixed(1)} to ${until.progress.toFixed(1)} (${until.at - offSince.at} ms); the stage then showed ${describeNodes(offSince.nodes.filter((node) => node.inside))}`,
        );
      }
    };
    for (const frame of frames) {
      const off = frame.walked !== null && !frame.walked.inside;
      if (off && !offSince) offSince = frame;
      if (!off && offSince) {
        reportOff(frame);
        offSince = null;
      }
    }
    if (offSince) reportOff(frames[frames.length - 1]);
    return problems;
  }
}
