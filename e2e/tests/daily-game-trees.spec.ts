import { test, expect } from '../support/test';
import { AVL_23, UPSET_25 } from '../support/daily-tree-fixtures';

/** Checkpoint 2 step 2a-2: the avl-most-rotations and upset-bst-beats-avl templates. Fixtures are worked in daily-tree-fixtures.ts. */

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;

test.describe('daily AVL: most rotations', () => {
  const { puzzle, start, doubles } = AVL_23;

  test('loads and plays, counting single rotations as keys are inserted in order', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(puzzle);
    await dailyPage.open();

    const ctx = `${AVL_23.name} insert order ${fmt(start.values)}`;
    await dailyTemplate.expectRules([/rotations/i], ctx);
    await dailyPage.expectStatusNumber('Goal', puzzle.par, `${ctx}: Goal should show the served par ${puzzle.par}`);
    expect(await dailyPage.values(), `${ctx}: Puzzle array should show the insert order`).toEqual([...puzzle.values]);
    expect(await dailyPage.fixedIndices(), `${ctx}: fixed slots ${fmt(puzzle.fixed)} should be disabled`).toEqual([...puzzle.fixed]);
    await dailyPage.expectStatusNumber('Rotations', 0, `${ctx}: Rotations should start at 0 before Run`);

    await dailyPage.run();
    await dailyTemplate.expectStatusRisesAbove('Rotations', 0, ctx);
    await dailyPage.skip(ctx);
    await dailyPage.expectStatusNumber(
      'Rotations',
      start.rotations,
      `${ctx}: after Skip, Rotations should be ${start.rotations} single rotations (LR at 5 = 2, RL at 5 = 2, RR at 3 = 1)`,
    );
    await dailyPage.expectStatusNumber('Score', start.rotations, `${ctx}: Score should match Rotations (${start.rotations})`);
    await dailyPage.expectStatusNumber('Goal', puzzle.par, `${ctx}: Goal should still show ${puzzle.par}`);
    await dailyTemplate.expectGoalReached(false, `${ctx}: ${start.rotations} rotations is below the goal of ${puzzle.par}`);
    await dailyTemplate.expectTryChips([`${start.rotations}`], ctx);

    await dailyPage.rewind();
    await dailyPage.expectStatusNumber('Rotations', 0, `${ctx}: Back to the start should reset Rotations to 0`);
    await dailyPage.skipToEnd(ctx);
    await dailyPage.expectStatusNumber('Rotations', start.rotations, `${ctx}: Skip to the end should bring Rotations back to ${start.rotations}`);
    await dailyPage.expectNoBestShown(ctx);
  });

  test('a double rotation counts as two, and reaching the goal is announced', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(puzzle);
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
    await dailyTemplate.expectGoalReached(true, `${ctx}: ${doubles.rotations} rotations >= goal ${puzzle.par}`);
    await dailyTemplate.expectTryChips([`${doubles.rotations} ⭐`], ctx);
    await dailyPage.expectStatusNumber('Tries left', 2, `${ctx}: reaching the goal must not end the puzzle early`);
    expect(await dailyPage.canRun(), `${ctx}: Run should still be offered for the next try`).toBe(true);
  });
});

test.describe('daily upset: BST builds cheaper', () => {
  const { puzzle, start, solved } = UPSET_25;

  test('loads and plays BST and AVL side by side on one Playback toolbar, counting nodes passed', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(puzzle);
    await dailyPage.open();

    const ctx = `${UPSET_25.name} insert order ${fmt(start.values)}`;
    await dailyTemplate.expectRules([/\bBST\b/, /\bAVL\b/], ctx);
    await dailyPage.expectStatusNumber('Goal', puzzle.par, `${ctx}: Goal should show the served par ${puzzle.par}`);
    expect(await dailyPage.fixedIndices(), `${ctx}: fixed slots ${fmt(puzzle.fixed)} should be disabled`).toEqual([...puzzle.fixed]);
    await dailyTemplate.expectStagesSideBySide('BST', 'AVL tree', ctx);
    await dailyTemplate.expectOnePlaybackToolbar(ctx);

    await dailyPage.run();
    await dailyTemplate.expectStatusRisesAbove('BST nodes passed', 0, ctx);
    await dailyTemplate.expectStatusRisesAbove('AVL nodes passed', 0, ctx);
    await dailyPage.skip(ctx);
    await dailyPage.expectStatusNumber('BST nodes passed', start.bst, `${ctx}: Skip should finish the BST at ${start.bst} nodes passed (0+1+1+2+2+2+3+4+3+5+6+4+4+5)`);
    await dailyPage.expectStatusNumber(
      'AVL nodes passed',
      start.avl,
      `${ctx}: Skip should finish the AVL tree at ${start.avl} nodes passed (0+1+1+2+2+2+3+4+4+4+4+3+4+4); its 6 rotations must not be counted`,
    );

    await dailyPage.rewind();
    await dailyPage.expectStatusNumber('BST nodes passed', 0, `${ctx}: Back to the start on the shared toolbar should reset BST nodes passed to 0`);
    await dailyPage.expectStatusNumber('AVL nodes passed', 0, `${ctx}: Back to the start on the shared toolbar should reset AVL nodes passed to 0`);
    await dailyPage.skipToEnd(ctx);
    await dailyPage.expectStatusNumber('BST nodes passed', start.bst, `${ctx}: Skip to the end should finish the BST at ${start.bst}`);
    await dailyPage.expectStatusNumber('AVL nodes passed', start.avl, `${ctx}: Skip to the end should finish the AVL tree at ${start.avl}`);
  });

  test('an unsolved order is marked, and a solved upset scores its margin', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(puzzle);
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
    await dailyTemplate.expectGoalReached(true, `${try2}: margin ${solved.margin} >= goal ${puzzle.par}`);
    await dailyTemplate.expectTryChips(['✗', `${solved.margin} ⭐`], try2);
    expect(await dailyPage.values(), `${try2}: Puzzle array should stay as the player left it`).toEqual([...solved.values]);
    await dailyPage.expectNoBestShown(try2);
  });
});
