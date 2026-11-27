import type { DrawingBounds, StepTrace } from '@/visualiser-src/common/AnimationProducer';
import type { Documentation } from '@/visualiser-src/common/typedefs';
import type VisualiserController from '@/visualiser-src/controller/VisualiserController';
import type { PlaybackStage } from '@/visualiser-src/controller/VisualiserController';

interface LastRun {
  id: number;
  command: string;
  args: string[];
}

export interface VisualiserSnapshot {
  topicTitle: string | null;
  documentation: Documentation;
  playback: PlaybackStage;
  progress: number;
  step: number;
  stepCount: number;
  stepTimes: number[];
  duration: number;
  line: number | null;
  code: string[];
  lastRun: LastRun | null;
  speed: number;
  layoutVersion: number;
  /** The running count of the sort being shown (quicksort's comparisons) at the current step. */
  comparisons?: number;
  /** The sort's named running counts at the current step, such as bubble sort's passes and swaps. */
  counters?: Record<string, number>;
  /** The sort's pivot and active comparison at the current step, or null outside a partition. */
  trace: StepTrace | null;
  /** Upcoming drawing bounds for the active step, so the stage can zoom out before a node appears. */
  bounds: DrawingBounds | null;
  /** The part of the drawing the active step works on, so a stage too small for all of it can follow it. */
  focus: DrawingBounds | null;
  /** Short status line for the active step, or null when the producer has none or playback hasn't started. */
  status: string | null;
  /** How many values the structure holds, including a run that is still playing. */
  size: number;
}

export const initialSnapshot: VisualiserSnapshot = {
  topicTitle: null,
  documentation: {},
  playback: 'paused',
  progress: 0,
  step: 0,
  stepCount: 0,
  stepTimes: [],
  duration: 0,
  line: null,
  code: [],
  size: 0,
  lastRun: null,
  speed: 1,
  layoutVersion: 0,
  comparisons: 0,
  counters: {},
  trace: null,
  bounds: null,
  focus: null,
  status: null,
};

/** Picks the random data a topic starts with, or returns undefined to use the engine's own. */
export type InitialDataSource = (topicTitle: string) => number[] | undefined;

/** What the snapshot shows of `controller` at its current time. */
export const sampleOf = (
  controller: VisualiserController,
  duration: number,
  stepTimes: number[]
) => {
  const { time } = controller;
  return {
    playback: controller.playback,
    progress: duration > 0 ? Math.min(100, (time / duration) * 100) : 0,
    step: stepTimes.filter((t) => t <= time + 1).length,
    line: duration > 0 ? controller.currentLine : null,
    size: controller.data.length,
    comparisons: controller.counterAt(time),
    counters: controller.countersAt(time),
    trace: duration > 0 ? controller.traceAt(time) : null,
    bounds: duration > 0 ? controller.boundsAt(time) : null,
    focus: duration > 0 ? controller.track.focusAt(time) : null,
    status: duration > 0 ? controller.track.statusAt(time) : null,
  };
};

/** Whether `sample` shows something `snapshot` doesn't. Unless `exact`, tiny progress changes don't count. */
export const sampleChanged = (
  snapshot: VisualiserSnapshot,
  sample: ReturnType<typeof sampleOf>,
  exact: boolean
): boolean =>
  sample.playback !== snapshot.playback ||
  (exact
    ? sample.progress !== snapshot.progress
    : Math.abs(sample.progress - snapshot.progress) > 0.05) ||
  sample.step !== snapshot.step ||
  sample.line !== snapshot.line ||
  sample.size !== snapshot.size ||
  sample.comparisons !== (snapshot.comparisons ?? 0) ||
  sample.counters !== snapshot.counters ||
  sample.trace !== snapshot.trace ||
  sample.bounds !== snapshot.bounds ||
  sample.focus !== snapshot.focus ||
  sample.status !== snapshot.status;
