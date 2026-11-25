import {
  latestMiss,
  lowerWins,
  MAX_TRIES,
  PlayState,
  reachesGoal,
  shownScore,
  TryScore,
} from './playMachine';
import type { Challenge } from './challenge';
import { Rig, useReadoutValue } from './rig';
import type { Readout, Readouts } from './templates';
import cards from './DailyCards.module.css';

const labelId = (readout: Readout) => `daily-${readout.key}-label`;

const ReadoutRow = ({ rig, readout }: { rig: Rig; readout: Readout }) => {
  const value = useReadoutValue(rig, readout.value);
  return (
    <span>
      <span id={labelId(readout)}>{readout.label}</span>{' '}
      <output aria-labelledby={labelId(readout)} aria-live="off" className={cards.metaVal}>
        {value}
      </output>
    </span>
  );
};

type TryChipProps = { tried: TryScore | undefined; challenge: Challenge; live: number | undefined };

const TryChip = ({ tried, challenge, live }: TryChipProps) => {
  if (typeof tried === 'number') {
    return (
      <li className={cards.tryChip}>
        {tried}
        {reachesGoal(challenge, tried) && ' ⭐'}
      </li>
    );
  }
  if (tried) return <li className={`${cards.tryChip} ${cards.tryMissed}`}>✗</li>;
  if (live !== undefined) {
    return <li className={`${cards.tryChip} ${cards.tryLive}`}>{live}</li>;
  }
  return <li className={`${cards.tryChip} ${cards.tryEmpty}`}>–</li>;
};

type ScoreCardProps = {
  challenge: Challenge;
  rig: Rig;
  readouts: Readouts;
  play: PlayState;
};

export const ScoreCard = ({ challenge, rig, readouts, play }: ScoreCardProps) => {
  const { primary, others } = readouts;
  const primaryValue = useReadoutValue(rig, primary.value);
  const { scores } = play;
  const ended = play.stage === 'ended';
  const running = play.stage === 'running' || play.stage === 'scoring';
  const triesLeft = ended ? 0 : MAX_TRIES - scores.length;
  const score = shownScore(play, challenge.template);
  const goalReached = score !== undefined && reachesGoal(challenge, score);
  const bestLabel = lowerWins(challenge.template) ? 'Lowest' : 'Highest';
  const miss = running ? undefined : latestMiss(play);

  return (
    <div className={cards.card}>
      <div className={cards.cardHead}>
        <h2 className={cards.cardTitle}>
          <span id={labelId(primary)}>{primary.label}</span>
        </h2>
        {goalReached && (
          <output aria-label="Goal reached" className={cards.badge}>
            Goal reached ⭐
          </output>
        )}
      </div>
      <div className={cards.bigScore}>
        <output aria-labelledby={labelId(primary)} aria-live="off" className={cards.bigNum}>
          {primaryValue}
        </output>
        <span className={cards.goalSlash}>
          / goal{' '}
          <output aria-label="Goal" className={cards.goalVal}>
            {challenge.goal}
          </output>
        </span>
      </div>
      {others.length > 0 && (
        <div className={cards.readouts}>
          {others.map((readout) => (
            <ReadoutRow key={readout.key} rig={rig} readout={readout} />
          ))}
        </div>
      )}
      <ol aria-label="Tries" className={cards.tries}>
        {Array.from({ length: MAX_TRIES }, (_, index) => (
          <TryChip
            key={index}
            tried={scores[index]}
            challenge={challenge}
            live={running && index === scores.length ? primaryValue : undefined}
          />
        ))}
      </ol>
      {miss && (
        <output aria-label="Try result" className={cards.miss}>
          {miss}
        </output>
      )}
      <div className={cards.meta}>
        <span>
          <span id="daily-tries-label">Tries left</span>{' '}
          <output aria-labelledby="daily-tries-label" className={cards.metaVal}>
            {triesLeft}
          </output>
        </span>
        {score !== undefined && (
          <span>
            {ended ? bestLabel : <span id="daily-score-label">Score</span>}{' '}
            <output
              aria-label={ended ? 'Score' : undefined}
              aria-labelledby={ended ? undefined : 'daily-score-label'}
              className={cards.metaVal}
            >
              {score}
            </output>
          </span>
        )}
      </div>
    </div>
  );
};
