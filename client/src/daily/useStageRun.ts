import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ListOperation } from '@/Services/challenges/challenges';
import { Theme } from '@/ui/theme';
import { canvasThemes } from '@/visualiser/canvasThemes';
import type { PlaybackSnapshot } from '@/visualiser/playback';
import type { Challenge } from './challenge';
import type { PlayInput } from './playMachine';
import { drawnArrangement, Rig, useStageSnapshot } from './rig';
import { valuesForInput } from './templates';

/** What a try runs on the stages: the values they start from and, in `list-ops` mode, the operations. */
type StageRun = { values: number[]; operations?: ListOperation[] };

/** The run a try on `input` plays on the stages. */
export const stageRunOf = (challenge: Challenge, input: PlayInput): StageRun => ({
  values: valuesForInput(challenge, input),
  operations: input.kind === 'operations' ? input.operations : undefined,
});

/** The run of the last saved try, to show after a reload, or undefined when there is none or it no longer fits the challenge. */
export const restoredRunOf = (challenge: Challenge, input?: PlayInput): StageRun | undefined => {
  if (!input) return undefined;
  if (input.kind === 'arrangement' && input.arrangement.length !== challenge.values?.length) {
    return undefined;
  }
  return stageRunOf(challenge, input);
};

/** Puts the playback back where `before` was, after the same run started again. */
const returnTo = (rig: Rig, before: PlaybackSnapshot) => {
  if (before.playback === 'complete') {
    rig.playback.finish();
    return;
  }
  rig.playback.seekToPercent(before.progress);
  if (before.playback === 'playing') rig.playback.togglePlay();
};

type StageRunOptions = {
  rig: Rig;
  theme: Theme;
  /** The run to show, ended, once the stages are first drawn: the last try saved before a reload. */
  restored?: StageRun;
  /** Called with the new run id when the shown run is started again to redraw it in another theme. */
  onRerun: (runId: number) => void;
};

/**
 * What the stages show and in which theme: `draw` puts values on them, `start` runs a try on them.
 * A theme switch redraws them at once; a run they show is started again in the new theme and
 * returned to the same point.
 */
export const useStageRun = ({ rig, theme, restored, onRerun }: StageRunOptions) => {
  const [stageTheme, setStageTheme] = useState(theme);
  const shown = useRef<StageRun | null>(null);
  const pendingRestore = useRef(restored);
  const attached = useStageSnapshot(rig.stages[0], (snapshot) => snapshot.topicTitle !== null);

  /** Draws `values` on every stage in the page's theme, dropping any run. */
  const draw = (values: number[]) => {
    setStageTheme(theme);
    shown.current = null;
    const drawn = drawnArrangement(rig.mode, values);
    rig.stages.forEach(({ session }) => session.loadData(drawn, canvasThemes[theme], true));
  };

  /** Draws `run`'s values and starts it. Returns the run's id, or null when a stage refused it. */
  const start = (run: StageRun): number | null => {
    draw(run.values);
    if (!rig.run(run.values, run.operations)) return null;
    shown.current = run;
    return rig.stages[0].session.getSnapshot().lastRun?.id ?? 0;
  };

  const restore = useEffectEvent(() => {
    const run = pendingRestore.current;
    pendingRestore.current = undefined;
    if (run && start(run) !== null) rig.playback.finish();
  });

  useEffect(() => {
    if (attached) restore();
  }, [attached]);

  const retheme = useEffectEvent(() => {
    const run = shown.current;
    if (!run) {
      setStageTheme(theme);
      rig.stages.forEach(({ session }) => session.retheme(canvasThemes[theme]));
      return;
    }
    const before = rig.playback.getSnapshot();
    const runId = start(run);
    if (runId === null) return;
    returnTo(rig, before);
    onRerun(runId);
  });

  useEffect(() => {
    if (stageTheme !== theme) retheme();
  }, [stageTheme, theme]);

  return { stageTheme, draw, start };
};
