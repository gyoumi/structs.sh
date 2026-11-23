export const MAX_TRIES = 3;

export type ShareStatus = 'idle' | 'copied' | 'failed';

/** A try that ran but missed the puzzle's condition, with why, as shown to the player. */
export type UnsolvedTry = { kind: 'unsolved'; reason: string };

/** A solved try's score, or an unsolved try. */
export type TryScore = number | UnsolvedTry;

export type PlayState =
  | { stage: 'ready'; scores: TryScore[] }
  | {
      stage: 'running';
      scores: TryScore[];
      arrangement: number[];
      runId: number;
      focusSkip: boolean;
    }
  | { stage: 'scoring'; scores: TryScore[]; arrangement: number[] }
  | { stage: 'score-failed'; scores: TryScore[] }
  | { stage: 'ended'; scores: TryScore[]; share: ShareStatus };

export type PlayEvent =
  | { type: 'run'; arrangement: number[]; runId: number; focusSkip: boolean }
  | { type: 'animation-completed'; runId: number }
  | { type: 'scored'; score: TryScore }
  | { type: 'score-failed' }
  | { type: 'share-copied' }
  | { type: 'share-failed' };

export const initialPlayState: PlayState = { stage: 'ready', scores: [] };

export const playReducer = (state: PlayState, event: PlayEvent): PlayState => {
  switch (event.type) {
    case 'run':
      if (state.stage !== 'ready' && state.stage !== 'score-failed') return state;
      return {
        stage: 'running',
        scores: state.scores,
        arrangement: event.arrangement,
        runId: event.runId,
        focusSkip: event.focusSkip,
      };
    case 'animation-completed':
      if (state.stage !== 'running' || state.runId !== event.runId) return state;
      return {
        stage: 'scoring',
        scores: state.scores,
        arrangement: state.arrangement,
      };
    case 'scored': {
      if (state.stage !== 'scoring') return state;
      const scores = [...state.scores, event.score];
      if (scores.length >= MAX_TRIES) return { stage: 'ended', scores, share: 'idle' };
      return { stage: 'ready', scores };
    }
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

/** What the score readout shows: the latest try while tries remain, then the best solved try. Undefined shows no number. */
export const shownScore = (play: PlayState): number | undefined => {
  if (play.stage === 'ended') {
    const solved = solvedScores(play.scores);
    return solved.length > 0 ? Math.max(...solved) : undefined;
  }
  const latest = play.scores.at(-1);
  return typeof latest === 'number' ? latest : undefined;
};

/** Why the latest try missed, or undefined when it solved the puzzle or no try has run. */
export const latestMiss = (play: PlayState): string | undefined => {
  const latest = play.scores.at(-1);
  return typeof latest === 'object' ? latest.reason : undefined;
};

/** The share line for each try: its score, or null when unsolved. */
export const sharedScores = (scores: TryScore[]) =>
  scores.map((score) => (typeof score === 'number' ? score : null));
