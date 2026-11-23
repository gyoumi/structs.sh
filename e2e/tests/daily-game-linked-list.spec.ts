import { test, expect } from '../support/test';
import { DRIFT_26 } from '../support/daily-list-fixtures';

/** Checkpoint 2 step 2a-3: the linked-list-index-drift template. The fixture is worked in daily-list-fixtures.ts. */

test.describe('daily index drift', () => {
  const { puzzle, unsolved, cheap, costly } = DRIFT_26;
  const lists = `start [${puzzle.start.join(', ')}] -> target [${puzzle.target.join(', ')}]`;

  test('loads and plays an operation list, counting operations, nodes walked and cost', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(puzzle);
    const ctx = `${DRIFT_26.name} ${lists}, operations ${costly.listed.join(', ')}`;
    await dailyTemplate.operations.open(ctx);

    await dailyTemplate.expectRules([/target list/i], ctx);
    await dailyPage.expectStatusNumber('Goal', puzzle.par, `${ctx}: Goal should show the served par ${puzzle.par}`);
    expect(await dailyTemplate.operations.listValues('Start list', ctx), `${ctx}: Start list should show the served start`).toEqual([...puzzle.start]);
    expect(await dailyTemplate.operations.listValues('Target list', ctx), `${ctx}: Target list should show the served target`).toEqual([...puzzle.target]);
    expect(await dailyPage.canRun(), `${ctx}: Run should be disabled while the Operation list is empty`).toBe(false);

    await dailyTemplate.operations.build(costly.operations, costly.listed, ctx);
    for (const name of ['Operations', 'Nodes walked', 'Cost']) {
      await dailyPage.expectStatusNumber(name, 0, `${ctx}: ${name} should start at 0 before Run`);
    }
    await dailyPage.run();
    await dailyTemplate.expectCountersAnimate(
      [
        { name: 'Operations', final: costly.count },
        { name: 'Nodes walked', final: costly.walked },
        { name: 'Cost', final: costly.cost },
      ],
      ctx,
    );
    await dailyPage.skip(ctx);
    await dailyPage.expectStatusNumber('Operations', costly.count, `${ctx}: Operations should be ${costly.count}`);
    await dailyPage.expectStatusNumber('Nodes walked', costly.walked, `${ctx}: Nodes walked should be ${costly.walked} (delete(3) 4 + delete(0) 1 + insert(5, 2) 2 + insert(1, 3) 3)`);
    await dailyPage.expectStatusNumber('Cost', costly.cost, `${ctx}: Cost should be operations + nodes walked = ${costly.count} + ${costly.walked} = ${costly.cost}`);
    await dailyPage.expectStatusNumber('Score', costly.cost, `${ctx}: a solved try scores its cost (${costly.cost})`);
    await dailyTemplate.expectGoalReached(false, `${ctx}: cost ${costly.cost} is above the goal of ${puzzle.par} (lower wins)`);
    await dailyTemplate.expectTryChips([`${costly.cost}`], ctx);
    await dailyTemplate.operations.expectListed(costly.listed, `${ctx}: after try 1 the Operation list should stay as the player left it`);

    await dailyPage.rewind();
    await dailyPage.expectStatusNumber('Cost', 0, `${ctx}: Back to the start should reset Cost to 0`);
    await dailyPage.skipToEnd(ctx);
    await dailyPage.expectStatusNumber('Cost', costly.cost, `${ctx}: Skip to the end should bring Cost back to ${costly.cost}`);
    await dailyPage.expectNoBestShown(ctx);
  });

  test('the lowest solved cost wins, and an unsolved try never outranks a solved one', async ({ dailyPage, dailyTemplate }) => {
    await dailyPage.serve(puzzle);
    await dailyTemplate.operations.open(`${DRIFT_26.name} ${lists}`);

    const try1 = `${DRIFT_26.name} try 1 ${unsolved.listed.join(', ')} (cost ${unsolved.cost}, final list is not the target: unsolved)`;
    await dailyTemplate.operations.build(unsolved.operations, unsolved.listed, try1);
    await dailyPage.run();
    await dailyPage.skip(try1);
    await dailyPage.expectStatusNumber('Cost', unsolved.cost, `${try1}: an unsolved try should still show its cost ${unsolved.cost}`);
    await dailyTemplate.expectTryResult([], [/target/i], try1);
    await dailyTemplate.expectNoScore(try1);
    await dailyTemplate.expectGoalReached(false, `${try1}: cost ${unsolved.cost} <= goal ${puzzle.par}, but the final list is not the target`);
    await dailyTemplate.expectTryChips(['✗'], try1);

    const try2 = `${DRIFT_26.name} try 2 ${cheap.listed.join(', ')} (solved, cost ${cheap.cost} <= goal ${puzzle.par})`;
    await dailyTemplate.operations.clear(try2);
    await dailyTemplate.operations.build(cheap.operations, cheap.listed, try2);
    await dailyPage.run();
    await dailyPage.skip(try2);
    await dailyPage.expectStatusNumber('Nodes walked', cheap.walked, `${try2}: Nodes walked should be ${cheap.walked} (delete(0) 1 + insert(5, 2) 2)`);
    await dailyPage.expectStatusNumber('Score', cheap.cost, `${try2}: Score should be cost ${cheap.cost}`);
    await dailyTemplate.expectGoalReached(true, `${try2}: solved with cost ${cheap.cost} <= goal ${puzzle.par}`);
    await dailyTemplate.expectTryChips(['✗', `${cheap.cost} ⭐`], try2);

    const try3 = `${DRIFT_26.name} try 3 ${costly.listed.join(', ')} (solved, cost ${costly.cost} > goal ${puzzle.par})`;
    await dailyTemplate.operations.clear(try3);
    await dailyTemplate.operations.build(costly.operations, costly.listed, try3);
    await dailyPage.run();
    await dailyPage.skip(try3);
    await dailyPage.expectStatusNumber('Cost', costly.cost, `${try3}: Cost should be ${costly.cost}`);

    const end = `${DRIFT_26.name} after tries [✗ cost ${unsolved.cost}, ${cheap.cost}, ${costly.cost}]`;
    await dailyPage.expectStatusNumber('Tries left', 0, `${end}: Tries left should be 0`);
    await dailyPage.expectStatusNumber(
      'Score',
      cheap.cost,
      `${end}: lower wins, so Score should be the lowest solved cost ${cheap.cost}, not the last (${costly.cost}) or the unsolved try's ${unsolved.cost}`,
    );
    await dailyTemplate.expectGoalReached(true, `${end}: the winning try (cost ${cheap.cost}) is solved and at or below the goal`);
    await dailyTemplate.expectTryChips(['✗', `${cheap.cost} ⭐`, `${costly.cost}`], end);
    expect(await dailyPage.canShare(), `${end}: Share should be offered once the puzzle ends`).toBe(true);
    const expected = [`structs.sh daily #26 · Index drift · Goal ${puzzle.par}`, '✗', `${cheap.cost} ⭐`, `${costly.cost}`, 'structs.sh/daily'].join('\n');
    expect((await dailyPage.shareText()).trim(), `${end}: Share text should mark the unsolved try ✗ and ⭐ only at or below the goal`).toBe(expected);
  });
});
