import type { DrawingBounds, RunnerInfo, StepTrace } from '../common/AnimationProducer';

interface Timed<T> {
  time: number;
  value: T;
}

const latestAt = <T>(entries: Timed<T>[], time: number, fallback: T): T => {
  let value = fallback;
  entries.forEach((entry) => {
    if (entry.time <= time + 1) value = entry.value;
  });
  return value;
};

const sameBounds = (a: DrawingBounds | null, b: DrawingBounds | null): boolean =>
  a === b ||
  (a !== null &&
    b !== null &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height);

const NO_COUNTERS: Record<string, number> = Object.freeze({});

/** Stores per-step counter, trace, and upcoming bounds snapshots recorded along a visualiser timeline. */
export default class TimelineTrack {
  private counters: Timed<number>[] = [];

  private traces: Timed<StepTrace | null>[] = [];

  private namedCounters: Timed<Record<string, number>>[] = [];

  private bounds: Timed<DrawingBounds | null>[] = [];

  private focus: Timed<DrawingBounds | null>[] = [];

  private statuses: Timed<string | null>[] = [];

  public recordStep(
    stepStart: number,
    segmentStart: number,
    stepEnd: number,
    info: Pick<RunnerInfo, 'counter' | 'counters' | 'trace' | 'bounds' | 'focus' | 'status'>
  ): void {
    if (info.focus !== undefined && !sameBounds(this.focus.at(-1)?.value ?? null, info.focus)) {
      this.focus.push({ time: stepStart, value: info.focus });
    }
    if (info.status !== undefined) {
      this.statuses.push({ time: segmentStart, value: info.status });
    }
    if (info.trace !== undefined) {
      this.traces.push({ time: segmentStart, value: info.trace });
    }
    if (info.bounds !== undefined) {
      const prev = this.bounds.length > 0 ? this.bounds[this.bounds.length - 1].value : null;
      const value = info.bounds ? Object.freeze({ ...info.bounds }) : null;
      if (this.bounds.length === 0 || !sameBounds(prev, value)) {
        this.bounds.push({ time: stepStart, value });
      }
    }
    if (info.counter !== undefined) {
      this.counters.push({ time: stepEnd, value: info.counter });
    }
    if (info.counters !== undefined) {
      this.namedCounters.push({ time: stepEnd, value: Object.freeze({ ...info.counters }) });
    }
  }

  public countersAt(time: number): Record<string, number> {
    return latestAt(this.namedCounters, time, NO_COUNTERS);
  }

  public counterAt(time: number): number {
    return latestAt(this.counters, time, 0);
  }

  public traceAt(time: number): StepTrace | null {
    return latestAt(this.traces, time, null);
  }

  public boundsAt(time: number): DrawingBounds | null {
    return latestAt(this.bounds, time, null);
  }

  /** The part of the drawing the step at `time` works on, or null when no step names one. */
  public focusAt(time: number): DrawingBounds | null {
    return latestAt(this.focus, time, null);
  }

  /** The producer's step status line at `time`, or null when none is recorded. */
  public statusAt(time: number): string | null {
    return latestAt(this.statuses, time, null);
  }

  public clear(): void {
    this.counters = [];
    this.traces = [];
    this.namedCounters = [];
    this.bounds = [];
    this.focus = [];
    this.statuses = [];
  }
}
