import { test, expect } from '../support/test';
import { AVL_23, UPSET_25 } from '../support/daily-tree-fixtures';
import type { DailyTemplatePage } from '../support/daily-template-page';

/** Checkpoint 2 step 2a-2: the avl-most-rotations and upset-bst-beats-avl templates. Fixtures are worked in daily-tree-fixtures.ts. */

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;

test.describe('daily AVL: most rotations', () => {
  const { challenge, start, doubles } = AVL_23;

  test('loads and plays, counting single rotations as keys are inserted in order', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(challenge);
    await dailyPage.open();

    const ctx = `${AVL_23.name} insert order ${fmt(start.values)}`;
    await dailyTemplate.expectRules([/rotations/i], ctx);
    await dailyPage.expectStatusNumber('Goal', challenge.goal, `${ctx}: Goal should show the served goal ${challenge.goal}`);
    expect(await dailyPage.values(), `${ctx}: Challenge array should show the insert order`).toEqual([...challenge.values]);
    expect(await dailyPage.fixedIndices(), `${ctx}: fixed slots ${fmt(challenge.fixed)} should be disabled`).toEqual([...challenge.fixed]);
    await dailyPage.expectStatusNumber('Rotations', 0, `${ctx}: Rotations should start at 0 before Run`);

    await dailyPage.transport.setSpeed(5);
    await dailyPage.run();
    await dailyTemplate.expectCountersAnimate([{ name: 'Rotations', final: start.rotations }], ctx);
    await dailyPage.skip(ctx);
    await dailyPage.expectStatusNumber(
      'Rotations',
      start.rotations,
      `${ctx}: after Skip, Rotations should be ${start.rotations} single rotations (LR at 5 = 2, RL at 5 = 2, RR at 3 = 1)`,
    );
    await dailyPage.expectStatusNumber('Score', start.rotations, `${ctx}: Score should match Rotations (${start.rotations})`);
    await dailyPage.expectStatusNumber('Goal', challenge.goal, `${ctx}: Goal should still show ${challenge.goal}`);
    await dailyTemplate.expectGoalReached(false, `${ctx}: ${start.rotations} rotations is below the goal of ${challenge.goal}`);
    await dailyTemplate.expectTryChips([`${start.rotations}`], ctx);

    await dailyPage.transport.rewind();
    await dailyPage.expectStatusNumber('Rotations', 0, `${ctx}: Back to the start should reset Rotations to 0`);
    await dailyPage.transport.skipToEnd(ctx);
    await dailyPage.expectStatusNumber('Rotations', start.rotations, `${ctx}: Skip to the end should bring Rotations back to ${start.rotations}`);
    await dailyPage.expectNoBestShown(ctx);
  });

  test('a double rotation counts as two, and reaching the goal is announced', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(challenge);
    await dailyPage.open();

    const ctx = `${AVL_23.name} insert order ${fmt(doubles.values)} (swap slots ${doubles.swap.join(' and ')})`;
    await dailyTemplate.expectRules([/rotations/i], ctx);
    await dailyPage.swap(doubles.swap[0], doubles.swap[1]);
    expect(await dailyPage.values(), `${ctx}: swapping slots ${doubles.swap.join(' and ')} should give ${fmt(doubles.values)}`).toEqual([...doubles.values]);
    await dailyPage.run();
    await dailyPage.skip(ctx);
    await dailyPage.expectStatusNumber(
      'Rotations',
      doubles.rotations,
      `${ctx}: Rotations should be ${doubles.rotations}: three double rotations count 2 each (LR at 5, RL at 5, LR at 5) plus RR at 2`,
    );
    await dailyPage.expectStatusNumber('Score', doubles.rotations, `${ctx}: Score should be ${doubles.rotations}`);
    await dailyTemplate.expectGoalReached(true, `${ctx}: ${doubles.rotations} rotations >= goal ${challenge.goal}`);
    await dailyTemplate.expectTryChips([`${doubles.rotations} ⭐`], ctx);
    await dailyPage.expectStatusNumber('Tries left', 2, `${ctx}: reaching the goal must not end the challenge early`);
    expect(await dailyPage.canRun(), `${ctx}: Run should still be offered for the next try`).toBe(true);
  });
});

test.describe('daily upset: BST builds cheaper', () => {
  const { challenge, start, solved } = UPSET_25;
  const stages = ['BST', 'AVL tree'];
  const counters = [
    { name: 'BST nodes passed', final: start.bst },
    { name: 'AVL nodes passed', final: start.avl },
  ];
  const expectFinalTrees = async (dailyTemplate: DailyTemplatePage, context: string) => {
    await dailyTemplate.stages.expectTree('BST', start.bstTree, `${context}: the BST stage should draw every key inserted in order, unbalanced`);
    await dailyTemplate.stages.expectTree('AVL tree', start.avlTree, `${context}: the AVL tree stage should draw every key, rebalanced by its 6 rotations`);
  };
  const expectEmptyTrees = async (dailyTemplate: DailyTemplatePage, context: string) => {
    for (const stage of stages) await dailyTemplate.stages.expectTree(stage, '', `${context}: the "${stage}" stage should draw no keys before the first insert`);
  };

  test('loads and plays BST and AVL side by side on one Playback toolbar, counting nodes passed', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(challenge);
    await dailyPage.open();

    const ctx = `${UPSET_25.name} insert order ${fmt(start.values)}`;
    await dailyTemplate.expectRules([/\bBST\b/, /\bAVL\b/], ctx);
    await dailyPage.expectStatusNumber('Goal', challenge.goal, `${ctx}: Goal should show the served goal ${challenge.goal}`);
    expect(await dailyPage.fixedIndices(), `${ctx}: fixed slots ${fmt(challenge.fixed)} should be disabled`).toEqual([...challenge.fixed]);
    await dailyTemplate.expectStagesSideBySide('BST', 'AVL tree', ctx);
    await dailyTemplate.expectOnePlaybackToolbar(ctx);

    await expectEmptyTrees(dailyTemplate, `${ctx} before Run`);

    await dailyPage.run();
    await dailyTemplate.expectCountersAnimate(counters, ctx);
    await dailyPage.skip(ctx);
    await expectFinalTrees(dailyTemplate, `${ctx} after Skip`);
    await dailyPage.expectStatusNumber('BST nodes passed', start.bst, `${ctx}: Skip should finish the BST at ${start.bst} nodes passed (0+1+1+2+2+2+3+4+3+5+6+4+4+5)`);
    await dailyPage.expectStatusNumber(
      'AVL nodes passed',
      start.avl,
      `${ctx}: Skip should finish the AVL tree at ${start.avl} nodes passed (0+1+1+2+2+2+3+4+4+4+4+3+4+4); its 6 rotations must not be counted`,
    );

    await dailyPage.transport.rewind();
    await dailyPage.expectStatusNumber('BST nodes passed', 0, `${ctx}: Back to the start on the shared toolbar should reset BST nodes passed to 0`);
    await dailyPage.expectStatusNumber('AVL nodes passed', 0, `${ctx}: Back to the start on the shared toolbar should reset AVL nodes passed to 0`);
    await expectEmptyTrees(dailyTemplate, `${ctx} Back to the start`);
    await dailyTemplate.stages.stepUntilEveryStageChanges(stages, counters, ctx);
    await dailyPage.transport.skipToEnd(ctx);
    await dailyPage.expectStatusNumber('BST nodes passed', start.bst, `${ctx}: Skip to the end should finish the BST at ${start.bst}`);
    await dailyPage.expectStatusNumber('AVL nodes passed', start.avl, `${ctx}: Skip to the end should finish the AVL tree at ${start.avl}`);
    await expectFinalTrees(dailyTemplate, `${ctx} Skip to the end`);
    await dailyTemplate.stages.expectReplayRedrawsEveryStage(stages, ctx);
    await dailyPage.transport.skipToEnd(`${ctx} after Replay`);
    await expectFinalTrees(dailyTemplate, `${ctx} Skip to the end after Replay`);
  });

  test('an unsolved order is marked, and a solved upset scores its margin', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(challenge);
    await dailyPage.open();

    const try1 = `${UPSET_25.name} try 1 ${fmt(start.values)} (BST ${start.bst} >= AVL ${start.avl}: unsolved)`;
    await dailyTemplate.expectRules([/\bBST\b/, /\bAVL\b/], try1);
    await dailyPage.run();
    await dailyPage.skip(try1);
    await dailyPage.expectStatusNumber('Tries left', 2, `${try1}: Tries left should be 2`);
    await dailyTemplate.expectTryResult([start.bst, start.avl], [/\bBST\b/, /\bAVL\b/], try1);
    await dailyTemplate.expectNoScore(try1);
    await dailyTemplate.expectGoalReached(false, `${try1}: the BST passed more nodes than the AVL tree`);
    await dailyTemplate.expectTryChips(['✗'], try1);

    const try2 = `${UPSET_25.name} try 2 ${fmt(solved.values)} (BST ${solved.bst} < AVL ${solved.avl}: solved, margin ${solved.margin})`;
    await dailyTemplate.arrange(dailyPage, solved.values, try2);
    await dailyPage.run();
    await dailyPage.skip(try2);
    await dailyPage.expectStatusNumber('BST nodes passed', solved.bst, `${try2}: BST nodes passed should be ${solved.bst}`);
    await dailyPage.expectStatusNumber(
      'AVL nodes passed',
      solved.avl,
      `${try2}: AVL nodes passed should be ${solved.avl} (counting its 11 rotations too would wrongly give 52)`,
    );
    await dailyPage.expectStatusNumber('Score', solved.margin, `${try2}: a solved upset scores the margin AVL - BST = ${solved.avl} - ${solved.bst} = ${solved.margin}`);
    await dailyTemplate.expectGoalReached(true, `${try2}: margin ${solved.margin} >= goal ${challenge.goal}`);
    await dailyTemplate.expectTryChips(['✗', `${solved.margin} ⭐`], try2);
    expect(await dailyPage.values(), `${try2}: Challenge array should stay as the player left it`).toEqual([...solved.values]);
    await dailyPage.expectNoBestShown(try2);
  });

  test.describe('on a phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('the BST and AVL tree stack on a phone and share one Playback toolbar', async ({ dailyPage, dailyTemplate }) => {
      await dailyPage.serve(challenge);
      await dailyPage.open();

      const ctx = `${UPSET_25.name} insert order ${fmt(start.values)} at 390x844 touch`;
      await dailyTemplate.expectRules([/\bBST\b/, /\bAVL\b/], ctx);
      await dailyTemplate.expectStagesStacked('BST', 'AVL tree', ctx);
      await dailyTemplate.expectOnePlaybackToolbar(ctx);
      expect(await dailyPage.fixedIndices(), `${ctx}: fixed slots ${fmt(challenge.fixed)} should be disabled`).toEqual([...challenge.fixed]);
      await dailyPage.expectAllSlotsInViewport(ctx, challenge.values.length);
      await dailyPage.run();
      await dailyPage.skip(ctx);
      await dailyPage.expectStatusNumber('BST nodes passed', start.bst, `${ctx}: Skip should finish the BST at ${start.bst}`);
      await dailyPage.expectStatusNumber('AVL nodes passed', start.avl, `${ctx}: Skip should finish the AVL tree at ${start.avl}`);
      await expectFinalTrees(dailyTemplate, `${ctx} after Skip`);
    });
  });
});
