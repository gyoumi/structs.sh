import { Theme } from '@/ui/theme';
import { canvasThemes } from '@/visualiser/canvasThemes';
import type { StepComparison, StepTrace } from '@/visualiser/session';
import { Puzzle, puzzleTitle } from './puzzle';
import styles from './Daily.module.css';
import cards from './DailyCards.module.css';

export const MAX_TRIES = 3;

/** The eyebrow, title and rules above the game. */
export const PuzzleIntro = ({ puzzle }: { puzzle: Puzzle }) => (
  <>
    <div className={styles.eyebrow}>
      {`Daily #${puzzle.number}${puzzle.date ? ` · ${puzzle.date}` : ''} · ${puzzleTitle(
        puzzle.template
      )}`}
    </div>
    <h1 className={styles.title}>Make quicksort sweat</h1>
    <section aria-label="Puzzle rules" className={styles.rules}>
      <p className={styles.lede}>Swap the numbers to make as many comparisons as possible.</p>
      <p>Leftmost number is always the pivot.</p>
      <details className={styles.keys}>
        <summary>Keyboard controls</summary>
        <p>
          Press Enter or Space to pick a number. Use Left or Right to swap it with the next unlocked
          one, or Tab to another and press Enter or Space to swap. Escape clears the selection.
        </p>
      </details>
    </section>
  </>
);

const opSymbol = (op: StepComparison['op']) => {
  if (op === '<=') return '≤';
  if (op === '>=') return '≥';
  return op;
};

/** "3 < 2" with an inline ✓ or ✗, drawn in the tone of the bar being compared. */
export const ComparisonText = ({ comparison }: { comparison: StepComparison }) => (
  <>
    <span>
      {comparison.left} {opSymbol(comparison.op)} {comparison.right}
    </span>
    <span aria-hidden="true" className={comparison.result ? cards.resultYes : cards.resultNo}>
      {comparison.result ? '✓' : '✗'}
    </span>
  </>
);

const Swatch = ({ colour }: { colour?: string }) => (
  <span aria-hidden="true" className={cards.swatch} style={{ background: colour }} />
);

type MobileHudProps = {
  comparisons: number;
  par: number;
  comparison: StepComparison | undefined;
  triesLeft: number;
  stageTheme: Theme;
};

/** A phone-only strip above the array. It repeats the cards for sight only, so it is hidden from assistive tech. */
export const MobileHud = ({
  comparisons,
  par,
  comparison,
  triesLeft,
  stageTheme,
}: MobileHudProps) => (
  <div className={cards.mobileHud} aria-hidden="true">
    <span className={cards.hudScore}>
      <span className={cards.hudNum}>{comparisons}</span>
      <span className={cards.hudGoal}>/ {par}</span>
    </span>
    <span className={cards.hudRight}>
      {comparison && (
        <span className={cards.hudChip}>
          <Swatch colour={canvasThemes[stageTheme][comparison.tone]} />
          <ComparisonText comparison={comparison} />
        </span>
      )}
      <span>{triesLeft} left</span>
    </span>
  </div>
);

type ScoreCardProps = {
  puzzle: Puzzle;
  comparisons: number;
  scores: number[];
  running: boolean;
  ended: boolean;
  goalReached: boolean;
  score: number | undefined;
  highest: number;
};

export const ScoreCard = ({
  puzzle,
  comparisons,
  scores,
  running,
  ended,
  goalReached,
  score,
  highest,
}: ScoreCardProps) => {
  const triesLeft = ended ? 0 : MAX_TRIES - scores.length;

  const chip = (index: number) => {
    if (index < scores.length) {
      const tried = scores[index];
      return (
        <li key={index} className={cards.tryChip}>
          {tried}
          {tried >= puzzle.par && ' ⭐'}
        </li>
      );
    }
    if (running && index === scores.length) {
      return (
        <li key={index} className={`${cards.tryChip} ${cards.tryLive}`}>
          {comparisons}
        </li>
      );
    }
    return (
      <li key={index} className={`${cards.tryChip} ${cards.tryEmpty}`}>
        –
      </li>
    );
  };

  return (
    <div className={cards.card}>
      <div className={cards.cardHead}>
        <h2 className={cards.cardTitle}>
          <span id="daily-comparisons-label">Comparisons</span>
        </h2>
        {goalReached && (
          <output aria-label="Goal reached" className={cards.badge}>
            Goal reached ⭐
          </output>
        )}
      </div>
      <div className={cards.bigScore}>
        <output aria-labelledby="daily-comparisons-label" aria-live="off" className={cards.bigNum}>
          {comparisons}
        </output>
        <span className={cards.goalSlash}>
          / goal{' '}
          <output aria-label="Goal" className={cards.goalVal}>
            {puzzle.par}
          </output>
        </span>
      </div>
      <ol aria-label="Tries" className={cards.tries}>
        {Array.from({ length: MAX_TRIES }, (_, index) => chip(index))}
      </ol>
      <div className={cards.meta}>
        <span>
          <span id="daily-tries-label">Tries left</span>{' '}
          <output aria-labelledby="daily-tries-label" className={cards.metaVal}>
            {triesLeft}
          </output>
        </span>
        {score !== undefined && !ended && (
          <span>
            <span id="daily-score-label">Score</span>{' '}
            <output aria-labelledby="daily-score-label" className={cards.metaVal}>
              {score}
            </output>
          </span>
        )}
        {ended && score !== undefined && (
          <span>
            Highest{' '}
            <output aria-label="Score" className={cards.metaVal}>
              {highest}
            </output>
          </span>
        )}
      </div>
    </div>
  );
};

type StepCardProps = { trace: StepTrace | null; stageTheme: Theme };

export const StepCard = ({ trace, stageTheme }: StepCardProps) => {
  const colours = canvasThemes[stageTheme];
  const comparison = trace?.comparison;
  return (
    <div className={`${cards.card} ${cards.stepCard}`}>
      <h2 className={cards.cardTitle}>Step</h2>
      <div className={cards.traceRow}>
        <span className={cards.traceKey}>Pivot</span>
        <span className={cards.traceVal}>
          <Swatch colour={colours.compare} />
          {trace ? trace.pivot : '–'}
        </span>
      </div>
      <div className={cards.compareChip}>
        {comparison ? (
          <output
            aria-live="off"
            aria-label={`${comparison.left} ${comparison.op} ${comparison.right}, ${
              comparison.result ? 'true' : 'false'
            }`}
            className={cards.compareExpr}
          >
            <Swatch colour={colours[comparison.tone]} />
            <ComparisonText comparison={comparison} />
          </output>
        ) : (
          <span className={cards.idle}>–</span>
        )}
      </div>
    </div>
  );
};
