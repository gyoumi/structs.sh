import '@fontsource-variable/fredoka';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '@/assets/img/structs.png';
import hero from '@/landing/HeroSection.module.css';
import landing from '@/landing/Landing.module.css';
import type { ListOperation } from '@/Services/puzzles/puzzles';
import { Theme, ThemeToggle, useTheme } from '@/ui/theme';
import { OperationBuilder } from './OperationBuilder';
import { Play } from './Play';
import PuzzleArray from './PuzzleArray';
import { PuzzleIntro } from './PuzzleIntro';
import { PuzzleRig } from './PuzzleStages';
import {
  HISTORY_STORAGE_KEY,
  isIsoDate,
  loadHistory,
  type PersistOutcome,
  persistPuzzleTriesLocked,
  sameTries,
  SavedTry,
  savedTriesForPuzzle,
  streakForPuzzle,
} from './history';
import { IndexDriftPuzzle, Puzzle, usePuzzle } from './puzzle';
import { stagePlanFor } from './templates';
import styles from './Daily.module.css';

type ArrayPuzzle = Exclude<Puzzle, IndexDriftPuzzle>;

/** What `Play` needs to resume today's tries and save new ones. */
type Progress = {
  initialTries: SavedTry[];
  storageRevision: number;
  streak?: number;
  onRecordTries: (tries: SavedTry[]) => Promise<PersistOutcome>;
};

type ViewProps<P> = { puzzle: P; theme: Theme; progress: Progress };

const lastInput = (progress: Progress) => progress.initialTries.at(-1)?.input;

/** The last arrangement tried today, or the puzzle's own when none fits. */
const restoredValues = (puzzle: ArrayPuzzle, progress: Progress) => {
  const input = lastInput(progress);
  return input?.kind === 'arrangement' && input.arrangement.length === puzzle.values.length
    ? [...input.arrangement]
    : puzzle.values;
};

const swapValues = (values: number[], a: number, b: number) =>
  values.map((value, index) => (index === a ? values[b] : index === b ? values[a] : value));

const ArrayPuzzleView = ({ puzzle, theme, progress }: ViewProps<ArrayPuzzle>) => {
  const [values, setValues] = useState(() => restoredValues(puzzle, progress));
  const [fixed] = useState(() => new Set(puzzle.fixed));
  const [plan] = useState(() => stagePlanFor(puzzle));

  return (
    <PuzzleRig plan={plan} theme={theme} values={values}>
      {(rig) => (
        <Play
          puzzle={puzzle}
          rig={rig}
          theme={theme}
          {...progress}
          input={{ kind: 'arrangement', arrangement: values }}
          editor={(frozen, redraw) => (
            <PuzzleArray
              values={values}
              fixed={fixed}
              frozen={frozen}
              onSwap={(a, b) => {
                setValues((current) => swapValues(current, a, b));
                redraw(swapValues(values, a, b));
              }}
            />
          )}
        />
      )}
    </PuzzleRig>
  );
};

const IndexDriftView = ({ puzzle, theme, progress }: ViewProps<IndexDriftPuzzle>) => {
  const [operations, setOperations] = useState<ListOperation[]>(() => {
    const input = lastInput(progress);
    return input?.kind === 'operations' ? [...input.operations] : [];
  });
  const [plan] = useState(() => stagePlanFor(puzzle));

  return (
    <PuzzleRig plan={plan} theme={theme} values={puzzle.start}>
      {(rig) => (
        <Play
          puzzle={puzzle}
          rig={rig}
          theme={theme}
          {...progress}
          input={{ kind: 'operations', operations }}
          editor={(frozen, redraw) => (
            <OperationBuilder
              start={puzzle.start}
              target={puzzle.target}
              operations={operations}
              frozen={frozen}
              onChange={(next) => {
                setOperations(next);
                redraw(puzzle.start);
              }}
            />
          )}
        />
      )}
    </PuzzleRig>
  );
};

const PuzzleView = ({ puzzle, theme }: { puzzle: Puzzle; theme: Theme }) => {
  const [history, setHistory] = useState(() => loadHistory());
  const [storageRevision, setStorageRevision] = useState(0);
  const persistedTries = useRef(savedTriesForPuzzle(history, puzzle));
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === HISTORY_STORAGE_KEY) {
        const nextHistory = loadHistory();
        setHistory(nextHistory);
        const nextTries = savedTriesForPuzzle(nextHistory, puzzle);
        if (!sameTries(nextTries, persistedTries.current)) {
          persistedTries.current = nextTries;
          setStorageRevision((revision) => revision + 1);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [puzzle]);
  const dated = isIsoDate(puzzle.date);
  const initialTries = savedTriesForPuzzle(history, puzzle);
  const streak = dated ? streakForPuzzle(history, puzzle) : undefined;
  const progress: Progress = {
    initialTries,
    storageRevision,
    streak,
    onRecordTries: async (tries) => {
      const outcome = await persistPuzzleTriesLocked(puzzle, tries);
      persistedTries.current = savedTriesForPuzzle(outcome.history, puzzle);
      setHistory(outcome.history);
      return outcome;
    },
  };

  return (
    <>
      <PuzzleIntro puzzle={puzzle} streak={streak} />
      {puzzle.template === 'linked-list-index-drift' ? (
        <IndexDriftView puzzle={puzzle} theme={theme} progress={progress} />
      ) : (
        <ArrayPuzzleView puzzle={puzzle} theme={theme} progress={progress} />
      )}
    </>
  );
};

const NOTICES = {
  unreachable: 'Can’t reach the puzzle server right now. Check your connection and try again.',
  unavailable: 'Today’s puzzle isn’t ready yet. Check back soon.',
  error: 'Couldn’t load today’s puzzle. Try again in a moment.',
} as const;

/** Why the puzzle didn't load, with a button that asks the server again. */
const Notice = ({ text, retry }: { text: string; retry: () => void }) => (
  <div className={styles.notice}>
    <p role="alert">{text}</p>
    <button type="button" className={`${landing.secondary} ${styles.action}`} onClick={retry}>
      Try again
    </button>
  </div>
);

const Daily = () => {
  const theme = useTheme();
  const { state, retry } = usePuzzle();

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
        {(state.status === 'unreachable' ||
          state.status === 'unavailable' ||
          state.status === 'error') && <Notice text={NOTICES[state.status]} retry={retry} />}
        {state.status === 'ready' && <PuzzleView puzzle={state.puzzle} theme={theme} />}
      </main>
    </div>
  );
};

export default Daily;
