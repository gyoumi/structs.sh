import { useState } from 'react';
import { Link } from 'react-router-dom';
import logo from '@/assets/img/structs.png';
import hero from '@/landing/HeroSection.module.css';
import landing from '@/landing/Landing.module.css';
import { ThemeToggle, useTheme } from '@/ui/theme';
import PuzzleArray from './PuzzleArray';
import { Puzzle, puzzleTitle, usePuzzle } from './puzzle';
import styles from './Daily.module.css';

const RULES = 'Reorder the numbers so quicksort makes as many comparisons as you can.';

const swapValues = (values: number[], a: number, b: number) =>
  values.map((value, index) => (index === a ? values[b] : index === b ? values[a] : value));

const PuzzleView = ({ puzzle }: { puzzle: Puzzle }) => {
  const [values, setValues] = useState(puzzle.values);
  const [fixed] = useState(() => new Set(puzzle.fixed));

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
          Tap or click two unlocked numbers to swap them. Locked numbers stay put. Reach the goal,
          or go even higher.
        </p>
        <p className={styles.keys}>
          Keyboard: press Enter or Space to pick a number. Use Left or Right to swap it with the
          next unlocked one, or Tab to another and press Enter or Space to swap. Escape clears the
          selection.
        </p>
      </section>
      <section className={styles.play}>
        <p className={`${styles.column} ${styles.goal}`}>
          <span id="daily-goal-label">Goal</span>
          <output aria-labelledby="daily-goal-label" className={styles.goalValue}>
            {puzzle.par}
          </output>
        </p>
        <PuzzleArray
          values={values}
          fixed={fixed}
          onSwap={(a, b) => setValues((current) => swapValues(current, a, b))}
        />
      </section>
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
        {state.status === 'ready' && <PuzzleView puzzle={state.puzzle} />}
      </main>
    </div>
  );
};

export default Daily;
