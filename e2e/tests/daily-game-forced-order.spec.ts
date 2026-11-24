import { test, expect } from '../support/test';
import { FORCED_24 } from '../support/daily-tree-fixtures';

/** Checkpoint 2 step 2a-2: the bst-forced-order template. The fixture is worked in daily-tree-fixtures.ts. */

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;

test.describe('daily forced order', () => {
  const { challenge, start, solved, longRun, ascending } = FORCED_24;

  test('shows the target tree, then loads and plays', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(challenge);
    await dailyPage.open();

    const ctx = `${FORCED_24.name} insert order ${fmt(start.values)}, target preorder ${fmt(challenge.targetTree)}`;
    await dailyTemplate.expectRules([/target tree/i], ctx);
    await dailyTemplate.expectTargetTree(challenge.targetTree, ctx);
    await dailyPage.expectStatusNumber('Goal', challenge.goal, `${ctx}: Goal should show the served goal ${challenge.goal}`);
    expect(await dailyPage.values(), `${ctx}: Challenge array should show the served insert order`).toEqual([...challenge.values]);
    expect(await dailyPage.fixedIndices(), `${ctx}: the challenge has no fixed field, so no slot should be disabled`).toEqual([]);
    await dailyPage.expectStatusNumber('Increasing run', start.run, `${ctx}: Increasing run should show the current order's longest increasing run (4, 7, 8, 10)`);

    await dailyPage.run();
    await dailyPage.expectVisualiserInViewport(`${ctx} after clicking Run`);
    await dailyPage.skip(ctx);
    await dailyPage.expectStatusNumber('Tries left', 2, `${ctx}: Tries left should be 2 after try 1`);
    await dailyTemplate.expectTargetTree(challenge.targetTree, `${ctx} after try 1`);
    await dailyPage.rewind();
    await dailyPage.skipToEnd(ctx);
    await dailyPage.expectStatusNumber('Tries left', 2, `${ctx}: rewinding and replaying to the end must not use a try`);
  });

  test('a non-matching order is unsolved, and a matching order scores its longest increasing run', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(challenge);
    await dailyPage.open();

    const try1 = `${FORCED_24.name} try 1 ${fmt(start.values)} (root 3, not the target: unsolved)`;
    await dailyPage.run();
    await dailyPage.skip(try1);
    await dailyTemplate.expectTryResult([], [/target/i], try1);
    await dailyTemplate.expectNoScore(try1);
    await dailyTemplate.expectGoalReached(false, `${try1}: the tree does not match the target`);
    await dailyTemplate.expectTryChips(['✗'], try1);

    const try2 = `${FORCED_24.name} try 2 ${fmt(solved.values)} (rebuilds the target, run ${solved.run})`;
    await dailyTemplate.arrange(dailyPage, solved.values, try2);
    await dailyPage.expectStatusNumber('Increasing run', solved.run, `${try2}: Increasing run should follow the swaps to ${solved.run} (1, 2, 4, 7, 8, 10)`);
    await dailyPage.run();
    await dailyPage.skip(try2);
    await dailyPage.expectStatusNumber('Score', solved.run, `${try2}: a matching order scores its longest increasing run (${solved.run})`);
    await dailyTemplate.expectGoalReached(true, `${try2}: solved with run ${solved.run} >= goal ${challenge.goal}`);
    await dailyTemplate.expectTryChips(['✗', `${solved.run} ⭐`], try2);

    const try3 = `${FORCED_24.name} try 3 ${fmt(longRun.values)} (5 lands right of 4: unsolved, run ${longRun.run})`;
    await dailyTemplate.arrange(dailyPage, longRun.values, try3);
    await dailyPage.run();
    await dailyPage.skip(try3);
    await dailyTemplate.expectTryResult([], [/target/i], try3);
    expect(await dailyPage.values(), `${try3}: Challenge array should stay as the player left it`).toEqual([...longRun.values]);

    const end = `${FORCED_24.name} after tries [✗, ${solved.run} solved, ✗ with run ${longRun.run}]`;
    await dailyPage.expectStatusNumber('Tries left', 0, `${end}: Tries left should be 0`);
    await dailyPage.expectStatusNumber('Score', solved.run, `${end}: the solved run ${solved.run} must outrank the unsolved try's longer run ${longRun.run}`);
    await dailyTemplate.expectGoalReached(true, `${end}: the winning try is solved and meets the goal`);
    await dailyTemplate.expectTryChips(['✗', `${solved.run} ⭐`, '✗'], end);
  });

  test('three unsolved tries end the challenge with no score', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(challenge);
    await dailyPage.open();

    const orders = [start.values, longRun.values, ascending.values];
    for (const [i, order] of orders.entries()) {
      const ctx = `${FORCED_24.name} try ${i + 1} ${fmt(order)} (not the target)`;
      await dailyTemplate.arrange(dailyPage, order, ctx);
      await dailyPage.run();
      await dailyPage.skip(ctx);
      await dailyPage.expectStatusNumber('Tries left', 2 - i, `${ctx}: Tries left should be ${2 - i}`);
    }

    const end = `${FORCED_24.name} after three unsolved tries (runs ${start.run}, ${longRun.run}, ${ascending.run})`;
    await dailyTemplate.expectNoScore(end);
    await dailyTemplate.expectGoalReached(false, `${end}: no try was solved`);
    await dailyTemplate.expectTryChips(['✗', '✗', '✗'], end);
    expect(await dailyPage.canRun(), `${end}: Run should be disabled or hidden once the challenge ends`).toBe(false);
    expect(await dailyPage.canShare(), `${end}: Share should be offered once the challenge ends`).toBe(true);
    const expected = [`structs.sh daily #24 · Forced order · Goal ${challenge.goal}`, '✗', '✗', '✗', 'structs.sh/daily'].join('\n');
    expect((await dailyPage.shareText()).trim(), `${end}: Share text should list three unsolved tries as ✗`).toBe(expected);
  });
});
