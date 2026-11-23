import { defaultSpeed } from '@/visualiser-src/common/constants';
import type { PlaybackStage } from '@/visualiser-src/controller/VisualiserController';
import type { Playback, PlaybackSnapshot } from './playback';
import type { VisualiserSession } from './session';
import type { VisualiserSnapshot } from './sessionSnapshot';

/** Both stages' snapshots, and the one timeline the shared toolbar shows for them. */
export interface DualSnapshot extends PlaybackSnapshot {
  stages: [VisualiserSnapshot, VisualiserSnapshot];
}

type Link = { status: 'unlinked' } | { status: 'linked'; unlink: () => void };

type ClockState =
  | { status: 'stopped' }
  | { status: 'playing'; frame: number; lastFrameTime: number };

const isStageComplete = (stage: VisualiserSnapshot): boolean =>
  stage.playback === 'complete' || (stage.duration === 0 && stage.lastRun !== null);

const mergedStepTimes = (left: VisualiserSnapshot, right: VisualiserSnapshot): number[] =>
  [...left.stepTimes, ...right.stepTimes]
    .sort((a, b) => a - b)
    .filter((t, i, sorted) => i === 0 || t - sorted[i - 1] > 2);

const combine = (
  left: VisualiserSnapshot,
  right: VisualiserSnapshot,
  playheadMs: number,
  clock: ClockState['status']
): DualSnapshot => {
  const duration = Math.max(left.duration, right.duration);
  const ran = left.lastRun !== null && right.lastRun !== null;
  const complete = ran && isStageComplete(left) && isStageComplete(right);
  const playback: PlaybackStage =
    clock === 'playing' || left.playback === 'playing' || right.playback === 'playing'
      ? 'playing'
      : complete
        ? 'complete'
        : 'paused';
  const playhead = Math.max(0, Math.min(duration, playheadMs));
  const stepTimes = mergedStepTimes(left, right);
  const progress =
    playback === 'complete' ? 100 : duration > 0 ? Math.min(100, (playhead / duration) * 100) : 0;
  return {
    stages: [left, right],
    playback,
    progress,
    step: stepTimes.filter((t) => t <= playhead + 1).length,
    stepCount: stepTimes.length,
    duration,
    speed: left.speed,
  };
};

/**
 * Two sessions driven by one shared clock and timeline, for a page that plays two algorithms side
 * by side. Both advance from the same playhead every frame and stay aligned across pause, resume,
 * stepping, and scrubbing. The shared run is complete only once both stages are.
 */
export class DualSession implements Playback {
  readonly left: VisualiserSession;

  readonly right: VisualiserSession;

  private snapshot: DualSnapshot;

  private listeners = new Set<() => void>();

  private link: Link = { status: 'unlinked' };

  private clock: ClockState = { status: 'stopped' };

  private playheadMs = 0;

  private batchDepth = 0;

  constructor(left: VisualiserSession, right: VisualiserSession) {
    this.left = left;
    this.right = right;
    this.snapshot = combine(left.getSnapshot(), right.getSnapshot(), 0, 'stopped');
  }

  private get sessions(): VisualiserSession[] {
    return [this.left, this.right];
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.link.status === 'unlinked') {
      const unlinks = this.sessions.map((session) => session.subscribe(this.onStageChange));
      this.link = { status: 'linked', unlink: () => unlinks.forEach((unlink) => unlink()) };
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size > 0 || this.link.status === 'unlinked') return;
      this.stopClock();
      this.link.unlink();
      this.link = { status: 'unlinked' };
    };
  };

  getSnapshot = (): DualSnapshot => {
    this.refresh();
    return this.snapshot;
  };

  /** Builds both stages' timelines paused at 0 and starts them together on the shared clock. */
  run = (leftCommand: string, rightCommand: string): string => {
    this.stopClock();
    let error = '';
    this.batch(() => {
      error = this.left.run(leftCommand, [], false);
      if (error) return;
      error = this.right.run(rightCommand, [], false);
    });
    if (error) return error;
    this.playheadMs = 0;
    if (this.duration() > 0) this.startClock();
    this.emit();
    return '';
  };

  play = (): void => {
    if (this.clock.status === 'playing') return;
    const snapshot = this.getSnapshot();
    if (snapshot.duration === 0) return;
    if (snapshot.playback === 'complete') this.applyPlayhead(0);
    this.startClock();
    this.emit();
  };

  pause = (): void => {
    this.stopClock();
    this.emit();
  };

  togglePlay = (): void => {
    if (this.getSnapshot().playback === 'playing') this.pause();
    else this.play();
  };

  stepForward = (): void => {
    this.stopClock();
    const snapshot = this.getSnapshot();
    if (snapshot.playback === 'complete' || snapshot.duration === 0) return;
    const steps = mergedStepTimes(snapshot.stages[0], snapshot.stages[1]);
    const next = steps.find((t) => t > this.playheadMs + 1) ?? snapshot.duration;
    this.applyPlayhead(next);
    this.emit();
  };

  stepBackward = (): void => {
    this.stopClock();
    const snapshot = this.getSnapshot();
    if (snapshot.duration === 0) return;
    const steps = mergedStepTimes(snapshot.stages[0], snapshot.stages[1]);
    const prev = [...steps].reverse().find((t) => t + 25 < this.playheadMs) ?? 0;
    this.applyPlayhead(prev);
    this.emit();
  };

  rewind = (): void => {
    this.stopClock();
    this.applyPlayhead(0);
    this.emit();
  };

  finish = (): void => {
    this.stopClock();
    this.applyPlayhead(this.duration());
    this.emit();
  };

  /** Seeks both stages to the same time: `percent` of the longer run. */
  seekToPercent = (percent: number): void => {
    this.stopClock();
    this.applyPlayhead((percent / 100) * this.duration());
    this.emit();
  };

  setSpeed = (speed: number): void => {
    this.batch(() => this.sessions.forEach((session) => session.setSpeed(speed)));
    this.emit();
  };

  dispose = (): void => {
    this.stopClock();
    if (this.link.status === 'linked') {
      this.link.unlink();
      this.link = { status: 'unlinked' };
    }
  };

  private duration(): number {
    return Math.max(this.left.getSnapshot().duration, this.right.getSnapshot().duration);
  }

  private startClock(): void {
    if (this.clock.status === 'playing') return;
    this.clock = {
      status: 'playing',
      frame: requestAnimationFrame(this.tick),
      lastFrameTime: performance.now(),
    };
  }

  private stopClock(): void {
    if (this.clock.status !== 'playing') return;
    cancelAnimationFrame(this.clock.frame);
    this.clock = { status: 'stopped' };
  }

  private tick = (now: number): void => {
    if (this.clock.status !== 'playing') return;
    const dt = Math.max(0, now - this.clock.lastFrameTime);
    const rate = this.left.getSnapshot().speed * defaultSpeed;
    const total = this.duration();
    const next = Math.min(total, this.playheadMs + dt * rate);
    if (next >= total - 1) {
      this.stopClock();
      this.applyPlayhead(total);
      this.emit();
      return;
    }
    this.clock = {
      status: 'playing',
      frame: requestAnimationFrame(this.tick),
      lastFrameTime: now,
    };
    this.applyPlayhead(next);
    this.emit();
  };

  private applyPlayhead(time: number): void {
    const total = this.duration();
    const clamped = Math.max(0, Math.min(time, total));
    this.playheadMs = total > 0 && clamped >= total - 1 ? total : clamped;
    this.batch(() => {
      this.sessions.forEach((session) => {
        if (session.getSnapshot().duration > 0) session.seekToTime(this.playheadMs);
        else session.pause();
      });
    });
  }

  private batch(work: () => void): void {
    this.batchDepth += 1;
    try {
      work();
    } finally {
      this.batchDepth -= 1;
    }
  }

  private refresh(): boolean {
    const left = this.left.getSnapshot();
    const right = this.right.getSnapshot();
    if (left.lastRun === null || right.lastRun === null) {
      this.stopClock();
      this.playheadMs = 0;
    }
    const next = combine(left, right, this.playheadMs, this.clock.status);
    const prev = this.snapshot;
    if (
      prev.stages[0] === next.stages[0] &&
      prev.stages[1] === next.stages[1] &&
      prev.playback === next.playback &&
      prev.progress === next.progress &&
      prev.step === next.step &&
      prev.stepCount === next.stepCount &&
      prev.duration === next.duration &&
      prev.speed === next.speed
    ) {
      return false;
    }
    this.snapshot = next;
    return true;
  }

  private emit(): void {
    if (this.refresh()) this.listeners.forEach((listener) => listener());
  }

  private onStageChange = (): void => {
    if (this.batchDepth > 0) return;
    this.emit();
  };
}
