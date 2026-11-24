import '@fontsource-variable/fredoka';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '@/assets/img/structs.png';
import hero from '@/landing/HeroSection.module.css';
import landing from '@/landing/Landing.module.css';
import type { ListOperation } from '@/Services/challenges/challenges';
import { Theme, ThemeToggle, useTheme } from '@/ui/theme';
import { OperationBuilder } from './OperationBuilder';
import { Play } from './Play';
import ChallengeArray from './ChallengeArray';
import { ChallengeIntro } from './ChallengeIntro';
import { ChallengeRig } from './ChallengeStages';
import {
  HISTORY_STORAGE_KEY,
  isIsoDate,
  loadHistory,
  type PersistOutcome,
  persistChallengeTriesLocked,
  sameTries,
  SavedTry,
  savedTriesForChallenge,
  streakForChallenge,
} from './history';
import { IndexDriftChallenge, Challenge, useChallenge } from './challenge';
import { stagePlanFor } from './templates';
import styles from './Daily.module.css';

type ArrayChallenge = Exclude<Challenge, IndexDriftChallenge>;

/** What `Play` needs to resume today's tries and save new ones. */
type Progress = {
  initialTries: SavedTry[];
  storageRevision: number;
  streak?: number;
  onRecordTries: (tries: SavedTry[]) => Promise<PersistOutcome>;
};

type ViewProps<P> = { challenge: P; theme: Theme; progress: Progress };

const lastInput = (progress: Progress) => progress.initialTries.at(-1)?.input;

/** The last arrangement tried today, or the challenge's own when none fits. */
const restoredValues = (challenge: ArrayChallenge, progress: Progress) => {
  const input = lastInput(progress);
  return input?.kind === 'arrangement' && input.arrangement.length === challenge.values.length
    ? [...input.arrangement]
    : challenge.values;
};

const swapValues = (values: number[], a: number, b: number) =>
  values.map((value, index) => (index === a ? values[b] : index === b ? values[a] : value));

const ArrayChallengeView = ({ challenge, theme, progress }: ViewProps<ArrayChallenge>) => {
  const [values, setValues] = useState(() => restoredValues(challenge, progress));
  const [fixed] = useState(() => new Set(challenge.fixed));
  const [plan] = useState(() => stagePlanFor(challenge));

  return (
    <ChallengeRig plan={plan} theme={theme} values={values}>
      {(rig) => (
        <Play
          challenge={challenge}
          rig={rig}
          theme={theme}
          {...progress}
          input={{ kind: 'arrangement', arrangement: values }}
          onRestoreInput={(restored) => {
            if (
              restored.kind === 'arrangement' &&
              restored.arrangement.length === challenge.values.length
            ) {
              setValues([...restored.arrangement]);
            }
          }}
          editor={(frozen, redraw) => (
            <ChallengeArray
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
    </ChallengeRig>
  );
};

const IndexDriftView = ({ challenge, theme, progress }: ViewProps<IndexDriftChallenge>) => {
  const [operations, setOperations] = useState<ListOperation[]>(() => {
    const input = lastInput(progress);
    return input?.kind === 'operations' ? [...input.operations] : [];
  });
  const [plan] = useState(() => stagePlanFor(challenge));

  return (
    <ChallengeRig plan={plan} theme={theme} values={challenge.start}>
      {(rig) => (
        <Play
          challenge={challenge}
          rig={rig}
          theme={theme}
          {...progress}
          input={{ kind: 'operations', operations }}
          onRestoreInput={(restored) => {
            if (restored.kind === 'operations') setOperations([...restored.operations]);
          }}
          editor={(frozen, redraw) => (
            <OperationBuilder
              start={challenge.start}
              target={challenge.target}
              operations={operations}
              frozen={frozen}
              onChange={(next) => {
                setOperations(next);
                redraw(challenge.start);
              }}
            />
          )}
        />
      )}
    </ChallengeRig>
  );
};

const ChallengeView = ({ challenge, theme }: { challenge: Challenge; theme: Theme }) => {
  const [history, setHistory] = useState(() => loadHistory());
  const [storageRevision, setStorageRevision] = useState(0);
  const persistedTries = useRef(savedTriesForChallenge(history, challenge));
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === HISTORY_STORAGE_KEY) {
        const nextHistory = loadHistory();
        setHistory(nextHistory);
        const nextTries = savedTriesForChallenge(nextHistory, challenge);
        if (!sameTries(nextTries, persistedTries.current)) {
          persistedTries.current = nextTries;
          setStorageRevision((revision) => revision + 1);
        }
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [challenge]);
  const dated = isIsoDate(challenge.date);
  const initialTries = savedTriesForChallenge(history, challenge);
  const streak = dated ? streakForChallenge(history, challenge) : undefined;
  const progress: Progress = {
    initialTries,
    storageRevision,
    streak,
    onRecordTries: async (tries) => {
      const outcome = await persistChallengeTriesLocked(challenge, tries);
      persistedTries.current = savedTriesForChallenge(outcome.history, challenge);
      setHistory(outcome.history);
      return outcome;
    },
  };

  return (
    <>
      <ChallengeIntro challenge={challenge} streak={streak} />
      {challenge.template === 'linked-list-index-drift' ? (
        <IndexDriftView challenge={challenge} theme={theme} progress={progress} />
      ) : (
        <ArrayChallengeView challenge={challenge} theme={theme} progress={progress} />
      )}
    </>
  );
};

const NOTICES = {
  unreachable: 'Can’t reach the challenge server right now. Check your connection and try again.',
  unavailable: 'Today’s challenge isn’t ready yet. Check back soon.',
  error: 'Couldn’t load today’s challenge. Try again in a moment.',
} as const;

/** Why the challenge didn't load, with a button that asks the server again. */
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
  const { state, retry } = useChallenge();

  return (
    <div className={`${landing.page} ${styles.page}`} data-theme={theme}>
      <title>Daily challenge | structs.sh</title>
      <header className={`${hero.header} ${styles.header}`}>
        <Link to="/" className={`${hero.brand} ${styles.brand}`} aria-label="structs.sh home">
          <img src={logo} alt="" width={36} height={36} />
          <span>structs.sh</span>
        </Link>
        <nav aria-label="Main" className={hero.nav}>
          <Link to="/visualiser/linked-lists">Visualiser</Link>
          <Link to="/debugger">Debugger</Link>
          <ThemeToggle className={hero.themeToggle} />
        </nav>
      </header>
      <main className={styles.main}>
        {state.status === 'loading' && <p>Loading today’s challenge…</p>}
        {(state.status === 'unreachable' ||
          state.status === 'unavailable' ||
          state.status === 'error') && <Notice text={NOTICES[state.status]} retry={retry} />}
        {state.status === 'ready' && <ChallengeView challenge={state.challenge} theme={theme} />}
      </main>
    </div>
  );
};

export default Daily;
