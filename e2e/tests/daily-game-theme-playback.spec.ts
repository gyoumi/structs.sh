import { test, expect } from '../support/test';
import { DAILY_12, type DailyChallenge } from '../support/daily-fixtures';
import type { DailyPage } from '../support/daily-page';
import type { DailyStageView } from '../support/daily-stage-view';
import { DRIFT_26 } from '../support/daily-list-fixtures';
import { placementDifferences, describeNodes, StageGeometry } from '../support/stage-geometry';
import { StagePlayback, WIDE } from '../support/stage-playback';
import { FORCED_24 } from '../support/daily-tree-fixtures';

/**
 * Step 3f: a theme switch on /daily keeps the playback as it was. Since #88 a theme switch restarts the
 * shown run in the new theme and returns to the same point. Two gaps the reviews of #88 left open:
 *
 * 1. After Next step, switching theme while that one step animates turned it into continuous playback.
 *    It must stop at the end of the step ("Step N+1 of M", Play offered), as it would without the switch.
 * 2. Manual pan and zoom of the stage (dragging it, the mouse wheel) must survive the switch: after a run,
 *    before any run, and after editing the input (which draws the new arrangement).
 *
 * Pages load in light and switch to dark. 1440 wide, for the "Step N of M" readout (shown above 1360px).
 * Steps are played at 0.25× so one Next step lasts about 3 seconds, long enough to switch theme during it.
 */

interface Template {
  name: string;
  challenge: DailyChallenge;
}

const TEMPLATES: Template[] = [
  { name: `quicksort bars, ${DAILY_12.name}`, challenge: DAILY_12.challenge },
  { name: `one BST, ${FORCED_24.name}`, challenge: FORCED_24.challenge },
];

/** Opens the challenge, runs try 1 on the served arrangement and skips to its end. */
const runAndSkip = async (dailyPage: DailyPage, challenge: DailyChallenge, context: string) => {
  await dailyPage.serve(challenge);
  await dailyPage.open();
  await dailyPage.run();
  await dailyPage.skip(context);
};

const fmt = (values: readonly number[]) => `[${values.join(', ')}]`;

/**
 * Drags the stage 70px right and 25px down and turns the mouse wheel 240 up (zoom in) over its centre, then
 * switches light to dark: every drawn number should stay where the pan and zoom put it, and the step readout as it was.
 */
async function expectPanAndZoomSurviveSwitch(stage: StageGeometry, dailyStage: DailyStageView, ctx: string): Promise<void> {
  const fitted = await stage.settled(`${ctx}, before panning`);
  const moved = `${ctx}, stage dragged 70px right and 25px down, then mouse wheel turned 240 up (zoom in) over its centre`;
  await stage.drag(70, 25);
  await stage.wheel(-240);
  const panned = await stage.settled(moved);
  expect(
    placementDifferences(fitted.nodes, panned.nodes),
    `${moved}: dragging and zooming should move the drawing, or this test checks nothing (drawn before: ${describeNodes(fitted.nodes)})`,
  ).not.toEqual([]);
  const step = await dailyStage.stepText(moved);
  const [{ background }] = await dailyStage.looks();

  const switched = `${moved}, then switching light to dark`;
  await dailyStage.switchTheme('dark', switched);
  await dailyStage.expectStageBackgroundChanged(background, `${switched}: the stage should redraw in dark`);
  const after = await stage.settled(switched);
  expect(
    placementDifferences(panned.nodes, after.nodes),
    `${switched}: every drawn number should stay where the player's pan and zoom put it (within 3px, same size). Numbers back where the stage first fitted them (${describeNodes(fitted.nodes)}) mean the switch dropped the pan and zoom`,
  ).toEqual([]);
  await dailyStage.expectStepText(step, `${switched}: the playback should stay at "${step}"`);
}

test.describe('daily game theme switch keeps playback', () => {
  test.use({ colorScheme: 'light', viewport: WIDE });

  for (const { name, challenge } of TEMPLATES) {
    test(`${name}: switching theme while one Next step animates stops at the end of that step`, async ({ page, dailyPage, dailyStage }) => {
      const ctx = `${name}, try 1 run and skipped, Back to the start, speed 0.25×, Next step to step 1`;
      const playback = new StagePlayback(page);
      await runAndSkip(dailyPage, challenge, ctx);
      await dailyPage.transport.rewind();
      await dailyPage.transport.setSpeed(0.25);
      await playback.stepTo(1, ctx);
      const at = await playback.position(ctx);
      expect(at?.step, `${ctx}: the playback should show "Step 1 of M"`).toBe(1);

      const switched = `${ctx}, then Next step and switching light to dark while that step animates`;
      await playback.startOneStep(switched);
      await dailyStage.switchTheme('dark', switched);
      await playback.expectState(
        { button: 'Play', step: `Step 2 of ${at?.of}` },
        `${switched}: playback should stop at the end of that one step, paused at "Step 2 of ${at?.of}" with Play offered, as it does without a theme switch. Still offering Pause, or a later step, means the switch turned the single step into continuous playback`,
        12_000,
      );
      await playback.expectProgressStays(`${switched}, after the step ended`);
      await dailyStage.expectTheme('dark', switched);
    });
  }

  test(`quicksort bars, ${DAILY_12.name}: switching theme right after Previous step keeps that step, paused`, async ({ page, dailyPage, dailyStage }) => {
    const ctx = `quicksort bars, ${DAILY_12.name}, try 1 run and skipped, Back to the start, Next step to step 3, then Previous step`;
    const playback = new StagePlayback(page);
    await runAndSkip(dailyPage, DAILY_12.challenge, ctx);
    await dailyPage.transport.rewind();
    await playback.stepTo(3, ctx);
    const at = await playback.position(ctx);
    expect(at?.step, `${ctx}: the playback should show "Step 3 of M"`).toBe(3);
    await dailyPage.transport.stepBack();
    await playback.expectState({ button: 'Play', step: `Step 2 of ${at?.of}` }, `${ctx}: Previous step from step 3 should show step 2, paused`);
    await dailyStage.switchTheme('dark', `${ctx}, switching light to dark`);
    await playback.expectState(
      { button: 'Play', step: `Step 2 of ${at?.of}` },
      `${ctx}, then switching light to dark: playback should stay paused at "Step 2 of ${at?.of}"`,
    );
    await playback.expectProgressStays(`${ctx}, after the switch`);
  });

  for (const { name, challenge } of TEMPLATES) {
    test(`${name}: a stage the player dragged and zoomed keeps its pan and zoom through a theme switch`, async ({ page, dailyPage, dailyStage }) => {
      const ctx = `${name}, try 1 run and skipped`;
      await runAndSkip(dailyPage, challenge, ctx);
      expect(await dailyPage.roundedProgress(ctx), `${ctx}: test setup: the run should be at its end (Animation progress 100)`).toBe(100);
      await expectPanAndZoomSurviveSwitch(new StageGeometry(page), dailyStage, ctx);
    });
  }

  test(`quicksort bars, ${DAILY_12.name}: a stage dragged and zoomed before any run keeps its pan and zoom through a theme switch`, async ({ page, dailyPage, dailyStage }) => {
    const ctx = `quicksort bars, ${DAILY_12.name}, before any run (the served ${fmt(DAILY_12.start.values)} drawn)`;
    await dailyPage.serve(DAILY_12.challenge);
    await dailyPage.open();
    await expect.poll(() => dailyPage.drawnValues(), { message: `${ctx}: test setup: the stage should draw the served arrangement` }).toEqual([...DAILY_12.start.values]);
    await expectPanAndZoomSurviveSwitch(new StageGeometry(page), dailyStage, ctx);
  });

  test(`index drift, ${DRIFT_26.name}: a stage dragged and zoomed before any run keeps its pan and zoom through a theme switch`, async ({ page, dailyPage, dailyTemplate, dailyStage }) => {
    const ctx = `index drift, ${DRIFT_26.name}, before any run (the start list ${fmt(DRIFT_26.challenge.start)} drawn)`;
    const stage = new StageGeometry(page);
    await dailyPage.serve(DRIFT_26.challenge);
    await dailyTemplate.operations.open(ctx);
    expect((await stage.settled(ctx)).nodes.map((node) => node.value), `${ctx}: test setup: the stage should draw the start list`).toEqual([...DRIFT_26.challenge.start]);
    await expectPanAndZoomSurviveSwitch(stage, dailyStage, ctx);
  });

  test(`quicksort bars, ${DAILY_12.name}: a stage dragged and zoomed after editing the input keeps its pan and zoom through a theme switch`, async ({ page, dailyPage, dailyStage }) => {
    const { goal } = DAILY_12;
    const ctx = `quicksort bars, ${DAILY_12.name}, before any run, slots ${goal.swap.join(' and ')} swapped so the stage draws ${fmt(goal.values)}`;
    await dailyPage.serve(DAILY_12.challenge);
    await dailyPage.open();
    await dailyPage.swap(goal.swap[0], goal.swap[1]);
    await expect.poll(() => dailyPage.drawnValues(), { message: `${ctx}: test setup: the stage should draw the edited arrangement` }).toEqual([...goal.values]);
    await expectPanAndZoomSurviveSwitch(new StageGeometry(page), dailyStage, ctx);
  });
});
