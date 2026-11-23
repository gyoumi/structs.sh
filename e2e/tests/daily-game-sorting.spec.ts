import { test, expect } from '../support/test';
import { BUBBLE_21, INSERTION_22 } from '../support/daily-sorting-fixtures';

/** Checkpoint 2 step 2a-1: the bubble-exact-passes and insertion-beats-merge templates. Fixtures are worked in daily-sorting-fixtures.ts. */

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;

test.describe('daily bubble: exactly k passes', () => {
  const { puzzle, start, solved, mostPasses } = BUBBLE_21;

  test('loads and plays, counting passes and swaps', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(puzzle);
    await dailyPage.open();

    const ctx = `${BUBBLE_21.name} start ${fmt(start.values)}`;
    await dailyTemplate.expectRules([/exactly 4 passes/i, /swaps/i], ctx);
    await dailyPage.expectStatusNumber('Goal', puzzle.par, `${ctx}: Goal should show the served par (${puzzle.par} swaps)`);
    await dailyPage.expectStatusNumber('Target passes', puzzle.targetPasses, `${ctx}: Target passes should show targetPasses ${puzzle.targetPasses}`);
    expect(await dailyPage.values(), `${ctx}: Puzzle array should show the served values`).toEqual([...puzzle.values]);
    expect(await dailyPage.fixedIndices(), `${ctx}: fixed slots ${fmt(puzzle.fixed)} should be disabled`).toEqual([...puzzle.fixed]);
    await dailyPage.expectStatusNumber('Passes', 0, `${ctx}: Passes should start at 0 before Run`);
    await dailyPage.expectStatusNumber('Swaps', 0, `${ctx}: Swaps should start at 0 before Run`);

    await dailyPage.run();
    await dailyTemplate.expectCountersAnimate([{ name: 'Passes', final: start.passes }, { name: 'Swaps', final: start.swaps }], ctx);
    await dailyPage.skip(ctx);
    await dailyPage.expectStatusNumber('Passes', start.passes, `${ctx}: after Skip, Passes should be ${start.passes} (4 passes with swaps, then a pass with none)`);
    await dailyPage.expectStatusNumber('Swaps', start.swaps, `${ctx}: after Skip, Swaps should be ${start.swaps} (6 + 4 + 3 + 1 + 0)`);
    await dailyPage.expectStatusNumber('Tries left', 2, `${ctx}: Tries left should be 2 after try 1`);

    await dailyPage.rewind();
    await dailyPage.expectStatusNumber('Passes', 0, `${ctx}: Back to the start should reset Passes to 0`);
    await dailyPage.expectStatusNumber('Swaps', 0, `${ctx}: Back to the start should reset Swaps to 0`);
    await dailyPage.skipToEnd(ctx);
    await dailyPage.expectStatusNumber('Swaps', start.swaps, `${ctx}: Skip to the end should bring Swaps back to ${start.swaps}`);
    await dailyPage.expectNoBestShown(ctx);
  });

  test('a try that misses the target passes is unsolved, and a solved try outranks it', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(puzzle);
    await dailyPage.open();

    const try1 = `${BUBBLE_21.name} try 1 ${fmt(start.values)} (${start.passes} passes, ${start.swaps} swaps: unsolved)`;
    await dailyTemplate.expectRules([/exactly 4 passes/i], try1);
    await dailyPage.run();
    await dailyPage.skip(try1);
    await dailyPage.expectStatusNumber('Tries left', 2, `${try1}: Tries left should be 2`);
    await dailyTemplate.expectTryResult([start.passes, puzzle.targetPasses], [/pass/i], try1);
    await dailyPage.expectStatusNumber('Swaps', start.swaps, `${try1}: an unsolved try should still show its ${start.swaps} swaps`);
    await dailyTemplate.expectNoScore(try1);
    await dailyTemplate.expectGoalReached(false, `${try1}: ${start.swaps} swaps beat the goal of ${puzzle.par}, but the try took ${start.passes} passes, not ${puzzle.targetPasses}`);
    await dailyTemplate.expectTryChips(['✗'], try1);

    const try2 = `${BUBBLE_21.name} try 2 ${fmt(solved.values)} (${solved.passes} passes, ${solved.swaps} swaps: solved at goal ${puzzle.par})`;
    await dailyTemplate.arrange(dailyPage, solved.values, try2);
    await dailyPage.run();
    await dailyPage.skip(try2);
    await dailyPage.expectStatusNumber('Tries left', 1, `${try2}: Tries left should be 1`);
    await dailyPage.expectStatusNumber('Passes', solved.passes, `${try2}: Passes should be ${solved.passes}`);
    await dailyPage.expectStatusNumber('Score', solved.swaps, `${try2}: a solved try scores its swaps (${solved.swaps})`);
    await dailyTemplate.expectGoalReached(true, `${try2}: solved with ${solved.swaps} swaps >= goal ${puzzle.par}`);
    await dailyTemplate.expectTryChips(['✗', `${solved.swaps} ⭐`], try2);

    const try3 = `${BUBBLE_21.name} try 3 ${fmt(mostPasses.values)} (${mostPasses.passes} passes = n - 1, ${mostPasses.swaps} swaps: unsolved)`;
    await dailyTemplate.arrange(dailyPage, mostPasses.values, try3);
    await dailyPage.run();
    await dailyPage.skip(try3);
    await dailyPage.expectStatusNumber('Tries left', 0, `${try3}: Tries left should be 0`);
    await dailyPage.expectStatusNumber(
      'Passes',
      mostPasses.passes,
      `${try3}: Passes should be ${mostPasses.passes} (n - 1, every pass swapping); bubble.ts's 8th outer iteration makes no comparisons and is not a pass, so 8 is wrong`,
    );
    await dailyPage.expectStatusNumber('Swaps', mostPasses.swaps, `${try3}: Swaps should be ${mostPasses.swaps} (7 + 4 + 2 + 2 + 1 + 1 + 1)`);
    await dailyTemplate.expectTryResult([mostPasses.passes, puzzle.targetPasses], [/pass/i], `${try3}: Try result still describes this final try`);

    const end = `${BUBBLE_21.name} after tries [✗ ${start.swaps} swaps, ${solved.swaps} solved, ✗ ${mostPasses.swaps} swaps]`;
    await dailyPage.expectStatusNumber('Score', solved.swaps, `${end}: the only solved try (${solved.swaps}) must outrank unsolved tries with more swaps (${start.swaps}, ${mostPasses.swaps})`);
    await dailyTemplate.expectGoalReached(true, `${end}: once the puzzle ends, Goal reached reports the best solved try, which meets the goal`);
    await dailyTemplate.expectTryChips(['✗', `${solved.swaps} ⭐`, '✗'], end);
    expect(await dailyPage.canShare(), `${end}: Share should be offered once the puzzle ends`).toBe(true);
    const expected = [`structs.sh daily #21 · Bubble sort · Goal ${puzzle.par}`, '✗', `${solved.swaps} ⭐`, '✗', 'structs.sh/daily'].join('\n');
    expect((await dailyPage.shareText()).trim(), `${end}: Share text should mark unsolved tries ✗`).toBe(expected);
  });
});

test.describe('daily insertion beats merge', () => {
  const { puzzle, start, tie, solved } = INSERTION_22;
  const stages = ['Insertion sort', 'Merge sort'];
  const sorted = [...start.values].sort((a, b) => a - b);
  const counters = [
    { name: 'Insertion comparisons', final: start.insertion },
    { name: 'Merge comparisons', final: start.merge },
  ];

  test('loads and plays both sorts side by side on one Playback toolbar', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(puzzle);
    await dailyPage.open();

    const ctx = `${INSERTION_22.name} start ${fmt(start.values)}`;
    await dailyTemplate.expectRules([/insertion sort/i, /merge sort/i], ctx);
    await dailyPage.expectStatusNumber('Goal', puzzle.par, `${ctx}: Goal should show the served par ${puzzle.par}`);
    expect(await dailyPage.fixedIndices(), `${ctx}: fixed slots ${fmt(puzzle.fixed)} should be disabled`).toEqual([...puzzle.fixed]);
    await dailyPage.expectStatusNumber('Out-of-order pairs', start.pairs, `${ctx}: Out-of-order pairs should count the current arrangement's inversions`);
    await dailyTemplate.expectStagesSideBySide('Insertion sort', 'Merge sort', ctx);
    await dailyTemplate.expectOnePlaybackToolbar(ctx);

    for (const stage of stages) await dailyTemplate.stages.expectValues(stage, start.values, `${ctx}: before Run the "${stage}" stage should draw the arrangement`);

    await dailyPage.run();
    await dailyTemplate.expectCountersAnimate(counters, ctx);
    await dailyPage.skip(ctx);
    await dailyPage.expectStatusNumber('Insertion comparisons', start.insertion, `${ctx}: Skip should finish insertion sort at ${start.insertion} comparisons (1+1+3+2+5+3+5)`);
    await dailyPage.expectStatusNumber('Merge comparisons', start.merge, `${ctx}: Skip should finish merge sort at ${start.merge} comparisons (1+1+3+1+1+3+7)`);
    for (const stage of stages) await dailyTemplate.stages.expectValues(stage, sorted, `${ctx}: after Skip the "${stage}" stage should draw the sorted values`);

    await dailyPage.rewind();
    await dailyPage.expectStatusNumber('Insertion comparisons', 0, `${ctx}: Back to the start on the shared toolbar should reset Insertion comparisons to 0`);
    await dailyPage.expectStatusNumber('Merge comparisons', 0, `${ctx}: Back to the start on the shared toolbar should reset Merge comparisons to 0`);
    for (const stage of stages) await dailyTemplate.stages.expectValues(stage, start.values, `${ctx}: Back to the start should redraw the arrangement in the "${stage}" stage`);
    await dailyTemplate.stages.stepUntilEveryStageChanges(stages, counters, ctx);
    await dailyPage.skipToEnd(ctx);
    await dailyPage.expectStatusNumber('Insertion comparisons', start.insertion, `${ctx}: Skip to the end should finish insertion sort at ${start.insertion}`);
    await dailyPage.expectStatusNumber('Merge comparisons', start.merge, `${ctx}: Skip to the end should finish merge sort at ${start.merge}`);
    for (const stage of stages) await dailyTemplate.stages.expectValues(stage, sorted, `${ctx}: Skip to the end should draw the sorted values in the "${stage}" stage`);
    await dailyTemplate.stages.expectReplayRedrawsEveryStage(stages, ctx);
    await dailyPage.skipToEnd(`${ctx} after Replay`);
    for (const stage of stages) await dailyTemplate.stages.expectValues(stage, sorted, `${ctx}: after Replay, Skip to the end should draw the sorted values in the "${stage}" stage`);
  });

  test('an unsolved try is marked, and a solved try scores its out-of-order pairs', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(puzzle);
    await dailyPage.open();

    const try1 = `${INSERTION_22.name} try 1 ${fmt(tie.values)} (insertion ${tie.insertion} = merge ${tie.merge}: unsolved tie)`;
    await dailyTemplate.expectRules([/insertion sort/i, /merge sort/i], try1);
    await dailyTemplate.arrange(dailyPage, tie.values, try1);
    await dailyPage.expectStatusNumber('Out-of-order pairs', tie.pairs, `${try1}: Out-of-order pairs should follow the swaps to ${tie.pairs}`);
    await dailyPage.run();
    await dailyPage.skip(try1);
    await dailyPage.expectStatusNumber('Tries left', 2, `${try1}: Tries left should be 2`);
    await dailyTemplate.expectTryResult([tie.insertion], [/insertion/i, /merge/i], try1);
    await dailyTemplate.expectNoScore(try1);
    await dailyTemplate.expectGoalReached(false, `${try1}: a tie is unsolved even with ${tie.pairs} out-of-order pairs >= goal ${puzzle.par}`);
    await dailyTemplate.expectTryChips(['✗'], try1);

    const try2 = `${INSERTION_22.name} try 2 ${fmt(solved.values)} (insertion ${solved.insertion} < merge ${solved.merge}: solved)`;
    await dailyTemplate.arrange(dailyPage, solved.values, try2);
    await dailyPage.run();
    await dailyPage.skip(try2);
    await dailyPage.expectStatusNumber('Insertion comparisons', solved.insertion, `${try2}: Insertion comparisons should be ${solved.insertion}`);
    await dailyPage.expectStatusNumber('Merge comparisons', solved.merge, `${try2}: Merge comparisons should be ${solved.merge}`);
    await dailyPage.expectStatusNumber('Score', solved.pairs, `${try2}: a solved try scores its out-of-order pairs (${solved.pairs}), not either comparison count`);
    await dailyTemplate.expectGoalReached(true, `${try2}: solved with ${solved.pairs} out-of-order pairs >= goal ${puzzle.par}`);
    await dailyTemplate.expectTryChips(['✗', `${solved.pairs} ⭐`], try2);
    expect(await dailyPage.values(), `${try2}: Puzzle array should stay as the player left it`).toEqual([...solved.values]);
    await dailyPage.expectNoBestShown(try2);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('the two sorts stack on a phone and share one Playback toolbar', async ({ dailyPage, dailyTemplate }) => {
      await dailyPage.serve(puzzle);
      await dailyPage.open();

      const ctx = `${INSERTION_22.name} start ${fmt(start.values)} at 390x844 touch`;
      await dailyTemplate.expectRules([/insertion sort/i, /merge sort/i], ctx);
      await dailyTemplate.expectStagesStacked('Insertion sort', 'Merge sort', ctx);
      await dailyTemplate.expectOnePlaybackToolbar(ctx);
      expect(await dailyPage.fixedIndices(), `${ctx}: fixed slots ${fmt(puzzle.fixed)} should be disabled`).toEqual([...puzzle.fixed]);
      await dailyPage.expectAllSlotsInViewport(ctx, puzzle.values.length);
      await dailyPage.run();
      await dailyPage.skip(ctx);
      await dailyPage.expectStatusNumber('Insertion comparisons', start.insertion, `${ctx}: Skip should finish insertion sort at ${start.insertion}`);
      await dailyPage.expectStatusNumber('Merge comparisons', start.merge, `${ctx}: Skip should finish merge sort at ${start.merge}`);
    });
  });
});
