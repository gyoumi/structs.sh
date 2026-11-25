import { test, expect } from '../support/test';
import { DAILY_12 } from '../support/daily-fixtures';
import type { DailyChallenge } from '../support/daily-fixtures';
import type { DatedChallenge } from '../support/daily-history';
import type { DailyPage } from '../support/daily-page';
import type { DailyStageView } from '../support/daily-stage-view';
import { contentDifferences, viewInFreshPage, type Theme } from '../support/daily-stage-view';
import { FORCED_24, UPSET_25 } from '../support/daily-tree-fixtures';

/**
 * Switching light/dark mode with the header's theme toggle redraws every stage in the new theme at once,
 * keeping what it shows (the same step of the same run). Found by the 3e exploratory run: after a finished
 * forced-order day on a phone, switching dark to light left the drawing area dark navy until the next Run.
 *
 * The expected look in each theme is read from a fresh page loaded in that theme (a new browser context
 * with that system colour scheme) and played to the same point: the stage's background colour and the
 * fill and stroke of every visible shape drawn in it must match.
 *
 * The viewport is 1440 wide because the playback's "Step N of M" readout only shows on screens wider than 1360.
 */

const WIDE = { width: 1440, height: 900 };
const QUICKSORT_DAY: DatedChallenge = { ...DAILY_12.challenge, date: '2026-12-21' };

type Play = (daily: DailyPage, context: string) => Promise<void>;

const other = (theme: Theme): Theme => (theme === 'light' ? 'dark' : 'light');

const runAndSkip: Play = async (daily, context) => {
  await daily.run();
  await daily.skip(context);
};

/** Back to the start of the first try, then 12 Next steps at 5×: partway through the first partition, with bars highlighted. */
const pausedMidRun: Play = async (daily, context) => {
  await daily.transport.setSpeed(5);
  await runAndSkip(daily, context);
  await daily.transport.rewind();
  const { steps, atEnd } = await daily.stepToEnd(12, () => {}, `${context} stepping from the start`);
  expect(atEnd, `${context}: 12 Next steps from the start should still be mid-run (took ${steps} steps)`).toBe(false);
};

/** Tries 34 (2<->7), 25 (0<->2) and 31 (0<->7), so the day is finished and the stage shows the third run's end. */
const finishedDay: Play = async (daily, context) => {
  for (const { swap } of [DAILY_12.goal, DAILY_12.lowFromGoal, DAILY_12.thirdFromLow]) {
    await daily.swap(swap[0], swap[1]);
    await runAndSkip(daily, context);
  }
  await daily.expectStatusNumber('Tries left', 0, `${context}: the day should be finished after 3 tries`);
};

interface Scenario {
  template: string;
  challenge: DailyChallenge;
  point: string;
  play: Play;
  starts: Theme[];
}

const scenarios: Scenario[] = [
  { template: `quicksort bars, ${DAILY_12.name}`, challenge: DAILY_12.challenge, point: 'before any run', play: async () => {}, starts: ['light', 'dark'] },
  { template: `quicksort bars, ${DAILY_12.name}`, challenge: DAILY_12.challenge, point: 'after a run (Run, then Skip)', play: runAndSkip, starts: ['light', 'dark'] },
  { template: `quicksort bars, ${DAILY_12.name}`, challenge: DAILY_12.challenge, point: 'paused mid-run (12 steps in)', play: pausedMidRun, starts: ['light'] },
  { template: `quicksort bars, ${DAILY_12.name}`, challenge: DAILY_12.challenge, point: 'on a finished day (3 tries)', play: finishedDay, starts: ['dark'] },
  { template: `one BST, ${FORCED_24.name}`, challenge: FORCED_24.challenge, point: 'before any run', play: async () => {}, starts: ['light', 'dark'] },
  { template: `one BST, ${FORCED_24.name}`, challenge: FORCED_24.challenge, point: 'after a run (Run, then Skip)', play: runAndSkip, starts: ['light', 'dark'] },
  { template: `BST and AVL tree stages, ${UPSET_25.name}`, challenge: UPSET_25.challenge, point: 'before any run', play: async () => {}, starts: ['light', 'dark'] },
  { template: `BST and AVL tree stages, ${UPSET_25.name}`, challenge: UPSET_25.challenge, point: 'after a run (Run, then Skip)', play: runAndSkip, starts: ['light', 'dark'] },
];

test.describe('daily game theme switching', () => {
  for (const { template, challenge, point, play, starts } of scenarios) {
    for (const start of starts) {
      const end = other(start);

      test.describe(`${template}, loaded in ${start}`, () => {
        test.use({ colorScheme: start, viewport: WIDE });

        test(`switching ${start} to ${end} and back ${point} redraws the stage in each theme at the same step`, async ({ browser, dailyPage, dailyStage }) => {
          const ctx = `${template}, loaded in ${start}, ${point}`;
          const fresh = {
            [start]: await viewInFreshPage(browser, start, challenge, (daily) => play(daily, `${ctx} (fresh ${start} reference)`), ctx),
            [end]: await viewInFreshPage(browser, end, challenge, (daily) => play(daily, `${ctx} (fresh ${end} reference)`), ctx),
          } as Record<Theme, Awaited<ReturnType<typeof viewInFreshPage>>>;
          expect(
            fresh[start].looks,
            `${ctx}: a fresh ${start} page and a fresh ${end} page should draw the stage differently, or this test checks nothing`,
          ).not.toEqual(fresh[end].looks);

          await dailyPage.serve(challenge);
          await dailyPage.open();
          await dailyStage.expectTheme(start, ctx);
          await play(dailyPage, ctx);
          const before = await dailyStage.settledView(`${ctx}, before switching theme`);
          expect(
            before.looks,
            `${ctx}: before any switch, the stage should look like a fresh ${start} page at the same point (${before.step})`,
          ).toEqual(fresh[start].looks);

          for (const [from, to] of [[start, end], [end, start]] as const) {
            const switched = `${ctx}, after switching ${from} to ${to} at "${before.step}"`;
            await dailyStage.switchTheme(to, switched);
            await dailyStage.expectLooks(
              fresh[to].looks,
              `${switched}: every stage should redraw in ${to} at once, so its background and the fill and stroke of each drawn shape equal a fresh ${to} page at the same point. Still showing the ${from} look means the stage kept the old theme. The fresh ${from} look was ${JSON.stringify(fresh[from].looks)}`,
            );
            const after = await dailyStage.settledView(switched);
            expect(after.step, `${switched}: switching theme must keep the playback where it was`).toBe(before.step);
            expect(
              contentDifferences(before.contents, after.contents),
              `${switched}: switching theme must keep what each stage shows (each drawn number and where it is), only recoloured`,
            ).toEqual([]);
          }
        });
      });
    }
  }

  /**
   * Switching theme while the first try is still being played for the first time (not yet scored).
   * The try is the served arrangement [8, 1, 6, 3, 2, 7, 4, 5], 30 comparisons, played at 5× so it ends in about 12 s.
   */
  test.describe(`quicksort bars, ${DAILY_12.name}, switching theme during the first try`, () => {
    test.use({ colorScheme: 'light', viewport: WIDE });

    type MidTry = { name: string; finalTheme: Theme; act: (daily: DailyPage, stage: DailyStageView, context: string) => Promise<void> };
    const midTry: MidTry[] = [
      {
        name: 'while it plays',
        finalTheme: 'dark',
        act: async (_daily, stage, context) => stage.switchTheme('dark', context),
      },
      {
        name: 'while it is paused, then resuming',
        finalTheme: 'dark',
        act: async (daily, stage, context) => {
          await daily.transport.pause();
          await stage.expectPlaybackButton('Play', true, `${context}: after Pause, the play button should offer Play`);
          const step = await stage.stepText(`${context}, paused`);
          await stage.switchTheme('dark', `${context}, paused at "${step}"`);
          await stage.expectStepText(step, `${context}: switching theme while paused must keep the playback at "${step}"`);
          await stage.expectPlaybackButton('Play', true, `${context}: switching theme while paused must leave the try paused (Play offered)`);
          await daily.transport.play();
        },
      },
      {
        name: 'twice in a row while it plays',
        finalTheme: 'light',
        act: async (_daily, stage, context) => {
          await stage.switchTheme('dark', `${context}, first switch`);
          await stage.switchTheme('light', `${context}, second switch`);
        },
      },
    ];

    for (const { name, finalTheme, act } of midTry) {
      test(`switching theme ${name} records exactly one try, with its count, drawn in the new theme`, async ({ browser, dailyPage, dailyHistory, dailyStage, dailyTemplate }) => {
        const { start } = DAILY_12;
        const ctx = `${DAILY_12.name} try 1 [${start.values.join(', ')}] (${start.count} comparisons), switching theme ${name}`;
        const fresh = await viewInFreshPage(browser, finalTheme, QUICKSORT_DAY, (daily) => runAndSkip(daily, `${ctx} (fresh ${finalTheme} reference)`), ctx);

        await dailyHistory.serveOnly(QUICKSORT_DAY);
        await dailyPage.open();
        await dailyStage.expectTheme('light', ctx);
        await dailyPage.expectStatusNumber('Tries left', 3, `${ctx}: before Run`);
        await dailyPage.transport.setSpeed(5);
        await dailyPage.run();
        await dailyStage.expectPlaybackButton('Pause', true, `${ctx}: right after Run the try should be playing (Pause offered)`);
        await act(dailyPage, dailyStage, ctx);
        expect(
          await dailyPage.roundedProgress(ctx),
          `${ctx}: the theme switch should have happened mid-try (Animation progress below 100), or this test checks nothing`,
        ).toBeLessThan(100);

        await dailyPage.waitForRunToFinish();
        const done = `${ctx}, after the try played to its end`;
        await dailyPage.expectStatusNumber('Tries left', 2, `${done}: switching theme mid-try must not use a second try or lose the first, so Tries left goes 3 -> 2`);
        await dailyTemplate.expectTryChips([`${start.count}`], done);
        const { raw, parsed } = await dailyHistory.savedHistory();
        expect(
          parsed?.results?.[QUICKSORT_DAY.date]?.tries?.map((saved) => saved.score),
          `${done}: localStorage history should hold exactly one try for ${QUICKSORT_DAY.date}, scored ${start.count}, got ${raw}`,
        ).toEqual([start.count]);
        await dailyPage.expectStatusNumber('Comparisons', start.count, `${done}: Comparisons should show the try's ${start.count}`);
        await dailyPage.expectStatusNumber('Score', start.count, `${done}: Score should show the try's ${start.count}`);
        await expect.poll(() => dailyPage.canRun(), { message: `${done}: Run should be enabled again for try 2` }).toBe(true);
        await dailyStage.expectTheme(finalTheme, done);
        await dailyStage.expectLooks(
          fresh.looks,
          `${done}: the stage should be drawn in ${finalTheme}, like a fresh ${finalTheme} page at the end of the same run`,
        );
      });
    }

    for (const key of ['Enter', 'Space'] as const) {
      test(`pressing ${key} on the theme toggle while the try plays keeps keyboard focus on the toggle`, async ({ dailyPage, dailyStage }) => {
        const ctx = `${DAILY_12.name} try 1, pressing ${key} on the focused "Dark mode" toggle while the try plays`;
        await dailyPage.serve(DAILY_12.challenge);
        await dailyPage.open();
        await dailyPage.run();
        await dailyStage.expectPlaybackButton('Pause', true, `${ctx}: right after Run the try should be playing (Pause offered)`);
        const [{ background }] = await dailyStage.looks();
        await dailyStage.pressThemeToggle('dark', key, ctx);
        await dailyStage.expectStageBackgroundChanged(background, `${ctx}: the stage should redraw in dark`);
        await dailyStage.expectThemeToggleFocused(
          `${ctx}: after the stage redraws, keyboard focus should stay on the "Dark mode" toggle where the player put it, not move to Skip or anywhere else`,
        );
        const progress = await dailyPage.progress(ctx);
        expect(progress, `${ctx}: the switch should happen mid-try (Animation progress below 100)`).toBeLessThan(100);
        await expect
          .poll(() => dailyPage.progress(ctx), { message: `${ctx}: the try should keep playing after the switch (Animation progress above ${progress})` })
          .toBeGreaterThan(progress);
        await dailyStage.expectThemeToggleFocused(`${ctx}: as the try keeps playing, keyboard focus should still be on the "Dark mode" toggle`);
      });
    }
  });
});
