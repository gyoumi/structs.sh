export const MAX_TRIES = 3;

export type ShareStatus = 'idle' | 'copied' | 'failed';

export type PlayState =
  | { stage: 'ready'; scores: number[] }
  | { stage: 'running'; scores: number[]; arrangement: number[]; runId: number; focusSkip: boolean }
  | { stage: 'scoring'; scores: number[]; arrangement: number[] }
  | { stage: 'score-failed'; scores: number[] }
  | { stage: 'ended'; scores: number[]; share: ShareStatus };

export type PlayEvent =
  | { type: 'run'; arrangement: number[]; runId: number; focusSkip: boolean }
  | { type: 'animation-completed'; runId: number }
  | { type: 'scored'; score: number }
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
