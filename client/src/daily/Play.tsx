import { ReactNode, useEffect, useEffectEvent, useReducer, useRef, useState } from 'react';
import landing from '@/landing/Landing.module.css';
import { ListOperation, loadChallenges } from '@/Services/challenges/challenges';
import { Theme } from '@/ui/theme';
import Transport from '@/visualiser/Transport';
import { PlaybackContext } from '@/visualiser/playback';
import { usePrefersReducedMotion } from '@/visualiser/useVisualiser';
import { MobileHud, StepCard } from './DailyCards';
import { extendsExisting, sameTries, type PersistOutcome, type SavedTry } from './history';
import {
  MAX_TRIES,
  PlayInput,
  playReducer,
  restoredPlayState,
  sharedScores,
  TryScore,
} from './playMachine';
import { messageFor, mobileOutcomeOf } from './playMessages';
import { validateOperations } from './OperationBuilder';
import { ChallengeStages } from './ChallengeStages';
import { IndexDriftChallenge, Challenge, shareText } from './challenge';
import { Rig, useCompletedRunId, useReadoutValue, useStageSnapshot } from './rig';
import { ScoreCard } from './ScoreCard';
import { TargetTree } from './TargetTree';
import { readoutsFor, scoreRun, tryScoreOf, valuesForInput } from './templates';
import { stageRunOf, useStageRun } from './useStageRun';
import styles from './Daily.module.css';

/** Draws `values` on every stage now, as after a swap. */
type Redraw = (values: number[]) => void;

type ArrayChallenge = Exclude<Challenge, IndexDriftChallenge>;

type PlayBaseProps = {
  rig: Rig;
  theme: Theme;
  /** The player's input: the swappable array, or the operation builder. */
  editor: (frozen: boolean, redraw: Redraw) => ReactNode;
  /** Tries saved from an earlier visit today, resumed on load. */
  initialTries: SavedTry[];
  /** Bumps when another tab updates saved history via the storage event. */
  storageRevision: number;
  /** Days in a row finished, shown in the share text. */
  streak?: number;
  /** Saves every try so far under a cross-tab lock and reports the persistence outcome. */
  onRecordTries: (tries: SavedTry[]) => Promise<PersistOutcome>;
  /** Restores the editor input when another tab's completion freezes this challenge. */
  onRestoreInput: (input: PlayInput) => void;
};

type PlayProps = PlayBaseProps &
  (
    | { challenge: ArrayChallenge; input: { kind: 'arrangement'; arrangement: number[] } }
    | { challenge: IndexDriftChallenge; input: { kind: 'operations'; operations: ListOperation[] } }
  );

/** The game itself: the player's input, the stages, the actions, and the score cards. */
export const Play = (props: PlayProps) => {
  const {
    challenge,
    rig,
    theme,
    input,
    editor,
    initialTries,
    storageRevision,
    streak,
    onRecordTries,
    onRestoreInput,
  } = props;
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
  const [saveFailed, setSaveFailed] = useState(false);
  const savedTries = useRef(initialTries);
  const appliedRevision = useRef(storageRevision);
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

  const applySynced = useEffectEvent((tries: SavedTry[]) => {
    savedTries.current = tries;
    setSaveFailed(false);
    if (tries.length >= MAX_TRIES) {
      const finalInput = tries.at(-1)?.input;
      if (finalInput) {
        onRestoreInput(finalInput);
        draw(valuesForInput(challenge, finalInput));
      }
    }
    dispatch({ type: 'synced', scores: tries.map((saved) => saved.score) });
  });

  const recordTry = useEffectEvent(
    async (tried: PlayInput, score: TryScore, isCancelled: () => boolean) => {
      const nextTries = [...savedTries.current, { input: tried, score }];
      const outcome = await onRecordTries(nextTries);
      if (isCancelled()) return;
      if (outcome.status === 'synced') {
        applySynced(outcome.tries);
        return;
      }
      setSaveFailed(outcome.status === 'failed');
      savedTries.current = outcome.status === 'saved' ? outcome.tries : nextTries;
      dispatch({ type: 'scored', score });
    }
  );

  useEffect(() => {
    loadChallenges().catch(() => {});
  }, []);

  const busy = play.stage === 'running' || play.stage === 'scoring';
  const ended = play.stage === 'ended';
  const mobileOutcome = mobileOutcomeOf(play, challenge, busy);
  const unrunnable =
    challenge.template === 'linked-list-index-drift' &&
    input.kind === 'operations' &&
    (input.operations.length === 0 ||
      validateOperations(challenge.start.length, input.operations).status === 'invalid');

  const runWantsSkipFocus = play.stage === 'running' && play.focusSkip;
  useEffect(() => {
    if (runWantsSkipFocus) skipButton.current?.focus({ preventScroll: true });
  }, [runWantsSkipFocus]);

  useEffect(() => {
    if (play.stage === 'running' && completedRunId === play.runId) {
      dispatch({ type: 'animation-completed', runId: play.runId });
    }
  }, [play, completedRunId]);

  useEffect(() => {
    if (storageRevision === appliedRevision.current) return;
    if (play.stage === 'running' || play.stage === 'scoring') return;
    appliedRevision.current = storageRevision;
    if (sameTries(initialTries, savedTries.current)) {
      setSaveFailed(false);
      return;
    }
    if (initialTries.length > 0 && extendsExisting(initialTries, savedTries.current)) return;
    applySynced(initialTries);
  }, [initialTries, play.stage, storageRevision]);

  useEffect(() => {
    if (play.stage !== 'scoring') return undefined;
    let cancelled = false;
    scoreRun(challenge, play.input)
      .then(async (evaluation) => {
        if (cancelled) return;
        const score = tryScoreOf(challenge, evaluation);
        await recordTry(play.input, score, () => cancelled);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) dispatch({ type: 'score-failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [play, challenge]);

  const run = () => {
    if (unrunnable) return;
    const focusSkip = document.activeElement === runButton.current;
    const runId = start(stageRunOf(challenge, input));
    if (runId === null) return;
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
          <div className={styles.tilesZone}>{editor(busy || ended, draw)}</div>
          <div ref={runner} className={styles.runner}>
            <ChallengeStages rig={rig} stageTheme={stageTheme} readouts={readouts.others} />
            <PlaybackContext value={rig.playback}>
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
            onClick={rig.playback.finish}
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
