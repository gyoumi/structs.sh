import type { StepTrace } from '@/visualiser-src/common/AnimationProducer';
import type { Documentation } from '@/visualiser-src/common/typedefs';
import type { PlaybackStage } from '@/visualiser-src/controller/VisualiserController';

export interface LastRun {
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
  /** The sort's pivot and active comparison at the current step, or null outside a partition. */
  trace: StepTrace | null;
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
  trace: null,
};

/** Picks the random data a topic starts with, or returns undefined to use the engine's own. */
export type InitialDataSource = (topicTitle: string) => number[] | undefined;
