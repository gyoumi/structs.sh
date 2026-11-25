import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { ListOperation } from '@/Services/challenges/challenges';
import { Theme } from '@/ui/theme';
import { canvasThemes } from '@/visualiser/canvasThemes';
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

type StageRunOptions = {
  rig: Rig;
  theme: Theme;
  /** The run to show, ended, once the stages are first drawn: the last try saved before a reload. */
  restored?: StageRun;
};

/**
 * What the stages show and in which theme: `draw` puts values on them, `start` runs a try on them.
 * A theme switch redraws them at once; a run they show keeps playing from the same point, with the
 * stage's pan and zoom kept.
 */
export const useStageRun = ({ rig, theme, restored }: StageRunOptions) => {
  const [stageTheme, setStageTheme] = useState(theme);
  const pendingRestore = useRef(restored);
  const attached = useStageSnapshot(rig.stages[0], (snapshot) => snapshot.topicTitle !== null);

  /** Draws `values` on every stage in the page's theme, dropping any run. */
  const draw = (values: number[]) => {
    setStageTheme(theme);
    const drawn = drawnArrangement(rig.mode, values);
    rig.stages.forEach(({ session }) => session.loadData(drawn, canvasThemes[theme], true));
  };

  /** Draws `run`'s values and starts it. Returns the run's id, or null when a stage refused it. */
  const start = (run: StageRun): number | null => {
    draw(run.values);
    if (!rig.run(run.values, run.operations)) return null;
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
    setStageTheme(theme);
    rig.stages.forEach(({ session }) => session.retheme(canvasThemes[theme]));
  });

  useEffect(() => {
    if (stageTheme !== theme) retheme();
  }, [stageTheme, theme]);

  return { stageTheme, draw, start };
};
