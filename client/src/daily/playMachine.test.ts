import { describe, expect, it } from 'vitest';
import {
  initialPlayState,
  latestMiss,
  MAX_TRIES,
  playReducer,
  PlayState,
  shownScore,
} from './playMachine';
import { Puzzle } from './puzzle';
import { tryScoreOf } from './templates';

const completeTry = (state: PlayState, runId: number, arrangement: number[], score: number) => {
  const running = playReducer(state, { type: 'run', arrangement, runId, focusSkip: false });
  const scoring = playReducer(running, { type: 'animation-completed', runId });
  return playReducer(scoring, { type: 'scored', score });
};

describe('playReducer', () => {
  it('moves through ready -> running -> scoring -> ready across tries and ends on the third score', () => {
    const first = playReducer(initialPlayState, {
      type: 'run',
      arrangement: [3, 1, 2],
      runId: 1,
      focusSkip: true,
    });
    expect(
      first,
      'run from ready should enter running carrying arrangement, runId, and focusSkip'
    ).toEqual({
      stage: 'running',
      scores: [],
      arrangement: [3, 1, 2],
      runId: 1,
      focusSkip: true,
    });

    const scoring = playReducer(first, { type: 'animation-completed', runId: 1 });
    expect(
      scoring,
      'matching animation-completed should enter scoring with the same arrangement'
    ).toEqual({
      stage: 'scoring',
      scores: [],
      arrangement: [3, 1, 2],
    });

    const afterTry1 = playReducer(scoring, { type: 'scored', score: 30 });
    expect(afterTry1, 'first score should return to ready with scores [30]').toEqual({
      stage: 'ready',
      scores: [30],
    });

    const afterTry2 = completeTry(afterTry1, 2, [2, 1, 3], 34);
    expect(afterTry2, 'second score should return to ready with scores [30, 34]').toEqual({
      stage: 'ready',
      scores: [30, 34],
    });

    const afterTry3 = completeTry(afterTry2, 3, [1, 2, 3], 36);
    expect(
      afterTry3,
      `try ${MAX_TRIES} score should enter ended with share idle and scores [30, 34, 36]`
    ).toEqual({
      stage: 'ended',
      scores: [30, 34, 36],
      share: 'idle',
    });
  });

  it('ignores stale animation completions whose runId does not match the active run', () => {
    const running = playReducer(initialPlayState, {
      type: 'run',
      arrangement: [3, 1, 2],
      runId: 2,
      focusSkip: false,
    });
    const stale = playReducer(running, { type: 'animation-completed', runId: 1 });
    expect(stale, 'animation-completed with stale runId 1 during runId 2 must stay running').toBe(
      running
    );
  });

  it('enters score-failed on scoring error without spending a try, and allows retrying', () => {
    const running = playReducer(initialPlayState, {
      type: 'run',
      arrangement: [3, 1, 2],
      runId: 1,
      focusSkip: false,
    });
    const scoring = playReducer(running, { type: 'animation-completed', runId: 1 });
    const failed = playReducer(scoring, { type: 'score-failed' });
    expect(failed, 'score-failed from scoring should preserve existing scores').toEqual({
      stage: 'score-failed',
      scores: [],
    });

    const retried = playReducer(failed, {
      type: 'run',
      arrangement: [3, 1, 2],
      runId: 2,
      focusSkip: false,
    });
    expect(retried, 'run from score-failed should start a new running try').toEqual({
      stage: 'running',
      scores: [],
      arrangement: [3, 1, 2],
      runId: 2,
      focusSkip: false,
    });
  });

  it('ignores illegal transitions in every stage and only records share outcomes when ended', () => {
    expect(
      playReducer(initialPlayState, { type: 'share-copied' }),
      'share-copied before ended must be a no-op'
    ).toBe(initialPlayState);
    expect(
      playReducer(initialPlayState, { type: 'scored', score: 10 }),
      'scored while ready must be a no-op'
    ).toBe(initialPlayState);

    const running = playReducer(initialPlayState, {
      type: 'run',
      arrangement: [1, 2],
      runId: 1,
      focusSkip: false,
    });
    expect(
      playReducer(running, { type: 'run', arrangement: [2, 1], runId: 2, focusSkip: false }),
      'run while already running must be a no-op'
    ).toBe(running);

    const ended = completeTry(
      completeTry(completeTry(initialPlayState, 1, [1, 2], 10), 2, [1, 2], 20),
      3,
      [1, 2],
      30
    );
    expect(
      playReducer(ended, { type: 'run', arrangement: [2, 1], runId: 4, focusSkip: false }),
      'run after ended must be a no-op'
    ).toBe(ended);

    const copied = playReducer(ended, { type: 'share-copied' });
    expect(copied, 'share-copied when ended should set share to copied').toEqual({
      stage: 'ended',
      scores: [10, 20, 30],
      share: 'copied',
    });

    const failed = playReducer(copied, { type: 'share-failed' });
    expect(failed, 'share-failed when ended should set share to failed').toEqual({
      stage: 'ended',
      scores: [10, 20, 30],
      share: 'failed',
    });
  });

  it('consumes a try as unsolved on a singleton 0-0 insertion-vs-merge tie', () => {
    const singleton: Puzzle = {
      number: 99,
      date: '2026-04-20',
      template: 'insertion-beats-merge',
      values: [42],
      fixed: [],
      par: 1,
    };
    const score = tryScoreOf(singleton, {
      template: 'insertion-beats-merge',
      solved: false,
      score: null,
      insertionComparisons: 0,
      mergeComparisons: 0,
      inversions: 0,
    });
    const running = playReducer(initialPlayState, {
      type: 'run',
      arrangement: [42],
      runId: 1,
      focusSkip: false,
    });
    const scoring = playReducer(running, { type: 'animation-completed', runId: 1 });
    const afterTie = playReducer(scoring, { type: 'scored', score });

    expect(afterTie.stage, 'unsolved tie should return to ready with 1 try spent').toBe('ready');
    expect(afterTie.scores, 'unsolved tie must consume a try').toHaveLength(1);
    expect(shownScore(afterTie), 'unsolved tie must not display a numeric score').toBeUndefined();
    expect(latestMiss(afterTie), 'unsolved tie should explain the 0-0 tie').toContain('0');
  });
});
