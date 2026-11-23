import { useSyncExternalStore } from 'react';
import type { CanvasTarget } from '@/visualiser-src/common/canvasTarget';
import type { Playback } from '@/visualiser/playback';
import type { VisualiserSession, VisualiserSnapshot } from '@/visualiser/session';
import type { CounterSource, ReadoutValue, StageMode } from './templates';

/** One stage of the puzzle: its session, the sort it runs, and the elements it draws into. */
export type StageRig = {
  session: VisualiserSession;
  command: string;
  label: string;
  target: CanvasTarget;
  /** The name of the stage's region when the puzzle plays two sorts side by side. */
  region?: string;
};

/** The stages a puzzle plays, how they draw an arrangement, and what the shared `Playback` toolbar drives. */
export type Rig = {
  playback: Playback;
  stages: StageRig[];
  mode: StageMode;
  /** Starts a try on `values`. Returns false when a stage refused to run. */
  run: (values: number[]) => boolean;
};

/** What each stage draws for `values` before a run: the values themselves, or an empty tree. */
export const drawnArrangement = (mode: StageMode, values: number[]): number[] =>
  mode === 'tree-build' ? [] : values;

/** The arguments the stages' command takes for a try on `values`. */
export const runArgs = (mode: StageMode, values: number[]): string[] =>
  mode === 'tree-build' ? [values.join(',')] : [];

const countOf = (snapshot: VisualiserSnapshot, key: CounterSource['key']) =>
  key === 'comparisons' ? (snapshot.comparisons ?? 0) : (snapshot.counters?.[key] ?? 0);

export function useStageSnapshot<T>(
  stage: StageRig,
  selector: (snapshot: VisualiserSnapshot) => T
) {
  return useSyncExternalStore(stage.session.subscribe, () => selector(stage.session.getSnapshot()));
}

const sourcesOf = (value: ReadoutValue): [CounterSource | null, CounterSource | null] => {
  if (value.kind === 'live') return [value.source, null];
  if (value.kind === 'gap') return [value.from, value.minus];
  return [null, null];
};

const useCount = (rig: Rig, source: CounterSource | null): number =>
  useStageSnapshot(rig.stages[source?.stage ?? 0] ?? rig.stages[0], (snapshot) =>
    source ? countOf(snapshot, source.key) : 0
  );

/** A readout's number now: a stage's running count at the current step, the gap between two, or a fixed value. */
export const useReadoutValue = (rig: Rig, value: ReadoutValue): number => {
  const [first, second] = sourcesOf(value);
  const a = useCount(rig, first);
  const b = useCount(rig, second);
  if (value.kind === 'fixed') return value.value;
  return a - b;
};

const isStageComplete = (snapshot: VisualiserSnapshot) =>
  snapshot.playback === 'complete' || (snapshot.duration === 0 && snapshot.lastRun !== null);

/** The id of the run every stage has finished playing, or null while one still plays. */
export const useCompletedRunId = (rig: Rig): number | null =>
  useSyncExternalStore(rig.playback.subscribe, () => {
    const done =
      rig.playback.getSnapshot().playback === 'complete' ||
      rig.stages.every(({ session }) => isStageComplete(session.getSnapshot()));
    return done ? (rig.stages[0].session.getSnapshot().lastRun?.id ?? null) : null;
  });

/** Whether any stage holds a run's timeline. */
export const useHasTimeline = (rig: Rig): boolean =>
  useSyncExternalStore(rig.playback.subscribe, () => rig.playback.getSnapshot().duration > 0);
