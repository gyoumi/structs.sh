import { ReactNode, useEffect, useState } from 'react';
import { DEFAULT_CANVAS_TARGET } from '@/visualiser-src/common/canvasTarget';
import { Theme } from '@/ui/theme';
import Stage from '@/visualiser/Stage';
import { canvasThemes } from '@/visualiser/canvasThemes';
import { DualSession } from '@/visualiser/dualSession';
import { findTopic, Topic, TopicSlug } from '@/visualiser/topics';
import { SessionContext, useCreateSession } from '@/visualiser/useVisualiser';
import { drawnArrangement, Rig, runArgs, useReadoutValue } from './rig';
import type { DualStageSpec, Readout, StageMode, StagePlan, StageSpec } from './templates';
import styles from './Daily.module.css';

const topicFor = (slug: TopicSlug): Topic => {
  const topic = findTopic(slug);
  if (!topic) throw new Error(`The ${slug} topic is missing.`);
  return topic;
};

const DEFAULT_PLAYBACK_SPEED = 2;

type RigProps = {
  theme: Theme;
  values: number[];
  mode: StageMode;
  children: (rig: Rig) => ReactNode;
};

const useFirstDraw = (theme: Theme, mode: StageMode, values: number[]) =>
  useState(() => ({ theme: canvasThemes[theme], values: drawnArrangement(mode, values) }))[0];

const SingleRig = ({ stage, theme, values, mode, children }: RigProps & { stage: StageSpec }) => {
  const first = useFirstDraw(theme, mode, values);
  const session = useCreateSession(
    topicFor(stage.topic),
    first.theme,
    first.values,
    undefined,
    true
  );
  const [rig] = useState<Rig>(() => ({
    playback: session,
    stages: [{ ...stage, session, target: DEFAULT_CANVAS_TARGET }],
    mode,
    run: (arrangement, operations) =>
      !session.run(stage.command, runArgs(mode, arrangement, operations)),
  }));
  useEffect(() => session.setSpeed(DEFAULT_PLAYBACK_SPEED), [session]);
  return children(rig);
};

type DualRigProps = RigProps & { stages: [DualStageSpec, DualStageSpec] };

const DualRig = ({ stages: [left, right], theme, values, mode, children }: DualRigProps) => {
  const first = useFirstDraw(theme, mode, values);
  const leftSession = useCreateSession(
    topicFor(left.topic),
    first.theme,
    first.values,
    undefined,
    true,
    left.target
  );
  const rightSession = useCreateSession(
    topicFor(right.topic),
    first.theme,
    first.values,
    undefined,
    true,
    right.target
  );
  const [dual] = useState(() => new DualSession(leftSession, rightSession));
  const [rig] = useState<Rig>(() => ({
    playback: dual,
    stages: [
      { ...left, session: leftSession },
      { ...right, session: rightSession },
    ],
    mode,
    run: (arrangement) => !dual.run(left.command, right.command, runArgs(mode, arrangement)),
  }));
  useEffect(() => dual.setSpeed(DEFAULT_PLAYBACK_SPEED), [dual]);
  useEffect(() => () => dual.dispose(), [dual]);
  return children(rig);
};

/** Creates the sessions the puzzle's stages draw with, and hands them to `children`. */
export const PuzzleRig = ({ plan, ...props }: Omit<RigProps, 'mode'> & { plan: StagePlan }) =>
  plan.kind === 'dual' ? (
    <DualRig stages={plan.stages} mode={plan.mode} {...props} />
  ) : (
    <SingleRig stage={plan.stage} mode={plan.mode} {...props} />
  );

const StageCount = ({ rig, readout }: { rig: Rig; readout: Readout }) => {
  const value = useReadoutValue(rig, readout.value);
  return (
    <span className={styles.stageCount} aria-hidden="true">
      {value}
    </span>
  );
};

type PuzzleStagesProps = { rig: Rig; stageTheme: Theme; readouts?: Readout[] };

/** One stage, or two side by side (stacked on a phone) in their own named regions. */
export const PuzzleStages = ({ rig, stageTheme, readouts = [] }: PuzzleStagesProps) => {
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
      {rig.stages.map((stage, index) => {
        const counter = readouts.find(
          (r) => r.value.kind === 'live' && r.value.source.stage === index
        );
        return (
          <section key={stage.region} aria-label={stage.region} className={styles.stageRegion}>
            <div className={styles.stageHeader}>
              <h2 className={styles.stageName}>{stage.region}</h2>
              {counter && <StageCount rig={rig} readout={counter} />}
            </div>
            <SessionContext value={stage.session}>
              <Stage label={stage.label} target={stage.target} className={className} />
            </SessionContext>
          </section>
        );
      })}
    </div>
  );
};
