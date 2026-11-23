import '@fontsource-variable/fredoka';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '@/assets/img/structs.png';
import hero from '@/landing/HeroSection.module.css';
import landing from '@/landing/Landing.module.css';
import { evaluatePuzzle, loadPuzzles } from '@/Services/puzzles/puzzles';
import { Theme, ThemeToggle, useTheme } from '@/ui/theme';
import Transport from '@/visualiser/Transport';
import { canvasThemes } from '@/visualiser/canvasThemes';
import { PlaybackContext } from '@/visualiser/playback';
import { usePrefersReducedMotion } from '@/visualiser/useVisualiser';
import { MobileHud, StepCard } from './DailyCards';
import {
  initialPlayState,
  MAX_TRIES,
  PlayState,
  playReducer,
  sharedScores,
  shownScore,
} from './playMachine';
import PuzzleArray from './PuzzleArray';
import { PuzzleIntro } from './PuzzleIntro';
import { PuzzleRig, PuzzleStages } from './PuzzleStages';
import { Puzzle, shareText, usePuzzle } from './puzzle';
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
import { instanceOf, readoutsFor, stagePlanFor, tryScoreOf } from './templates';
import styles from './Daily.module.css';

const swapValues = (values: number[], a: number, b: number) =>
  values.map((value, index) => (index === a ? values[b] : index === b ? values[a] : value));

const messageFor = (play: PlayState, par: number) => {
  if (play.stage === 'score-failed') return 'Couldn’t score that try. Press Run to try again.';
  if (play.stage === 'running' || play.stage === 'scoring') return '';
  const score = shownScore(play);
  if (play.stage === 'ended') {
    if (score === undefined) return 'Out of tries.';
    return `${score >= par ? 'You reached the goal!' : 'Out of tries.'} Your highest score was ${score}.`;
  }
  return score !== undefined && score >= par
    ? 'Goal reached! Swap and run again to go higher.'
    : '';
};

type PlayProps = {
  puzzle: Puzzle;
  rig: Rig;
  theme: Theme;
  values: number[];
  fixed: Set<number>;
  onSwap: (a: number, b: number) => void;
};

const Play = ({ puzzle, rig, theme, values, fixed, onSwap }: PlayProps) => {
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
    evaluatePuzzle(instanceOf(puzzle), play.arrangement)
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
    if (!rig.run(values)) return;
    const runId = firstStage.session.getSnapshot().lastRun?.id ?? 0;
    dispatch({ type: 'run', arrangement: values, runId, focusSkip });
    runner.current?.scrollIntoView?.({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'nearest',
    });
  };

  const swap = (a: number, b: number) => {
    onSwap(a, b);
    draw(swapValues(values, a, b));
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
          />
          <div className={styles.tilesZone}>
            <PuzzleArray values={values} fixed={fixed} frozen={busy || ended} onSwap={swap} />
          </div>
          <div ref={runner} className={styles.runner}>
            <PuzzleStages rig={rig} stageTheme={stageTheme} />
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
            disabled={busy || ended}
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
          {messageFor(play, puzzle.par)}
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

const PuzzleView = ({ puzzle, theme }: { puzzle: Puzzle; theme: Theme }) => {
  const [values, setValues] = useState(puzzle.values);
  const [fixed] = useState(() => new Set(puzzle.fixed));
  const [plan] = useState(() => stagePlanFor(puzzle));

  return (
    <>
      <PuzzleIntro puzzle={puzzle} />
      <PuzzleRig plan={plan} theme={theme} values={values}>
        {(rig) => (
          <Play
            puzzle={puzzle}
            rig={rig}
            theme={theme}
            values={values}
            fixed={fixed}
            onSwap={(a, b) => setValues((current) => swapValues(current, a, b))}
          />
        )}
      </PuzzleRig>
    </>
  );
};

const Daily = () => {
  const theme = useTheme();
  const state = usePuzzle();

  return (
    <div className={`${landing.page} ${styles.page}`} data-theme={theme}>
      <title>Daily puzzle | structs.sh</title>
      <header className={`${hero.header} ${styles.header}`}>
        <Link to="/" className={`${hero.brand} ${styles.brand}`} aria-label="structs.sh home">
          <img src={logo} alt="" width={36} height={36} />
          <span>structs.sh</span>
        </Link>
        <ThemeToggle className={hero.themeToggle} />
      </header>
      <main className={styles.main}>
        {state.status === 'loading' && <p>Loading today’s puzzle…</p>}
        {state.status === 'error' && (
          <p role="alert">Couldn’t load today’s puzzle. Reload the page to try again.</p>
        )}
        {state.status === 'ready' && <PuzzleView puzzle={state.puzzle} theme={theme} />}
      </main>
    </div>
  );
};

export default Daily;
