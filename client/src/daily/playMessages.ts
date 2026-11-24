import type { MobileOutcome } from './DailyCards';
import { latestMiss, PlayState, reachesGoal, shownScore } from './playMachine';
import type { Challenge } from './challenge';

/** Whether the phone HUD marks the goal reached, the latest try missed, or neither. */
export const mobileOutcomeOf = (
  play: PlayState,
  challenge: Challenge,
  busy: boolean
): MobileOutcome => {
  const score = shownScore(play, challenge.template);
  if (score !== undefined && reachesGoal(challenge, score)) return 'goal';
  if (!busy && latestMiss(play) !== undefined) return 'missed';
  return 'none';
};

/** The line under the actions: how the game ended, or a nudge once the goal is reached. */
export const messageFor = (play: PlayState, challenge: Challenge) => {
  if (play.stage === 'score-failed') return 'Couldn’t score that try. Press Run to try again.';
  if (play.stage === 'synced') return 'Updated from another tab.';
  if (play.stage === 'running' || play.stage === 'scoring') return '';
  const lowerWins = challenge.template === 'linked-list-index-drift';
  const score = shownScore(play, challenge.template);
  const reached = score !== undefined && reachesGoal(challenge, score);
  if (play.stage === 'ended') {
    if (score === undefined) return 'Out of tries.';
    const best = lowerWins ? 'lowest' : 'highest';
    return `${reached ? 'You reached the goal!' : 'Out of tries.'} Your ${best} score was ${score}.`;
  }
  if (!reached) return '';
  return lowerWins
    ? 'Goal reached! Try a shorter sequence to go lower.'
    : 'Goal reached! Swap and run again to go higher.';
};
