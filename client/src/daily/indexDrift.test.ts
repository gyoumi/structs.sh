import { describe, expect, it } from 'vitest';
import { validateOperations } from './OperationBuilder';
import { playReducer, reachesGoal, shownScore, type PlayState, type TryScore } from './playMachine';
import { parseChallenge, challengeTitle, shareText, type Challenge } from './challenge';
import { instanceOf, tryScoreOf } from './templates';

/**
 * The linked-list-index-drift template in the daily parser, share text and play machine.
 * DRIFT_26 is the challenge worked in e2e/support/daily-list-fixtures.ts. Its score is a cost,
 * so lower wins: the goal is reached at or below goal.
 */

const DRIFT_26 = {
  number: 26,
  template: 'linked-list-index-drift',
  start: [8, 3, 6, 1],
  target: [3, 6, 5, 1],
  goal: 6,
} as const;

const drift = (changes: Record<string, unknown>) => ({ ...DRIFT_26, ...changes });

const without = (key: keyof typeof DRIFT_26) => {
  const { [key]: omitted, ...rest } = DRIFT_26;
  return rest;
};

const parseOutcome = (input: unknown) => {
  try {
    return { threw: false as const, result: parseChallenge(input) };
  } catch (error: unknown) {
    return { threw: true as const, error };
  }
};

describe('parseChallenge — linked-list-index-drift', () => {
  it.each([
    { label: 'DRIFT_26', input: drift({}) },
    { label: 'DRIFT_26 with a date', input: drift({ date: '2026-11-26' }) },
    {
      label: 'negative, duplicate and 32-bit extreme values',
      input: drift({ start: [-2147483648, 7, 7, 2147483647], target: [7, -1] }),
    },
  ])('returns $label unchanged', ({ label, input }) => {
    const outcome = parseOutcome(input);
    expect(
      outcome,
      `parseChallenge(${JSON.stringify(input)}) [${label}]: expected the index drift challenge back unchanged, got ${outcome.threw ? String(outcome.error) : JSON.stringify(outcome.result)}`
    ).toEqual({ threw: false, result: input });
  });

  it.each([
    { label: 'missing start', input: without('start') },
    { label: 'missing target', input: without('target') },
    { label: 'missing goal', input: without('goal') },
    { label: 'null start', input: drift({ start: null }) },
    { label: 'start that is not a list', input: drift({ start: '8, 3, 6, 1' }) },
    { label: 'non-integer in start', input: drift({ start: [8, 3.5, 6, 1] }) },
    { label: 'string in target', input: drift({ target: [3, '6', 5, 1] }) },
    { label: 'target value past i32::MAX', input: drift({ target: [2147483648] }) },
    { label: 'start value below i32::MIN', input: drift({ start: [-2147483649] }) },
    { label: 'non-numeric goal', input: drift({ goal: '6' }) },
    { label: 'unexpected fixed slots', input: drift({ fixed: [0] }) },
    { label: 'unexpected values', input: drift({ values: [8, 3, 6, 1] }) },
    { label: 'blank date', input: drift({ date: '  ' }) },
  ])('throws an Error for $label', ({ label, input }) => {
    const baseline = parseOutcome(DRIFT_26);
    expect(
      baseline.threw,
      `baseline: parseChallenge(${JSON.stringify(DRIFT_26)}) should parse, so the next rejection comes from "${label}"; it ${baseline.threw ? `threw ${String(baseline.error)}` : 'parsed'}`
    ).toBe(false);
    const outcome = parseOutcome(input);
    expect(
      outcome.threw && outcome.error instanceof Error,
      `parseChallenge(${JSON.stringify(input)}) [${label}]: expected an Error to be thrown, but it ${outcome.threw ? `threw ${String(outcome.error)}` : `returned ${JSON.stringify(outcome.result)}`}`
    ).toBe(true);
  });
});

describe('shareText — index drift (lower wins)', () => {
  const header = 'structs.sh daily #26 · Index drift · Goal 6';

  it('titles the template "Index drift"', () => {
    const title = challengeTitle('linked-list-index-drift');
    expect(
      title,
      `challengeTitle('linked-list-index-drift') should be "Index drift", got ${JSON.stringify(title)}`
    ).toBe('Index drift');
  });

  it.each([
    { label: 'the e2e tries ✗, 5, 14', scores: [null, 5, 14], lines: ['✗', '5 ⭐', '14'] },
    { label: 'a cost equal to the goal', scores: [6], lines: ['6 ⭐'] },
    { label: 'a cost one above the goal', scores: [7], lines: ['7'] },
    { label: 'cost 0, far below the goal', scores: [0], lines: ['0 ⭐'] },
  ])('marks ⭐ at or below the goal for $label', ({ label, scores, lines }) => {
    const want = [header, ...lines, 'structs.sh/daily'].join('\n');
    const text = shareText(DRIFT_26 as unknown as Challenge, scores);
    expect(
      text,
      `shareText(#26 index drift goal 6, ${JSON.stringify(scores)}) [${label}]: lower wins, so ⭐ marks scores <= 6; expected ${JSON.stringify(want)}, got ${JSON.stringify(text)}`
    ).toBe(want);
  });
});

const unsolved: TryScore = { kind: 'unsolved', reason: 'The final list is not the target.' };

const afterTries = (scores: TryScore[]): PlayState =>
  scores.reduce<PlayState>(
    (state, score, i) => {
      const running = playReducer(state, {
        type: 'run',
        input: { kind: 'operations', operations: [] },
        runId: i + 1,
        focusSkip: false,
      });
      const scoring = playReducer(running, { type: 'animation-completed', runId: i + 1 });
      return playReducer(scoring, { type: 'scored', score });
    },
    { stage: 'ready', scores: [] }
  );

describe('playMachine — index drift ranks the lowest solved cost first', () => {
  it('shows the latest try while tries remain, then the lowest solved cost once ended', () => {
    const tries: TryScore[] = [unsolved, 5, 14];
    const midway = afterTries(tries.slice(0, 2));
    const ended = afterTries(tries);
    const shown = {
      midway: shownScore(midway, 'linked-list-index-drift'),
      ended: shownScore(ended, 'linked-list-index-drift'),
    };
    expect(
      shown,
      `shownScore(play, 'linked-list-index-drift') after tries [✗, 5] then [✗, 5, 14] (stage ${ended.stage}): lower wins, so the ended score is the lowest solved cost 5, not the last (14)`
    ).toEqual({ midway: 5, ended: 5 });
  });

  it('keeps the highest solved score for the other templates', () => {
    const ended = afterTries([30, 36, 34]);
    const shown = {
      withTemplate: shownScore(ended, 'quicksort-most-comparisons'),
      withoutTemplate: shownScore(ended),
    };
    expect(
      shown,
      'shownScore after quicksort tries [30, 36, 34] should still be the highest, 36, with or without a template'
    ).toEqual({ withTemplate: 36, withoutTemplate: 36 });
  });

  it.each([
    { template: 'linked-list-index-drift', goal: 6, score: 5, reached: true },
    { template: 'linked-list-index-drift', goal: 6, score: 6, reached: true },
    { template: 'linked-list-index-drift', goal: 6, score: 7, reached: false },
    { template: 'quicksort-most-comparisons', goal: 34, score: 34, reached: true },
    { template: 'quicksort-most-comparisons', goal: 34, score: 30, reached: false },
  ] as const)(
    'reachesGoal($template, goal $goal, score $score) is $reached',
    ({ template, goal, score, reached }) => {
      const got = reachesGoal({ template, goal }, score);
      expect(
        got,
        `reachesGoal({ template: '${template}', goal: ${goal} }, ${score}): index drift reaches the goal at or below goal, every other template at or above; expected ${reached}`
      ).toBe(reached);
    }
  );
});

describe('templates — index drift', () => {
  it('sends only the template, start and target to the wasm', () => {
    const instance = instanceOf({ ...DRIFT_26, date: '2026-11-26' } as unknown as Challenge);
    expect(
      instance,
      'instanceOf(DRIFT_26 with number, goal and date) should be { template, start, target } only'
    ).toEqual({ template: 'linked-list-index-drift', start: [8, 3, 6, 1], target: [3, 6, 5, 1] });
  });

  it('scores a solved try by its cost and explains an unsolved one with the target', () => {
    const challenge = DRIFT_26 as unknown as Challenge;
    const solved = tryScoreOf(challenge, {
      template: 'linked-list-index-drift',
      solved: true,
      score: 5,
      operations: 2,
      nodesWalked: 3,
      cost: 5,
    });
    expect(solved, 'tryScoreOf(#26, solved with cost 5) should be the cost 5').toBe(5);
    const missed = tryScoreOf(challenge, {
      template: 'linked-list-index-drift',
      solved: false,
      score: null,
      operations: 1,
      nodesWalked: 0,
      cost: 1,
    });
    expect(
      typeof missed === 'object' && missed.kind === 'unsolved' && /target/i.test(missed.reason),
      `tryScoreOf(#26, unsolved: final list is not the target) should be { kind: 'unsolved', reason } with a reason mentioning the target, got ${JSON.stringify(missed)}`
    ).toBe(true);
  });
});

describe('validateOperations — queue replay after edits', () => {
  it('flags a delete that becomes out of range after removing an earlier insert', () => {
    const valid = validateOperations(1, [
      { kind: 'insert', value: 5, index: 1 },
      { kind: 'delete', index: 1 },
    ]);
    expect(
      valid,
      `validateOperations(start length 1, [insert(5, 1), delete(1)]): the insert makes delete(1) valid, so expected { status: 'valid', endLength: 1 }, got ${JSON.stringify(valid)}`
    ).toEqual({ status: 'valid', endLength: 1 });

    const broken = validateOperations(1, [{ kind: 'delete', index: 1 }]);
    expect(
      broken,
      `validateOperations(start length 1, [delete(1)]) after removing the insert: delete(1) is out of range for a 1-node list, so expected { status: 'invalid', invalidAt: 0 }, got ${JSON.stringify(broken)}`
    ).toMatchObject({ status: 'invalid', invalidAt: 0 });
  });
});
