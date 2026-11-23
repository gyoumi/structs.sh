import '@fontsource-variable/fredoka';
import { useEffect, useReducer, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '@/assets/img/structs.png';
import hero from '@/landing/HeroSection.module.css';
import landing from '@/landing/Landing.module.css';
import { loadPuzzles, scorePuzzle } from '@/Services/puzzles/puzzles';
import { Theme, ThemeToggle, useTheme } from '@/ui/theme';
import Stage from '@/visualiser/Stage';
import Transport from '@/visualiser/Transport';
import { canvasThemes } from '@/visualiser/canvasThemes';
import { findTopic } from '@/visualiser/topics';
import {
  SessionContext,
  useCreateSession,
  usePrefersReducedMotion,
  useSession,
  useSnapshot,
} from '@/visualiser/useVisualiser';
import { MobileHud, PuzzleIntro, ScoreCard, StepCard } from './DailyCards';
import { initialPlayState, MAX_TRIES, playReducer } from './playMachine';
import PuzzleArray from './PuzzleArray';
import { Puzzle, shareText, usePuzzle } from './puzzle';
import styles from './Daily.module.css';

const sorting = findTopic('sorting-algorithms');
if (!sorting) throw new Error('The sorting topic is missing.');

const DEFAULT_PLAYBACK_SPEED = 2;

const swapValues = (values: number[], a: number, b: number) =>
  values.map((value, index) => (index === a ? values[b] : index === b ? values[a] : value));

type PlayProps = {
  puzzle: Puzzle;
  theme: Theme;
  values: number[];
  fixed: Set<number>;
  onSwap: (a: number, b: number) => void;
};

const Play = ({ puzzle, theme, values, fixed, onSwap }: PlayProps) => {
  const session = useSession();
  const completedRunId = useSnapshot((s) =>
    s.playback === 'complete' ? (s.lastRun?.id ?? null) : null
  );
  const hasTimeline = useSnapshot((s) => s.duration > 0);
  const comparisons = useSnapshot((s) => s.comparisons ?? 0);
  const trace = useSnapshot((s) => s.trace);
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

  useEffect(() => {
    if (stageTheme === theme || busy || hasTimeline) return;
    setStageTheme(theme);
    session.retheme(canvasThemes[theme]);
  }, [stageTheme, theme, busy, hasTimeline, session]);

  const draw = (arrangementValues: number[]) => {
    setStageTheme(theme);
    session.loadData(arrangementValues, canvasThemes[theme], true);
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
    scorePuzzle(puzzle, play.arrangement)
      .then((score) => {
        if (!cancelled) dispatch({ type: 'scored', score });
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) dispatch({ type: 'score-failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [play, puzzle]);

  const ended = play.stage === 'ended';
  const triesLeft = ended ? 0 : MAX_TRIES - play.scores.length;
  const highest = Math.max(0, ...play.scores);
  const score = ended ? highest : play.scores.at(-1);
  const goalReached = score !== undefined && score >= puzzle.par;

  const run = () => {
    const focusSkip = document.activeElement === runButton.current;
    draw(values);
    const error = session.run('quick', []);
    if (error) return;
    const runId = session.getSnapshot().lastRun?.id ?? 0;
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
      .writeText(shareText(puzzle, play.scores))
      .then(() => dispatch({ type: 'share-copied' }))
      .catch(() => dispatch({ type: 'share-failed' }));
  };

  let message = '';
  if (busy) message = '';
  else if (play.stage === 'score-failed') {
    message = 'Couldn’t score that try. Press Run to try again.';
  } else if (ended) {
    message = `${highest >= puzzle.par ? 'You reached the goal!' : 'Out of tries.'} Your highest score was ${highest}.`;
  } else if (goalReached) message = 'Goal reached! Swap and run again to go higher.';

  return (
    <div className={styles.workspace}>
      <div className={styles.playColumn}>
        <div className={styles.panel}>
          <MobileHud
            comparisons={comparisons}
            par={puzzle.par}
            comparison={trace?.comparison}
            triesLeft={triesLeft}
            stageTheme={stageTheme}
          />
          <div className={styles.tilesZone}>
            <PuzzleArray values={values} fixed={fixed} frozen={busy || ended} onSwap={swap} />
          </div>
          <div ref={runner} className={styles.runner}>
            <Stage
              label="Quicksort drawing"
              className={`${styles.stage} ${stageTheme === 'dark' ? styles.stageDark : styles.stageLight}`}
            />
            <Transport />
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
            onClick={session.finish}
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
          {message}
        </span>
      </div>
      <aside className={styles.sidebar}>
        <ScoreCard puzzle={puzzle} comparisons={comparisons} play={play} />
        <StepCard trace={trace} stageTheme={stageTheme} />
      </aside>
    </div>
  );
};

const PuzzleView = ({ puzzle, theme }: { puzzle: Puzzle; theme: Theme }) => {
  const [values, setValues] = useState(puzzle.values);
  const [fixed] = useState(() => new Set(puzzle.fixed));
  const [initialSessionArgs] = useState(() => ({
    theme: canvasThemes[theme],
    values: puzzle.values,
  }));
  const session = useCreateSession(
    sorting,
    initialSessionArgs.theme,
    initialSessionArgs.values,
    undefined,
    true
  );

  useEffect(() => session.setSpeed(DEFAULT_PLAYBACK_SPEED), [session]);

  return (
    <>
      <PuzzleIntro puzzle={puzzle} />
      <SessionContext value={session}>
        <Play
          puzzle={puzzle}
          theme={theme}
          values={values}
          fixed={fixed}
          onSwap={(a, b) => setValues((current) => swapValues(current, a, b))}
        />
      </SessionContext>
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
