import '@fontsource-variable/fredoka';
import { useState } from 'react';
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
import { IndexDriftPuzzle, Puzzle, usePuzzle } from './puzzle';
import { stagePlanFor } from './templates';
import styles from './Daily.module.css';

type ArrayPuzzle = Exclude<Puzzle, IndexDriftPuzzle>;

const swapValues = (values: number[], a: number, b: number) =>
  values.map((value, index) => (index === a ? values[b] : index === b ? values[a] : value));

const ArrayPuzzleView = ({ puzzle, theme }: { puzzle: ArrayPuzzle; theme: Theme }) => {
  const [values, setValues] = useState(puzzle.values);
  const [fixed] = useState(() => new Set(puzzle.fixed));
  const [plan] = useState(() => stagePlanFor(puzzle));

  return (
    <PuzzleRig plan={plan} theme={theme} values={values}>
      {(rig) => (
        <Play
          puzzle={puzzle}
          rig={rig}
          theme={theme}
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

const IndexDriftView = ({ puzzle, theme }: { puzzle: IndexDriftPuzzle; theme: Theme }) => {
  const [operations, setOperations] = useState<ListOperation[]>([]);
  const [plan] = useState(() => stagePlanFor(puzzle));

  return (
    <PuzzleRig plan={plan} theme={theme} values={puzzle.start}>
      {(rig) => (
        <Play
          puzzle={puzzle}
          rig={rig}
          theme={theme}
          input={{ kind: 'operations', operations }}
          editor={(frozen) => (
            <OperationBuilder
              start={puzzle.start}
              target={puzzle.target}
              operations={operations}
              frozen={frozen}
              onChange={setOperations}
            />
          )}
        />
      )}
    </PuzzleRig>
  );
};

const PuzzleView = ({ puzzle, theme }: { puzzle: Puzzle; theme: Theme }) => (
  <>
    <PuzzleIntro puzzle={puzzle} />
    {puzzle.template === 'linked-list-index-drift' ? (
      <IndexDriftView puzzle={puzzle} theme={theme} />
    ) : (
      <ArrayPuzzleView puzzle={puzzle} theme={theme} />
    )}
  </>
);

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
