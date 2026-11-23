import { ReactNode, useEffect, useState } from 'react';
import { DEFAULT_CANVAS_TARGET } from '@/visualiser-src/common/canvasTarget';
import { Theme } from '@/ui/theme';
import Stage from '@/visualiser/Stage';
import { canvasThemes } from '@/visualiser/canvasThemes';
import { DualSession } from '@/visualiser/dualSession';
import { findTopic } from '@/visualiser/topics';
import { SessionContext, useCreateSession } from '@/visualiser/useVisualiser';
import type { Rig } from './rig';
import type { DualStageSpec, StagePlan, StageSpec } from './templates';
import styles from './Daily.module.css';

const sorting = findTopic('sorting-algorithms');
if (!sorting) throw new Error('The sorting topic is missing.');

const DEFAULT_PLAYBACK_SPEED = 2;

type RigProps = {
  theme: Theme;
  values: number[];
  children: (rig: Rig) => ReactNode;
};

const useFirstDraw = (theme: Theme, values: number[]) =>
  useState(() => ({ theme: canvasThemes[theme], values }))[0];

const SingleRig = ({ stage, theme, values, children }: RigProps & { stage: StageSpec }) => {
  const first = useFirstDraw(theme, values);
  const session = useCreateSession(sorting, first.theme, first.values, undefined, true);
  const [rig] = useState<Rig>(() => ({
    playback: session,
    stages: [{ ...stage, session, target: DEFAULT_CANVAS_TARGET }],
  }));
  useEffect(() => session.setSpeed(DEFAULT_PLAYBACK_SPEED), [session]);
  return children(rig);
};

type DualRigProps = RigProps & { stages: [DualStageSpec, DualStageSpec] };

const DualRig = ({ stages: [left, right], theme, values, children }: DualRigProps) => {
  const first = useFirstDraw(theme, values);
  const leftSession = useCreateSession(
    sorting,
    first.theme,
    first.values,
    undefined,
    true,
    left.target
  );
  const rightSession = useCreateSession(
    sorting,
    first.theme,
    first.values,
    undefined,
    true,
    right.target
  );
  const [rig] = useState<Rig>(() => ({
    playback: new DualSession(leftSession, rightSession),
    stages: [
      { ...left, session: leftSession },
      { ...right, session: rightSession },
    ],
  }));
  useEffect(() => rig.playback.setSpeed(DEFAULT_PLAYBACK_SPEED), [rig]);
  return children(rig);
};

/** Creates the sessions the puzzle's stages draw with, and hands them to `children`. */
export const PuzzleRig = ({ plan, ...props }: RigProps & { plan: StagePlan }) =>
  plan.kind === 'dual' ? (
    <DualRig stages={plan.stages} {...props} />
  ) : (
    <SingleRig stage={plan.stage} {...props} />
  );

type PuzzleStagesProps = { rig: Rig; stageTheme: Theme };

/** One stage, or two side by side (stacked on a phone) in their own named regions. */
export const PuzzleStages = ({ rig, stageTheme }: PuzzleStagesProps) => {
  const className = `${styles.stage} ${stageTheme === 'dark' ? styles.stageDark : styles.stageLight}`;
  if (rig.stages.length === 1) {
    const [stage] = rig.stages;
    return (
      <SessionContext value={stage.session}>
        <Stage label={stage.label} target={stage.target} className={className} />
      </SessionContext>
    );
  }
  return (
    <div className={styles.stagePair}>
      {rig.stages.map((stage) => (
        <section key={stage.command} aria-label={stage.region} className={styles.stageRegion}>
          <h2 className={styles.stageName}>{stage.region}</h2>
          <SessionContext value={stage.session}>
            <Stage label={stage.label} target={stage.target} className={className} />
          </SessionContext>
        </section>
      ))}
    </div>
  );
};
