import { ReactNode, useEffect, useReducer, useRef, useState } from 'react';
import landing from '@/landing/Landing.module.css';
import { evaluatePuzzle, ListOperation, loadPuzzles } from '@/Services/puzzles/puzzles';
import { Theme } from '@/ui/theme';
import Transport from '@/visualiser/Transport';
import { canvasThemes } from '@/visualiser/canvasThemes';
import { PlaybackContext } from '@/visualiser/playback';
import { usePrefersReducedMotion } from '@/visualiser/useVisualiser';
import { MobileHud, StepCard } from './DailyCards';
import { initialPlayState, MAX_TRIES, playReducer, sharedScores } from './playMachine';
import { messageFor, mobileOutcomeOf } from './playMessages';
import { PuzzleStages } from './PuzzleStages';
import { Puzzle, shareText } from './puzzle';
import {
  drawnArrangement,
  Rig,
  useCompletedRunId,
  useHasTimeline,
  useReadoutValue,
  useStageSnapshot,
} from './rig';
import { ScoreCard } from './ScoreCard';
import { TargetTree } from './TargetTree';
import { instanceOf, readoutsFor, tryScoreOf } from './templates';
import styles from './Daily.module.css';

/** Draws `values` on every stage now, as after a swap. */
type Redraw = (values: number[]) => void;

type PlayProps = {
  puzzle: Puzzle;
  rig: Rig;
  theme: Theme;
  /** What the stages draw and run: the arrangement, or the start list the operations run on. */
  values: number[];
  /** The player's operations, for a puzzle played by building them. */
  operations?: ListOperation[];
  /** The player's input: the swappable array, or the operation builder. */
  editor: (frozen: boolean, redraw: Redraw) => ReactNode;
};

/** The game itself: the player's input, the stages, the actions, and the score cards. */
export const Play = ({ puzzle, rig, theme, values, operations, editor }: PlayProps) => {
  const completedRunId = useCompletedRunId(rig);
  const hasTimeline = useHasTimeline(rig);
  const [firstStage] = rig.stages;
  const trace = useStageSnapshot(firstStage, (s) => s.trace);
  const readouts = readoutsFor(puzzle, values);
  const primaryValue = useReadoutValue(rig, readouts.primary.value);
  const [play, dispatch] = useReducer(playReducer, initialPlayState);
  const runner = useRef<HTMLDivElement>(null);
  const runButton = useRef<HTMLButtonElement>(null);
  const skipButton = useRef<HTMLButtonElement>(null);
  const reducedMotion = usePrefersReducedMotion();
  const [stageTheme, setStageTheme] = useState(theme);

  useEffect(() => {
    loadPuzzles().catch(() => {});
  }, []);

  const busy = play.stage === 'running' || play.stage === 'scoring';
  const ended = play.stage === 'ended';
  const mobileOutcome = mobileOutcomeOf(play, puzzle, busy);
  const nothingToRun = operations !== undefined && operations.length === 0;

  useEffect(() => {
    if (stageTheme === theme || busy || hasTimeline) return;
    setStageTheme(theme);
    rig.stages.forEach(({ session }) => session.retheme(canvasThemes[theme]));
  }, [stageTheme, theme, busy, hasTimeline, rig]);

  const draw = (arrangement: number[]) => {
    setStageTheme(theme);
    const drawn = drawnArrangement(rig.mode, arrangement);
    rig.stages.forEach(({ session }) => session.loadData(drawn, canvasThemes[theme], true));
  };

  useEffect(() => {
    if (play.stage === 'running' && play.focusSkip) {
      skipButton.current?.focus({ preventScroll: true });
    }
  }, [play]);

  useEffect(() => {
    if (play.stage === 'running' && completedRunId === play.runId) {
      dispatch({ type: 'animation-completed', runId: play.runId });
    }
  }, [play, completedRunId]);

  useEffect(() => {
    if (play.stage !== 'scoring') return undefined;
    let cancelled = false;
    evaluatePuzzle(instanceOf(puzzle), play.operations ?? play.arrangement)
      .then((evaluation) => {
        if (!cancelled) dispatch({ type: 'scored', score: tryScoreOf(puzzle, evaluation) });
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) dispatch({ type: 'score-failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [play, puzzle]);

  const run = () => {
    const focusSkip = document.activeElement === runButton.current;
    draw(values);
    if (!rig.run(values, operations)) return;
    const runId = firstStage.session.getSnapshot().lastRun?.id ?? 0;
    dispatch({ type: 'run', arrangement: values, operations, runId, focusSkip });
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
      .writeText(shareText(puzzle, sharedScores(play.scores)))
      .then(() => dispatch({ type: 'share-copied' }))
      .catch(() => dispatch({ type: 'share-failed' }));
  };

  return (
    <div className={styles.workspace}>
      <div className={styles.playColumn}>
        <div className={styles.panel}>
          <MobileHud
            value={primaryValue}
            par={puzzle.par}
            comparison={trace?.comparison}
            triesLeft={ended ? 0 : MAX_TRIES - play.scores.length}
            stageTheme={stageTheme}
            outcome={mobileOutcome}
          />
          <div className={styles.tilesZone}>{editor(busy || ended, draw)}</div>
          <div ref={runner} className={styles.runner}>
            <PuzzleStages rig={rig} stageTheme={stageTheme} readouts={readouts.others} />
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
            disabled={busy || ended || nothingToRun}
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
          {messageFor(play, puzzle)}
        </span>
      </div>
      <aside className={styles.sidebar}>
        <ScoreCard puzzle={puzzle} rig={rig} readouts={readouts} play={play} />
        {puzzle.template === 'bst-forced-order' && <TargetTree preorder={puzzle.targetTree} />}
        {puzzle.template === 'quicksort-most-comparisons' && (
          <StepCard trace={trace} stageTheme={stageTheme} />
        )}
      </aside>
    </div>
  );
};
