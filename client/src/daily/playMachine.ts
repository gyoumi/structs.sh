import type { ListOperation } from '@/Services/challenges/challenges';
import type { Template } from './challenge';

export const MAX_TRIES = 3;

/** Whether a lower score is better, as in index drift, where the score is a cost. */
export const lowerWins = (template?: Template) => template === 'linked-list-index-drift';

/** The best of `solved`: the lowest when lower wins, the highest otherwise. Undefined when empty. */
export const bestScore = (solved: number[], template?: Template): number | undefined => {
  if (solved.length === 0) return undefined;
  return lowerWins(template) ? Math.min(...solved) : Math.max(...solved);
};

/** Whether `score` reaches the goal: at or below goal when lower wins, at or above it otherwise. */
export const reachesGoal = (
  challenge: { template: Template; goal: number },
  score: number
): boolean => (lowerWins(challenge.template) ? score <= challenge.goal : score >= challenge.goal);

type ShareStatus = 'idle' | 'copied' | 'failed';

/** A try that ran but missed the challenge's condition, with why, as shown to the player. */
type UnsolvedTry = { kind: 'unsolved'; reason: string };

/** A solved try's score, or an unsolved try. */
export type TryScore = number | UnsolvedTry;

/** What a try runs: a slot arrangement or an operation sequence. */
export type PlayInput =
  | { kind: 'arrangement'; arrangement: number[] }
  | { kind: 'operations'; operations: ListOperation[] };

export type PlayState =
  | { stage: 'ready'; scores: TryScore[] }
  | {
      stage: 'running';
      scores: TryScore[];
      input: PlayInput;
      runId: number;
      focusSkip: boolean;
    }
  | { stage: 'scoring'; scores: TryScore[]; input: PlayInput }
  | { stage: 'score-failed'; scores: TryScore[] }
  | { stage: 'synced'; scores: TryScore[] }
  | { stage: 'ended'; scores: TryScore[]; share: ShareStatus };

export type PlayEvent =
  | {
      type: 'run';
      input: PlayInput;
      runId: number;
      focusSkip: boolean;
    }
  /** Another tab's run, played here too; `scores` are the tries before it. */
  | { type: 'follow'; input: PlayInput; runId: number; scores: TryScore[] }
  | { type: 'animation-completed'; runId: number }
  /** The running try was started again under a new id, as when a theme switch redraws it. */
  | { type: 'rerun'; runId: number }
  | { type: 'scored'; score: TryScore }
  | { type: 'synced'; scores: TryScore[] }
  | { type: 'score-failed' }
  | { type: 'share-copied' }
  | { type: 'share-failed' };

export const initialPlayState: PlayState = { stage: 'ready', scores: [] };

/** `scores`, capped at the tries allowed: ended once every try is used, `open` otherwise. */
const endedOr = (open: 'ready' | 'synced', scores: TryScore[]): PlayState => {
  const capped = scores.slice(0, MAX_TRIES);
  return capped.length >= MAX_TRIES
    ? { stage: 'ended', scores: capped, share: 'idle' }
    : { stage: open, scores: capped };
};

/** The state to resume at after a reload: ended once every try is used, ready otherwise. */
export const restoredPlayState = (scores: TryScore[]): PlayState => endedOr('ready', scores);

export const playReducer = (state: PlayState, event: PlayEvent): PlayState => {
  switch (event.type) {
    case 'run': {
      if (state.stage !== 'ready' && state.stage !== 'score-failed' && state.stage !== 'synced') {
        return state;
      }
      return {
        stage: 'running',
        scores: state.scores,
        input: event.input,
        runId: event.runId,
        focusSkip: event.focusSkip,
      };
    }
    case 'follow':
      if (state.stage === 'running' || state.stage === 'scoring') return state;
      return {
        stage: 'running',
        scores: event.scores.slice(0, MAX_TRIES),
        input: event.input,
        runId: event.runId,
        focusSkip: false,
      };
    case 'animation-completed':
      if (state.stage !== 'running' || state.runId !== event.runId) return state;
      return {
        stage: 'scoring',
        scores: state.scores,
        input: state.input,
      };
    case 'rerun':
      if (state.stage !== 'running') return state;
      return { ...state, runId: event.runId };
    case 'scored':
      if (state.stage !== 'scoring') return state;
      return endedOr('ready', [...state.scores, event.score]);
    case 'synced':
      return endedOr('synced', event.scores);
    case 'score-failed':
      if (state.stage !== 'scoring') return state;
      return { stage: 'score-failed', scores: state.scores };
    case 'share-copied':
      if (state.stage !== 'ended') return state;
      return { ...state, share: 'copied' };
    case 'share-failed':
      if (state.stage !== 'ended') return state;
      return { ...state, share: 'failed' };
    default:
      return state;
  }
};

const solvedScores = (scores: TryScore[]) =>
  scores.filter((score): score is number => typeof score === 'number');

/** What the score readout shows: the latest try while tries remain, then the best solved try (the lowest when lower wins). Undefined shows no number. */
export const shownScore = (play: PlayState, template?: Template): number | undefined => {
  if (play.stage === 'ended') return bestScore(solvedScores(play.scores), template);
  const latest = play.scores.at(-1);
  return typeof latest === 'number' ? latest : undefined;
};

/** Why the latest try missed, or undefined when it solved the challenge or no try has run. */
export const latestMiss = (play: PlayState): string | undefined => {
  const latest = play.scores.at(-1);
  return typeof latest === 'object' ? latest.reason : undefined;
};

/** The share line for each try: its score, or null when unsolved. */
export const sharedScores = (scores: TryScore[]) =>
  scores.map((score) => (typeof score === 'number' ? score : null));
