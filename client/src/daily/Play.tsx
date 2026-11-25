import { ReactNode, useEffect, useReducer, useRef } from 'react';
import landing from '@/landing/Landing.module.css';
import { ListOperation, loadChallenges } from '@/Services/challenges/challenges';
import { Theme } from '@/ui/theme';
import Transport from '@/visualiser/Transport';
import { PlaybackContext } from '@/visualiser/playback';
import { usePrefersReducedMotion } from '@/visualiser/useVisualiser';
import { MobileHud, StepCard } from './DailyCards';
import { MAX_TRIES, playReducer, restoredPlayState, sharedScores } from './playMachine';
import { messageFor, mobileOutcomeOf } from './playMessages';
import { isRunnable } from './operations';
import { ChallengeStages } from './ChallengeStages';
import { ArrayChallenge, IndexDriftChallenge, shareText } from './challenge';
import { Rig, useCompletedRunId, useReadoutValue, useStageSnapshot } from './rig';
import { ScoreCard } from './ScoreCard';
import { TargetTree } from './TargetTree';
import { readoutsFor, valuesForInput } from './templates';
import { SavedTriesProps, useSavedTries } from './useSavedTries';
import { useRunSync } from './useRunSync';
import { stageRunOf, useStageRun } from './useStageRun';
import styles from './Daily.module.css';

/** Draws `values` on every stage now, as after a swap. */
type Redraw = (values: number[]) => void;

type PlayBaseProps = SavedTriesProps & {
  rig: Rig;
  theme: Theme;
  /** The player's input: the swappable array, or the operation builder. */
  editor: (frozen: boolean, redraw: Redraw) => ReactNode;
  /** Days in a row finished, shown in the share text. */
  streak?: number;
};

type PlayProps = PlayBaseProps &
  (
    | { challenge: ArrayChallenge; input: { kind: 'arrangement'; arrangement: number[] } }
    | { challenge: IndexDriftChallenge; input: { kind: 'operations'; operations: ListOperation[] } }
  );

/** The game itself: the player's input, the stages, the actions, and the score cards. */
export const Play = (props: PlayProps) => {
  const { challenge, rig, theme, input, editor, initialTries, streak, onRestoreInput } = props;
  const completedRunId = useCompletedRunId(rig);
  const [firstStage] = rig.stages;
  const trace = useStageSnapshot(firstStage, (s) => s.trace);
  const values = valuesForInput(challenge, input);
  const readouts = readoutsFor(challenge, values);
  const primaryValue = useReadoutValue(rig, readouts.primary.value);
  const [play, dispatch] = useReducer(
    playReducer,
    initialTries.map((saved) => saved.score),
    restoredPlayState
  );
  const runner = useRef<HTMLDivElement>(null);
  const runButton = useRef<HTMLButtonElement>(null);
  const skipButton = useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const lastTry = initialTries.at(-1);
  const { stageTheme, draw, start } = useStageRun({
    rig,
    theme,
    restored: lastTry && stageRunOf(challenge, lastTry.input),
    onRerun: (runId) => dispatch({ type: 'rerun', runId }),
  });

  const { saveFailed, hold, follow } = useSavedTries({ ...props, play, dispatch, draw });
  const sync = useRunSync({
    challenge,
    rig,
    play,
    dispatch,
    start,
    draw,
    onRestoreInput,
    follow,
  });

  useEffect(() => {
    loadChallenges().catch(() => {});
  }, []);

  const busy = play.stage === 'running' || play.stage === 'scoring';
  const ended = play.stage === 'ended';
  const mobileOutcome = mobileOutcomeOf(play, challenge, busy);
  const unrunnable =
    challenge.template === 'linked-list-index-drift' &&
    input.kind === 'operations' &&
    !isRunnable(challenge.start.length, input.operations);

  const runWantsSkipFocus = play.stage === 'running' && play.focusSkip;
  useEffect(() => {
    if (runWantsSkipFocus) skipButton.current?.focus({ preventScroll: true });
  }, [runWantsSkipFocus]);

  useEffect(() => {
    if (play.stage === 'running' && completedRunId === play.runId) {
      dispatch({ type: 'animation-completed', runId: play.runId });
    }
  }, [play, completedRunId]);

  const run = () => {
    if (unrunnable) return;
    const focusSkip = document.activeElement === runButton.current;
    const runId = start(stageRunOf(challenge, input));
    if (runId === null) return;
    sync.announce(input, play.scores, hold(input));
    dispatch({ type: 'run', input, runId, focusSkip });
    runner.current?.scrollIntoView?.({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
    });
  };

  const share = () => {
    const clipboard = navigator.clipboard as Clipboard | undefined;
    if (!clipboard?.writeText) {
      dispatch({ type: 'share-failed' });
      return;
    }
    clipboard
      .writeText(shareText(challenge, sharedScores(play.scores), streak))
      .then(() => dispatch({ type: 'share-copied' }))
      .catch(() => dispatch({ type: 'share-failed' }));
  };

  return (
    <div className={styles.workspace}>
      <div className={styles.playColumn}>
        <div className={styles.panel}>
          <MobileHud
            value={primaryValue}
            goal={challenge.goal}
            comparison={trace?.comparison}
            triesLeft={ended ? 0 : MAX_TRIES - play.scores.length}
            stageTheme={stageTheme}
            outcome={mobileOutcome}
          />
          <div className={styles.tilesZone}>{editor(busy || ended, sync.draw)}</div>
          <div ref={runner} className={styles.runner}>
            <ChallengeStages rig={rig} stageTheme={stageTheme} readouts={readouts.others} />
            <PlaybackContext value={sync.playback}>
              <Transport />
            </PlaybackContext>
          </div>
        </div>
        <div className={styles.actions}>
          <button
            ref={runButton}
            type="button"
            className={`${landing.primary} ${styles.action} ${styles.run}`}
            onClick={run}
            disabled={busy || ended || unrunnable}
          >
            Run
          </button>
          <button
            ref={skipButton}
            type="button"
            className={`${landing.secondary} ${styles.action}`}
            onClick={sync.playback.finish}
            disabled={play.stage !== 'running'}
          >
            Skip
          </button>
          {ended && (
            <>
              <button
                type="button"
                className={`${landing.secondary} ${styles.action}`}
                onClick={share}
              >
                Share
              </button>
              <span aria-live="polite" className={styles.note}>
                {play.share === 'copied' && 'Copied!'}
                {play.share === 'failed' && 'Couldn’t copy — try again.'}
              </span>
            </>
          )}
        </div>
        <span aria-live="polite" className={styles.message}>
          {messageFor(play, challenge)}
        </span>
        {saveFailed && (
          <p role="alert" className={styles.note}>
            Couldn’t save progress to this browser.
          </p>
        )}
      </div>
      <aside className={styles.sidebar}>
        <ScoreCard challenge={challenge} rig={rig} readouts={readouts} play={play} />
        {challenge.template === 'bst-forced-order' && (
          <TargetTree preorder={challenge.targetTree} />
        )}
        {challenge.template === 'quicksort-most-comparisons' && (
          <StepCard trace={trace} stageTheme={stageTheme} />
        )}
      </aside>
    </div>
  );
};
