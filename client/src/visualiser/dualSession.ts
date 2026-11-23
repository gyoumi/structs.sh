import type { PlaybackStage } from '@/visualiser-src/controller/VisualiserController';
import type { Playback, PlaybackSnapshot } from './playback';
import type { VisualiserSession } from './session';
import type { VisualiserSnapshot } from './sessionSnapshot';

/** Both stages' snapshots, and the one timeline the shared toolbar shows for them. */
export interface DualSnapshot extends PlaybackSnapshot {
  stages: [VisualiserSnapshot, VisualiserSnapshot];
}

type Link = { status: 'unlinked' } | { status: 'linked'; unlink: () => void };

const timeOf = (snapshot: VisualiserSnapshot) => (snapshot.progress / 100) * snapshot.duration;

const playbackOf = (left: VisualiserSnapshot, right: VisualiserSnapshot): PlaybackStage => {
  if (left.playback === 'playing' || right.playback === 'playing') return 'playing';
  const ran = Math.max(left.duration, right.duration) > 0;
  return ran && left.playback === 'complete' && right.playback === 'complete'
    ? 'complete'
    : 'paused';
};

const combine = (left: VisualiserSnapshot, right: VisualiserSnapshot): DualSnapshot => {
  const duration = Math.max(left.duration, right.duration);
  const playback = playbackOf(left, right);
  const reached = duration > 0 ? (Math.max(timeOf(left), timeOf(right)) / duration) * 100 : 0;
  return {
    stages: [left, right],
    playback,
    progress: playback === 'complete' ? 100 : Math.min(reached, 99.9),
    step: left.step + right.step,
    stepCount: left.stepCount + right.stepCount,
    duration,
    speed: left.speed,
  };
};

/**
 * Two sessions on one shared timeline, for a page that plays two algorithms side by side. Both
 * start together and run at one speed, so a time on the shared timeline is the same time in each.
 * The shared run is complete only once both are.
 */
export class DualSession implements Playback {
  readonly left: VisualiserSession;

  readonly right: VisualiserSession;

  private snapshot: DualSnapshot;

  private listeners = new Set<() => void>();

  private link: Link = { status: 'unlinked' };

  constructor(left: VisualiserSession, right: VisualiserSession) {
    this.left = left;
    this.right = right;
    this.snapshot = combine(left.getSnapshot(), right.getSnapshot());
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
      this.link.unlink();
      this.link = { status: 'unlinked' };
    };
  };

  getSnapshot = (): DualSnapshot => {
    this.refresh();
    return this.snapshot;
  };

  play = (): void => {
    if (this.getSnapshot().playback === 'complete') this.sessions.forEach((s) => s.rewind());
    this.sessions.forEach((session) => {
      if (session.getSnapshot().playback !== 'complete') session.play();
    });
  };

  pause = (): void => this.sessions.forEach((session) => session.pause());

  togglePlay = (): void => {
    if (this.getSnapshot().playback === 'playing') this.pause();
    else this.play();
  };

  stepForward = (): void => this.sessions.forEach((session) => session.stepForward());

  stepBackward = (): void => this.sessions.forEach((session) => session.stepBackward());

  rewind = (): void => this.sessions.forEach((session) => session.rewind());

  finish = (): void => this.sessions.forEach((session) => session.finish());

  /** Seeks both stages to the same time: `percent` of the longer run. */
  seekToPercent = (percent: number): void => {
    const time = (percent / 100) * this.getSnapshot().duration;
    this.sessions.forEach((session) => {
      const { duration } = session.getSnapshot();
      session.seekToPercent(duration > 0 ? Math.min(100, (time / duration) * 100) : 0);
    });
  };

  setSpeed = (speed: number): void => this.sessions.forEach((session) => session.setSpeed(speed));

  private refresh(): boolean {
    const left = this.left.getSnapshot();
    const right = this.right.getSnapshot();
    const [shownLeft, shownRight] = this.snapshot.stages;
    if (left === shownLeft && right === shownRight) return false;
    this.snapshot = combine(left, right);
    return true;
  }

  private onStageChange = (): void => {
    if (this.refresh()) this.listeners.forEach((listener) => listener());
  };
}
