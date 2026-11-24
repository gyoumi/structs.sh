import { test, expect } from '../support/test';
import { DAILY_12 } from '../support/daily-fixtures';
import type { DailyPage } from '../support/daily-page';

/**
 * Checkpoint 3 step 3c: the whole stack. The page, the real structs-game-server and Postgres seeded by
 * `structs_game_db::seed` (fixtures on 2026-04-04..06 and 2026-10-03..05, 2026-10-07; 2026-10-06 is
 * left unscheduled). Nothing is mocked: the day moves only through the server's test-only clock control.
 */

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;

/** Keys the server must never send to the browser. */
const PRIVATE_KEYS = ['best', 'bestScore', 'best_score', 'bestSolution', 'best_solution', 'seed', 'botGoalRate', 'botBestRate'];

/** Runs the current arrangement and skips the animation, three times, which finishes the day. */
const runThreeTimes = async (dailyPage: DailyPage, context: string) => {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await dailyPage.run();
    await dailyPage.skip(`${context} try ${attempt}`);
  }
  await dailyPage.expectStatusNumber('Tries left', 0, `${context}: after 3 tries`);
};

/** Sydney midnight on both 2026 daylight saving days, with the template the seeder schedules on each side. */
const MIDNIGHTS = [
  { instant: '2026-10-03T13:59:59Z', date: '2026-10-03', template: 'quicksort-most-comparisons', rules: /pivot/i, why: '23:59:59 AEST' },
  { instant: '2026-10-03T14:00:00Z', date: '2026-10-04', template: 'bubble-exact-passes', rules: /bubble|passes/i, why: '00:00:00 AEST, the 23-hour spring-forward day' },
  { instant: '2026-10-04T12:59:59Z', date: '2026-10-04', template: 'bubble-exact-passes', rules: /bubble|passes/i, why: '23:59:59 AEDT, 23 hours later' },
  { instant: '2026-10-04T13:00:00Z', date: '2026-10-05', template: 'avl-most-rotations', rules: /rotations/i, why: '00:00:00 AEDT, 1 second later' },
  { instant: '2026-04-04T12:59:59Z', date: '2026-04-04', template: 'insertion-beats-merge', rules: /insertion sort/i, why: '23:59:59 AEDT' },
  { instant: '2026-04-04T13:00:00Z', date: '2026-04-05', template: 'upset-bst-beats-avl', rules: /\bBST\b/, why: '00:00:00 AEDT, the 25-hour fall-back day' },
  { instant: '2026-04-05T13:59:59Z', date: '2026-04-05', template: 'upset-bst-beats-avl', rules: /\bBST\b/, why: '23:59:59 AEST, 25 hours later' },
  { instant: '2026-04-05T14:00:00Z', date: '2026-04-06', template: 'linked-list-index-drift', rules: /target list/i, why: '00:00:00 AEST, 1 second later' },
] as const;

test.describe('daily game live stack', () => {
  test.describe.configure({ mode: 'serial' });

  test("today's puzzle comes from the live server without leaking private fields and survives a refresh", async ({ dailyStack, dailyPage, dailyHistory }) => {
    const clock = await dailyStack.setClock('2026-10-03T13:59:59Z');
    expect(clock.sydneyDate, `PUT clock 2026-10-03T13:59:59Z (23:59:59 AEST): sydneyDate should be 2026-10-03, got ${JSON.stringify(clock)}`).toBe('2026-10-03');

    const reply = await dailyStack.fetchDailyRaw();
    const call = `GET /api/daily at 2026-10-03T13:59:59Z, got ${reply.status} ${JSON.stringify(reply.body)}`;
    expect(reply.status, `${call}: should answer 200 with the seeded puzzle`).toBe(200);
    expect(reply.cacheControl ?? '', `${call}: Cache-Control should contain no-store, got ${reply.cacheControl}`).toContain('no-store');
    expect(reply.body.date, `${call}: date should be the server's Sydney day 2026-10-03`).toBe('2026-10-03');
    expect(reply.body.template, `${call}: template should be the seeded quicksort-most-comparisons`).toBe('quicksort-most-comparisons');
    const leaked = PRIVATE_KEYS.filter((key) => key in reply.body);
    expect(leaked, `${call}: none of ${JSON.stringify(PRIVATE_KEYS)} may reach the browser`).toEqual([]);

    const ctx = `/daily on 2026-10-03 (${DAILY_12.name}, from the live server)`;
    await dailyStack.openDaily(ctx);
    expect(await dailyPage.values(), `${ctx}: Puzzle array should show the seeded values ${fmt(DAILY_12.start.values)}`).toEqual([...DAILY_12.start.values]);
    expect(await dailyPage.goal(ctx), `${ctx}: Goal should show the seeded par ${DAILY_12.puzzle.par}`).toBe(DAILY_12.puzzle.par);

    await dailyPage.run();
    await dailyPage.skip(`${ctx} try 1 ${fmt(DAILY_12.start.values)}`);
    await dailyPage.swap(...DAILY_12.par.swap);
    await dailyPage.run();
    await dailyPage.skip(`${ctx} try 2 ${fmt(DAILY_12.par.values)}`);
    await dailyPage.swap(...DAILY_12.highFromPar.swap);
    await dailyPage.run();
    await dailyPage.skip(`${ctx} try 3 ${fmt(DAILY_12.highFromPar.values)}`);
    const end = `${ctx} after tries ${DAILY_12.start.count}, ${DAILY_12.par.count}, ${DAILY_12.highFromPar.count}`;
    await dailyPage.expectStatusNumber('Tries left', 0, `${end}: Tries left`);
    await dailyHistory.expectStreak(1, `${end}: finishing today's puzzle should start a streak`);

    await dailyStack.reloadDaily(`${end} then reload`);
    const after = `${end}, after reloading /daily`;
    await dailyPage.expectStatusNumber('Tries left', 0, `${after}: the finished puzzle should come back finished`);
    await dailyPage.expectStatusNumber('Score', DAILY_12.highFromPar.count, `${after}: Score should be the best saved try`);
    await dailyHistory.expectStreak(1, after);
    expect(await dailyPage.canShare(), `${after}: Share should be enabled for the finished puzzle`).toBe(true);
  });

  test('the puzzle changes at midnight in Sydney, including spring-forward (23h) and fall-back (25h) daylight saving days', async ({ dailyStack }) => {
    for (const step of MIDNIGHTS) {
      const ctx = `server clock ${step.instant} (Sydney ${step.date} ${step.why})`;
      const clock = await dailyStack.setClock(step.instant);
      expect(clock.sydneyDate, `${ctx}: PUT clock should report sydneyDate ${step.date}, got ${JSON.stringify(clock)}`).toBe(step.date);

      const reply = await dailyStack.fetchDailyRaw();
      const call = `${ctx}: GET /api/daily answered ${reply.status} ${JSON.stringify(reply.body)}`;
      expect(reply.status, `${call}; expected 200`).toBe(200);
      expect(reply.body.date, `${call}; expected date ${step.date}`).toBe(step.date);
      expect(reply.body.template, `${call}; expected template ${step.template}`).toBe(step.template);

      await dailyStack.openDaily(`${ctx}, ${step.template}`);
      await dailyStack.expectRulesContain(step.rules, `${ctx}, ${step.template}`);
    }
  });

  test('consecutive server days build a streak, an unscheduled day shows not-ready, and skipping a day resets the streak', async ({ dailyStack, dailyPage, dailyHistory }) => {
    const day3 = await dailyStack.setClock('2026-10-03T01:00:00Z');
    expect(day3.sydneyDate, `PUT clock 2026-10-03T01:00:00Z: sydneyDate should be 2026-10-03, got ${JSON.stringify(day3)}`).toBe('2026-10-03');
    const ctx3 = '2026-10-03 (quicksort-most-comparisons)';
    await dailyStack.openDaily(ctx3);
    await runThreeTimes(dailyPage, ctx3);
    await dailyHistory.expectStreak(1, `${ctx3} finished`);

    const day4 = await dailyStack.setClock('2026-10-04T01:00:00Z');
    expect(day4.sydneyDate, `PUT clock 2026-10-04T01:00:00Z: sydneyDate should be 2026-10-04, got ${JSON.stringify(day4)}`).toBe('2026-10-04');
    const ctx4 = '2026-10-04 (bubble-exact-passes, the spring-forward day), the day after finishing 2026-10-03';
    await dailyStack.reloadDaily(ctx4);
    await dailyStack.expectRulesContain(/bubble|passes/i, ctx4);
    await dailyHistory.expectStreak(1, `${ctx4}, before playing: yesterday's streak should still show`);
    await runThreeTimes(dailyPage, ctx4);
    await dailyHistory.expectStreak(2, `${ctx4}, after finishing: two server days in a row`);
    const shared = (await dailyPage.shareText()).trim();
    expect(shared, `${ctx4}: Share text should include "Streak: 2 days 🔥", got ${JSON.stringify(shared)}`).toContain('Streak: 2 days 🔥');

    const day6 = await dailyStack.setClock('2026-10-06T01:00:00Z');
    expect(day6.sydneyDate, `PUT clock 2026-10-06T01:00:00Z: sydneyDate should be 2026-10-06, got ${JSON.stringify(day6)}`).toBe('2026-10-06');
    await dailyHistory.goto();
    await dailyHistory.expectNotReady('2026-10-06 has no seeded puzzle, so the live server answers GET /api/daily with 404');

    const day7 = await dailyStack.setClock('2026-10-07T01:00:00Z');
    expect(day7.sydneyDate, `PUT clock 2026-10-07T01:00:00Z: sydneyDate should be 2026-10-07, got ${JSON.stringify(day7)}`).toBe('2026-10-07');
    const ctx7 = '2026-10-07 (bst-forced-order), after missing 2026-10-06';
    await dailyStack.tryAgain(`${ctx7}: Try again on the not-ready page`);
    await dailyStack.expectRulesContain(/target tree/i, ctx7);
    await dailyHistory.expectStreak(null, `${ctx7}, before playing: missing 2026-10-06 should reset the streak`);
    await runThreeTimes(dailyPage, ctx7);
    await dailyHistory.expectStreak(1, `${ctx7}, after finishing: the streak should restart at 1`);
  });
});
