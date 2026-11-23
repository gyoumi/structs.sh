import { Theme } from '@/ui/theme';
import { canvasThemes } from '@/visualiser/canvasThemes';
import type { StepComparison, StepTrace } from '@/visualiser/session';
import cards from './DailyCards.module.css';

const opSymbol = (op: StepComparison['op']) => {
  if (op === '<=') return '≤';
  if (op === '>=') return '≥';
  return op;
};

const ComparisonText = ({ comparison }: { comparison: StepComparison }) => (
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
  value: number;
  par: number;
  comparison: StepComparison | undefined;
  triesLeft: number;
  stageTheme: Theme;
};

/** A phone-only strip above the array. It repeats the cards for sight only, so it is hidden from assistive tech. */
export const MobileHud = ({ value, par, comparison, triesLeft, stageTheme }: MobileHudProps) => (
  <div className={cards.mobileHud} aria-hidden="true">
    <span className={cards.hudScore}>
      <span className={cards.hudNum}>{value}</span>
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
