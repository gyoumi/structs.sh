import { test, expect } from '../support/test';
import { DAILY_12 } from '../support/daily-fixtures';
import type { DatedPuzzle } from '../support/daily-history';
import type { DailyPage } from '../support/daily-page';

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;
const dated = (number: number, date: string): DatedPuzzle => ({ ...DAILY_12.puzzle, number, date });
const header = (number: number) => `structs.sh daily #${number} · Quicksort · Goal ${DAILY_12.puzzle.par}`;

const DAY_21 = dated(12, '2026-12-21');
const DAY_22 = dated(13, '2026-12-22');
const DAY_24 = dated(15, '2026-12-24');

const swapRunSkip = async (dailyPage: DailyPage, swap: readonly [number, number] | null, context: string) => {
  if (swap) await dailyPage.swap(swap[0], swap[1]);
  await dailyPage.run();
  await dailyPage.skip(context);
};

/** Tries 30 (start), 34 ⭐ (2<->7) and 36 ⭐ (5<->7), as in the share text test in daily-game-run.spec.ts. */
const finishDay = async (dailyPage: DailyPage, context: string) => {
  await swapRunSkip(dailyPage, null, `${context} try 1 ${fmt(DAILY_12.start.values)}`);
  await swapRunSkip(dailyPage, DAILY_12.par.swap, `${context} try 2 ${fmt(DAILY_12.par.values)}`);
  await swapRunSkip(dailyPage, DAILY_12.highFromPar.swap, `${context} try 3 ${fmt(DAILY_12.highFromPar.values)}`);
  await dailyPage.expectStatusNumber('Tries left', 0, `${context}: after 3 tries`);
};

const finishedShare = (number: number, streakLine: string) =>
  [header(number), `${DAILY_12.start.count}`, `${DAILY_12.par.count} ⭐`, `${DAILY_12.highFromPar.count} ⭐`, streakLine, 'structs.sh/daily'].join('\n');

test.describe('daily game streaks and history', () => {
  test('a finished puzzle survives a refresh and keeps its saved inputs in versioned localStorage', async ({ dailyPage, dailyTemplate, dailyHistory }) => {
    await dailyHistory.serveOnly(DAY_21);
    await dailyPage.open();
    const ctx = `${DAILY_12.name} dated ${DAY_21.date}`;
    await dailyHistory.expectStreak(null, `${ctx} before any try, with no finished days`);

    const try1 = `${ctx} try 1 ${fmt(DAILY_12.par.values)} (score ${DAILY_12.par.count})`;
    await swapRunSkip(dailyPage, DAILY_12.par.swap, try1);
    await dailyHistory.reload(`${try1} then reload`);
    const midCtx = `${try1}, after reloading /daily`;
    await dailyPage.expectStatusNumber('Tries left', 2, `${midCtx}: the saved try should still count`);
    await dailyTemplate.expectTryChips([`${DAILY_12.par.count} ⭐`], midCtx);
    await dailyPage.expectStatusNumber('Score', DAILY_12.par.count, `${midCtx}: Score should show the saved try`);
    await dailyTemplate.expectGoalReached(true, midCtx);
    expect(await dailyPage.values(), `${midCtx}: Puzzle array should show the saved try's arrangement ${fmt(DAILY_12.par.values)}`).toEqual([...DAILY_12.par.values]);
    expect(await dailyPage.canRun(), `${midCtx}: Run should stay enabled with 2 tries left`).toBe(true);
    expect(await dailyPage.canShare(), `${midCtx}: Share should not be offered with 2 tries left`).toBe(false);
    await dailyHistory.expectStreak(null, `${midCtx} (today is not finished and yesterday was not played)`);

    await swapRunSkip(dailyPage, DAILY_12.lowFromPar.swap, `${ctx} try 2 ${fmt(DAILY_12.lowFromPar.values)}`);
    await swapRunSkip(dailyPage, DAILY_12.thirdFromLow.swap, `${ctx} try 3 ${fmt(DAILY_12.thirdFromLow.values)}`);
    const chips = [`${DAILY_12.par.count} ⭐`, `${DAILY_12.lowFromPar.count}`, `${DAILY_12.thirdFromLow.count}`];
    const endCtx = `${ctx} after tries ${JSON.stringify(chips)}`;
    await dailyPage.expectStatusNumber('Tries left', 0, `${endCtx}: Tries left`);
    await dailyPage.expectStatusNumber('Score', DAILY_12.par.count, `${endCtx}: Score should be the highest try`);
    await dailyTemplate.expectGoalReached(true, endCtx);
    await dailyHistory.expectStreak(1, `${endCtx}: finishing today's puzzle should start a streak`);

    const { raw, parsed } = await dailyHistory.savedHistory();
    expect(parsed?.version, `${endCtx}: localStorage['structs.daily.history'] should be saved with version 1, got ${raw}`).toBe(1);
    const days = Object.values(parsed?.results ?? {}).filter((result) => result.date === DAY_21.date);
    expect(days, `${endCtx}: localStorage history should hold one result dated ${DAY_21.date}, got ${raw}`).toHaveLength(1);
    expect(days[0]?.completed, `${endCtx}: the saved ${DAY_21.date} result should be completed, got ${raw}`).toBe(true);
    expect(
      days[0]?.tries?.map((saved) => saved.input),
      `${endCtx}: each saved try should keep its arrangement input, got ${raw}`,
    ).toEqual([DAILY_12.par.values, DAILY_12.lowFromPar.values, DAILY_12.thirdFromLow.values].map((values) => ({ kind: 'arrangement', arrangement: [...values] })));
    expect(
      days[0]?.tries?.map((saved) => saved.score),
      `${endCtx}: each saved try should keep its score, got ${raw}`,
    ).toEqual([DAILY_12.par.count, DAILY_12.lowFromPar.count, DAILY_12.thirdFromLow.count]);

    await dailyHistory.reload(`${endCtx} then reload`);
    const afterCtx = `${endCtx}, after reloading /daily`;
    await dailyPage.expectStatusNumber('Tries left', 0, `${afterCtx}: the finished puzzle should come back finished`);
    await dailyTemplate.expectTryChips(chips, afterCtx);
    await dailyPage.expectStatusNumber('Score', DAILY_12.par.count, `${afterCtx}: Score should be the highest saved try`);
    await dailyTemplate.expectGoalReached(true, afterCtx);
    expect(await dailyPage.canRun(), `${afterCtx}: Run should be disabled with no tries left`).toBe(false);
    expect(await dailyPage.canShare(), `${afterCtx}: Share should be enabled for the finished puzzle`).toBe(true);
    expect(await dailyPage.values(), `${afterCtx}: Puzzle array should show the last try's arrangement ${fmt(DAILY_12.thirdFromLow.values)}`).toEqual([...DAILY_12.thirdFromLow.values]);
    await dailyHistory.expectArrayFrozen(DAILY_12.puzzle.values.length, afterCtx);
    await dailyHistory.expectStreak(1, afterCtx);

    const want = [header(12), ...chips, 'Streak: 1 day 🔥', 'structs.sh/daily'].join('\n');
    const shared = (await dailyPage.shareText()).trim();
    expect(shared, `${afterCtx}: Share text should be ${JSON.stringify(want)}, got ${JSON.stringify(shared)}`).toBe(want);
  });

  test('playing on consecutive days builds a streak, and missing a day resets it', async ({ dailyPage, dailyHistory }) => {
    await dailyHistory.serveOnly(DAY_21);
    await dailyPage.open();
    await finishDay(dailyPage, `${DAY_21.date} (#12)`);
    await dailyHistory.expectStreak(1, `${DAY_21.date} (#12) finished`);

    await dailyHistory.serveOnly(DAY_22);
    await dailyHistory.reload(`opening ${DAY_22.date} (#13)`);
    const day22 = `${DAY_22.date} (#13), the day after finishing ${DAY_21.date}`;
    await dailyPage.expectStatusNumber('Tries left', 3, `${day22}: a new day's puzzle should start with 3 tries`);
    await dailyHistory.expectStreak(1, `${day22}, before playing: yesterday's streak should still show`);
    await finishDay(dailyPage, day22);
    await dailyHistory.expectStreak(2, `${day22}, after finishing: two days in a row`);
    const share22 = (await dailyPage.shareText()).trim();
    const want22 = finishedShare(13, 'Streak: 2 days 🔥');
    expect(share22, `${day22}: Share text should be ${JSON.stringify(want22)}, got ${JSON.stringify(share22)}`).toBe(want22);

    await dailyHistory.serveOnly(DAY_24);
    await dailyHistory.reload(`opening ${DAY_24.date} (#15)`);
    const day24 = `${DAY_24.date} (#15), after skipping 2026-12-23`;
    await dailyPage.expectStatusNumber('Tries left', 3, `${day24}: a new day's puzzle should start with 3 tries`);
    await dailyHistory.expectStreak(null, `${day24}, before playing: missing 2026-12-23 should reset the streak`);
    await finishDay(dailyPage, day24);
    await dailyHistory.expectStreak(1, `${day24}, after finishing: the streak should restart at 1`);
    const share24 = (await dailyPage.shareText()).trim();
    const want24 = finishedShare(15, 'Streak: 1 day 🔥');
    expect(share24, `${day24}: Share text should be ${JSON.stringify(want24)}, got ${JSON.stringify(share24)}`).toBe(want24);
  });

  test("when the server can't be reached, the page says so and Try again recovers", async ({ dailyPage, dailyHistory }) => {
    await dailyHistory.abort();
    await dailyHistory.goto();
    await dailyHistory.expectUnreachable('GET /api/daily failed at the network layer');

    await dailyHistory.serveOnly(DAY_21);
    await dailyHistory.tryAgain('Try again after the network failure, with the server back');
    const ctx = `Try again after the network failure, serving ${DAILY_12.name}`;
    await dailyHistory.expectNoLoadError(ctx);
    expect(await dailyPage.values(), `${ctx}: Puzzle array should show ${fmt(DAILY_12.start.values)}`).toEqual([...DAILY_12.start.values]);
    expect(await dailyPage.goal(ctx), `${ctx}: Goal should be ${DAILY_12.puzzle.par}`).toBe(DAILY_12.puzzle.par);

    await dailyHistory.failWith(503);
    await dailyHistory.goto();
    await dailyHistory.expectUnreachable('GET /api/daily answered 503 Service Unavailable');
    await dailyHistory.serveOnly(DAY_21);
    await dailyHistory.tryAgain('Try again after 503, with the server back');
    await dailyHistory.expectNoLoadError(`Try again after 503, serving ${DAILY_12.name}`);
  });

  test("when today's puzzle isn't ready, the page says so and Try again loads it", async ({ dailyPage, dailyHistory }) => {
    await dailyHistory.failWith(404);
    await dailyHistory.goto();
    await dailyHistory.expectNotReady('GET /api/daily answered 404 Not Found');

    await dailyHistory.serveOnly(DAY_21);
    await dailyHistory.tryAgain('Try again after 404, with the puzzle now scheduled');
    const ctx = `Try again after 404, serving ${DAILY_12.name}`;
    await dailyHistory.expectNoLoadError(ctx);
    expect(await dailyPage.values(), `${ctx}: Puzzle array should show ${fmt(DAILY_12.start.values)}`).toEqual([...DAILY_12.start.values]);
  });
});
