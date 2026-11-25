import { test, expect } from '../support/test';
import { DAILY_12 } from '../support/daily-fixtures';
import type { DatedChallenge } from '../support/daily-history';
import { DailyStageView } from '../support/daily-stage-view';
import { FullStorage } from '../support/full-storage';
import type { TopicSlug } from '../support/topics';

/**
 * Step 3f: a full localStorage doesn't blank the app. Found in the 3e recorded run: with every
 * `localStorage.setItem` throwing (quota full), `/`, `/daily` and the visualisers were a blank page, because
 * the debugger's file store (`fileSystem` key) writes on startup and the error wasn't caught.
 *
 * Each test makes every `localStorage.setItem` throw `QuotaExceededError` from before the page's first
 * script runs, so nothing the app writes is ever kept. The debugger's guided tour is marked done first.
 */

const FULL = 'every localStorage.setItem throws QuotaExceededError';

/** A dated day, so the page tries to save its result (an undated challenge is never saved). */
const DAY: DatedChallenge = { ...DAILY_12.challenge, date: '2026-12-21' };

/** Each visualiser opened from a share link, with the values it should draw left to right (in order for a tree). */
const VISUALISERS: { topic: TopicSlug; data: number[]; drawn: number[] }[] = [
  { topic: 'linked-lists', data: [10, 20, 30], drawn: [10, 20, 30] },
  { topic: 'binary-search-trees', data: [20, 10, 30], drawn: [10, 20, 30] },
  { topic: 'avl-trees', data: [10, 20], drawn: [10, 20] },
  { topic: 'sorting-algorithms', data: [50, 10, 40], drawn: [50, 10, 40] },
];

test.describe('full browser storage', () => {
  test('the landing page renders and its theme toggle works', async ({ page, landingPage }) => {
    const storage = new FullStorage(page);
    await storage.fill();
    const ctx = `/ with ${FULL}`;
    await storage.visit('/', ctx);
    await landingPage.open();
    const theme = new DailyStageView(page);
    await theme.expectTheme('light', `${ctx}, on load`);
    await theme.switchTheme('dark', `${ctx}, clicking the "Dark mode" toggle`);
    expect(storage.pageErrors(), `${ctx}: the page must not throw an uncaught error`).toEqual([]);
  });

  test('/daily renders, a try runs and scores, and the page says progress could not be saved', async ({ page, dailyPage, dailyHistory, dailyTemplate }) => {
    const storage = new FullStorage(page);
    await storage.fill();
    const { start } = DAILY_12;
    const ctx = `/daily with ${FULL}, ${DAILY_12.name} dated ${DAY.date}, try 1 on [${start.values.join(', ')}] (${start.count} comparisons)`;
    await dailyHistory.serveOnly(DAY);
    await storage.visit('/daily', ctx);
    await dailyPage.open();
    await dailyPage.expectStatusNumber('Tries left', 3, `${ctx}: before Run`);
    await dailyPage.run();
    await dailyPage.skip(ctx);
    await dailyPage.expectStatusNumber('Comparisons', start.count, `${ctx}: after Run and Skip, Comparisons should be ${start.count}`);
    await dailyPage.expectStatusNumber('Score', start.count, `${ctx}: the try should still be scored ${start.count}`);
    await dailyPage.expectStatusNumber('Tries left', 2, `${ctx}: the try should use one of the 3 tries`);
    await dailyTemplate.expectTryChips([`${start.count}`], ctx);
    await dailyHistory.expectSaveFailedAlert(`${ctx}: the page should show "Couldn’t save progress to this browser." as it does when only the history write fails`);
    expect(storage.pageErrors(), `${ctx}: the page must not throw an uncaught error`).toEqual([]);
  });

  for (const { topic, data, drawn } of VISUALISERS) {
    test(`the ${topic} visualiser renders its drawing`, async ({ page, visualiser }) => {
      const storage = new FullStorage(page);
      await storage.fill();
      const ctx = `/visualiser/${topic} with [${data.join(', ')}] and ${FULL}`;
      await storage.visit(`/visualiser/${topic}`, ctx);
      await visualiser.open(topic, data);
      await expect.poll(() => visualiser.values(), { message: `${ctx}: the drawing should show [${drawn.join(', ')}]` }).toEqual(drawn);
      expect(storage.pageErrors(), `${ctx}: the page must not throw an uncaught error`).toEqual([]);
    });
  }

  test('the linked list visualiser runs an operation', async ({ page, visualiser }) => {
    const storage = new FullStorage(page);
    await storage.fill();
    const ctx = `/visualiser/linked-lists [10, 20, 30] with ${FULL}, append(40) then Skip to the end`;
    await storage.visit('/visualiser/linked-lists', ctx);
    await visualiser.open('linked-lists', [10, 20, 30]);
    await visualiser.runToEnd('append', 40);
    await expect.poll(() => visualiser.values(), { message: `${ctx}: the drawing should show [10, 20, 30, 40]` }).toEqual([10, 20, 30, 40]);
    expect(storage.pageErrors(), `${ctx}: the page must not throw an uncaught error`).toEqual([]);
  });

  test('the debugger opens, and its file tree opens an example and creates a file for the session', async ({ page }) => {
    const storage = new FullStorage(page);
    await storage.fill();
    const ctx = `/debugger with ${FULL}`;
    await storage.visit('/debugger', ctx);
    await storage.openDebugger(ctx);
    await storage.openExample('2521_Tut02', 'linked_list_delete.c', `${ctx}, opening root/2521_Tut02/linked_list_delete.c`);
    await storage.expectEditorShows('struct node', `${ctx}, after opening linked_list_delete.c`);
    await storage.createFile('full_storage.c', `${ctx}, creating full_storage.c`);
    await storage.expectInFileTree('full_storage.c', `${ctx}: a file created this session should show in the file tree even though it can't be saved`);
    expect(storage.pageErrors(), `${ctx}: the page must not throw an uncaught error`).toEqual([]);
  });
});
