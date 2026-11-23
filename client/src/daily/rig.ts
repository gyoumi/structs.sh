import { useSyncExternalStore } from 'react';
import type { CanvasTarget } from '@/visualiser-src/common/canvasTarget';
import type { Playback } from '@/visualiser/playback';
import type { VisualiserSession, VisualiserSnapshot } from '@/visualiser/session';
import type { CounterSource, ReadoutValue } from './templates';

/** One stage of the puzzle: its session, the sort it runs, and the elements it draws into. */
export type StageRig = {
  session: VisualiserSession;
  command: string;
  label: string;
  target: CanvasTarget;
  /** The name of the stage's region when the puzzle plays two sorts side by side. */
  region?: string;
};

/** The stages a puzzle plays, and what the shared `Playback` toolbar drives. */
export type Rig = { playback: Playback; stages: StageRig[]; run: () => boolean };

const countOf = (snapshot: VisualiserSnapshot, key: CounterSource['key']) =>
  key === 'comparisons' ? (snapshot.comparisons ?? 0) : (snapshot.counters?.[key] ?? 0);

export function useStageSnapshot<T>(
  stage: StageRig,
  selector: (snapshot: VisualiserSnapshot) => T
) {
  return useSyncExternalStore(stage.session.subscribe, () => selector(stage.session.getSnapshot()));
}

/** A readout's number now: a stage's running count at the current step, or a fixed value. */
export const useReadoutValue = (rig: Rig, value: ReadoutValue): number => {
  const stage = rig.stages[value.kind === 'live' ? value.source.stage : 0];
  return useStageSnapshot(stage, (snapshot) =>
    value.kind === 'live' ? countOf(snapshot, value.source.key) : value.value
  );
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
