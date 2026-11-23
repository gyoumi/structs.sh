import type { StepTrace } from '../common/AnimationProducer';

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

/** Stores per-step counter and trace snapshots recorded along a visualiser timeline. */
export default class TimelineTrack {
  private counters: Timed<number>[] = [];

  private traces: Timed<StepTrace | null>[] = [];

  public recordTrace(time: number, trace: StepTrace | null): void {
    this.traces.push({ time, value: trace });
  }

  public recordCounter(time: number, counter: number): void {
    this.counters.push({ time, value: counter });
  }

  public counterAt(time: number): number {
    return latestAt(this.counters, time, 0);
  }

  public traceAt(time: number): StepTrace | null {
    return latestAt(this.traces, time, null);
  }

  public clear(): void {
    this.counters = [];
    this.traces = [];
  }
}
