import '@fontsource-variable/fredoka';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
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
import PuzzleArray from './PuzzleArray';
import { Puzzle, puzzleTitle, shareText, usePuzzle } from './puzzle';
import styles from './Daily.module.css';

const RULES = 'Reorder the numbers so quicksort makes as many comparisons as possible.';
const MAX_TRIES = 3;

const sorting = findTopic('sorting-algorithms');
if (!sorting) throw new Error('The sorting topic is missing.');

type Phase = 'ready' | 'running' | 'scoring';

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
  const complete = useSnapshot((s) => s.complete);
  const comparisons = useSnapshot((s) => s.comparisons ?? 0);
  const [scores, setScores] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('ready');
  const [scoreFailed, setScoreFailed] = useState(false);
  const [shared, setShared] = useState<'copied' | 'failed' | null>(null);
  const arrangement = useRef(values);
  const runner = useRef<HTMLDivElement>(null);
  const runButton = useRef<HTMLButtonElement>(null);
  const skipButton = useRef<HTMLButtonElement>(null);
  // Run disables itself when pressed, which would drop keyboard focus to the page.
  const focusSkip = useRef(false);
  const reducedMotion = usePrefersReducedMotion();
  // The theme the canvas was last drawn in. Colours are fixed when drawn, so a theme switch
  // waits for the next arrangement unless nothing has run yet. The stage background follows it
  // so the bars stay readable until they are redrawn.
  const drawnTheme = useRef(theme);
  const [stageTheme, setStageTheme] = useState(theme);

  const markDrawn = (drawn: Theme) => {
    drawnTheme.current = drawn;
    setStageTheme(drawn);
  };

  useEffect(() => {
    loadPuzzles().catch(() => {});
  }, []);

  const applyTheme = useEffectEvent(() => {
    if (drawnTheme.current === theme) return;
    if (phase !== 'ready' || session.getSnapshot().duration > 0) return;
    markDrawn(theme);
    session.retheme(canvasThemes[theme]);
  });

  useEffect(() => applyTheme(), [theme]);

  const draw = (arrangementValues: number[]) => {
    markDrawn(theme);
    session.loadData(arrangementValues, canvasThemes[theme]);
  };

  // Hand focus from Run to Skip once Skip is enabled, without fighting the scroll to the drawing.
  useEffect(() => {
    if (!focusSkip.current) return;
    focusSkip.current = false;
    if (phase === 'running') skipButton.current?.focus({ preventScroll: true });
  }, [phase]);

  // A try is over once its animation reaches the end, however it got there (playing, Skip or the slider).
  useEffect(() => {
    if (phase !== 'running' || !complete) return;
    setPhase('scoring');
    scorePuzzle(puzzle, arrangement.current)
      .then((score) => setScores((current) => [...current, score]))
      .catch((error) => {
        console.error(error);
        setScoreFailed(true);
      })
      .finally(() => setPhase('ready'));
  }, [phase, complete, puzzle]);

  const ended = scores.length >= MAX_TRIES;
  const busy = phase !== 'ready';
  const triesLeft = ended ? 0 : MAX_TRIES - scores.length;
  const highest = Math.max(0, ...scores);
  const score = ended ? highest : scores.at(-1);
  const scored = score !== undefined;
  const goalReached = scored && score >= puzzle.par;

  const run = () => {
    focusSkip.current = document.activeElement === runButton.current;
    arrangement.current = values;
    setScoreFailed(false);
    setPhase('running');
    draw(values);
    session.run('quick', []);
    // Bring the drawing and its controls into view so the player can watch the sort.
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
      setShared('failed');
      return;
    }
    clipboard
      .writeText(shareText(puzzle, scores))
      .then(() => setShared('copied'))
      .catch(() => setShared('failed'));
  };

  let message = 'Press Run to test this order.';
  if (busy) message = 'Sorting…';
  else if (scoreFailed) message = 'Couldn’t score that try. Press Run to try again.';
  else if (ended && highest >= puzzle.par) {
    message = `You reached the goal! Your highest score was ${highest}.`;
  } else if (ended) {
    message = `Out of tries. Your highest score was ${highest}.`;
  } else if (scored && score < puzzle.par) message = 'Swap numbers and run again to go higher.';
  else if (scored) {
    message = 'You reached the goal! Can you go even higher? Swap numbers and run again.';
  }

  return (
    <section className={styles.play}>
      <div className={`${styles.column} ${styles.stats}`}>
        <p className={styles.stat}>
          {scored && (
            <>
              <span id="daily-score-label">Score</span>
              <output aria-labelledby="daily-score-label" className={styles.value}>
                {score}
              </output>
              <span aria-hidden="true">/</span>
            </>
          )}
          <span aria-hidden="true">{scored ? 'goal' : 'Goal'}</span>
          <output aria-label="Goal" className={styles.value}>
            {puzzle.par}
          </output>
        </p>
        <p className={styles.stat}>
          <span id="daily-tries-label">Tries left</span>
          <output aria-labelledby="daily-tries-label" className={styles.value}>
            {triesLeft}
          </output>
        </p>
        {goalReached && (
          <output aria-label="Goal reached" className={styles.badge}>
            Goal reached ⭐
          </output>
        )}
      </div>
      <PuzzleArray
        values={values}
        fixed={fixed}
        pivotIndex={0}
        frozen={busy || ended}
        onSwap={swap}
      />
      <div className={`${styles.column} ${styles.actions}`}>
        <button
          ref={runButton}
          type="button"
          className={`${landing.primary} ${styles.action}`}
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
          disabled={phase !== 'running'}
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
            <span aria-live="polite" className={styles.shareNote}>
              {shared === 'copied' && 'Copied!'}
              {shared === 'failed' && 'Couldn’t copy — try again.'}
            </span>
          </>
        )}
      </div>
      <p className={`${styles.column} ${styles.message}`} aria-live="polite">
        {message}
      </p>
      <div ref={runner} className={styles.runner}>
        <p className={styles.stat}>
          <span id="daily-comparisons-label">Comparisons</span>
          <output
            aria-labelledby="daily-comparisons-label"
            aria-live="off"
            className={styles.value}
          >
            {comparisons}
          </output>
        </p>
        <Stage
          label="Quicksort drawing"
          className={`${styles.stage} ${stageTheme === 'dark' ? styles.stageDark : styles.stageLight}`}
        />
        <Transport />
      </div>
    </section>
  );
};

const PuzzleView = ({ puzzle, theme }: { puzzle: Puzzle; theme: Theme }) => {
  const [values, setValues] = useState(puzzle.values);
  const [fixed] = useState(() => new Set(puzzle.fixed));
  // The session is created with the first theme and values only. Play redraws on later changes,
  // so a theme switch never drops a try that is still running.
  const [initial] = useState(() => ({ theme: canvasThemes[theme], values: puzzle.values }));
  const session = useCreateSession(sorting, initial.theme, initial.values);

  // A full quicksort at 1x takes about a minute, so tries start at the fastest speed.
  useEffect(() => session.setSpeed(2), [session]);

  return (
    <>
      <h1 className={styles.title}>
        <span className={styles.brandLine}>structs.sh daily</span>{' '}
        <span className={styles.numberLine}>
          #{puzzle.number} · {puzzleTitle(puzzle.template)}
        </span>
      </h1>
      <section aria-label="Puzzle rules" className={`${styles.column} ${styles.rules}`}>
        <p className={styles.lede}>{RULES}</p>
        <p>
          Quicksort always picks the first number in each range as the pivot. Tap or click two
          unlocked numbers to swap them, then press Run. Locked numbers stay put. You have{' '}
          {MAX_TRIES} tries to reach the goal, or go higher.
        </p>
        <p className={styles.keys}>
          Keyboard: press Enter or Space to pick a number. Use Left or Right to swap it with the
          next unlocked one, or Tab to another and press Enter or Space to swap. Escape clears the
          selection.
        </p>
      </section>
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
      <header className={hero.header}>
        <Link to="/" className={hero.brand} aria-label="structs.sh home">
          <img src={logo} alt="" width={36} height={36} />
        </Link>
        <ThemeToggle className={hero.themeToggle} />
      </header>
      <main className={styles.main}>
        {state.status === 'loading' && <p className={styles.column}>Loading today’s puzzle…</p>}
        {state.status === 'error' && (
          <p role="alert" className={styles.column}>
            Couldn’t load today’s puzzle. Reload the page to try again.
          </p>
        )}
        {state.status === 'ready' && <PuzzleView puzzle={state.puzzle} theme={theme} />}
      </main>
    </div>
  );
};

export default Daily;
