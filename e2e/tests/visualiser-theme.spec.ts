import { test, expect } from '../support/test';
import { contentDifferences } from '../support/daily-stage-view';
import { describeNodes, placementDifferences, StageGeometry } from '../support/stage-geometry';
import { StagePlayback, viewVisualiserInFreshPage, VisualiserStageView, WIDE } from '../support/stage-playback';
import type { TopicSlug } from '../support/topics';
import type { VisualiserPage } from '../support/visualiser-page';

/**
 * Step 3f: a visualiser page keeps its run on a theme switch, as /daily does since #88. Today switching
 * light/dark after or during an operation's run redraws the drawing in the new theme but drops the run
 * (the readout goes back to "No steps yet"). Expected: the drawing redraws in the new theme at once and
 * the run stays at the same step, playing if it was playing and paused if it was paused, and Replay,
 * stepping and seeking still work. The /daily fixes of step 3f apply too: a single Next step stays a single
 * step through a switch, and the player's pan and zoom survive it.
 *
 * The new theme's look is read from a fresh page loaded in that theme (a new browser context with that
 * system colour scheme) and played to the same point: the stage's background and the fill and stroke of
 * every visible shape must match. Pages load in light. 1440 wide, for the "Step N of M" readout.
 */

interface Operation {
  topic: TopicSlug;
  data: number[];
  command: string;
  args: number[];
  /** How the run reads in failure messages. */
  name: string;
}

const OPERATIONS: Operation[] = [
  { topic: 'linked-lists', data: [10, 20, 30], command: 'append', args: [40], name: '/visualiser/linked-lists [10, 20, 30], append(40)' },
  { topic: 'binary-search-trees', data: [20, 10, 30], command: 'insert', args: [25], name: '/visualiser/binary-search-trees [20, 10, 30], insert(25)' },
];

test.describe('visualiser theme switch keeps the run', () => {
  test.use({ colorScheme: 'light', viewport: WIDE });

  for (const op of OPERATIONS) {
    const runToEnd = (visualiser: VisualiserPage) => visualiser.runToEnd(op.command, ...op.args);
    /** The run, skipped to its end, then Back to the start and two Next steps: paused mid-run. */
    const pausedAtStep2 = async (visualiser: VisualiserPage, context: string) => {
      await runToEnd(visualiser);
      await visualiser.transport.rewind();
      await new StagePlayback(visualiser.page).stepTo(2, context);
    };

    test(`${op.name}: switching theme after the run keeps it at its end, and Replay and stepping still work`, async ({ browser, page, visualiser }) => {
      const ctx = `${op.name}, played to its end (Skip to the end)`;
      const view = new VisualiserStageView(page);
      const playback = new StagePlayback(page);
      const fresh = await viewVisualiserInFreshPage(browser, 'dark', op.topic, op.data, runToEnd, ctx);
      await visualiser.open(op.topic, op.data);
      await runToEnd(visualiser);
      const before = await view.settledView(ctx);

      const switched = `${ctx}, then switching light to dark`;
      await view.switchTheme('dark', switched);
      await view.expectLooks(fresh.looks, `${switched}: the drawing should redraw in dark at once, like a fresh dark page at the end of the same run`);
      const after = await view.settledView(switched);
      expect(after.step, `${switched}: the run should stay at its end ("${before.step}"); "No steps yet" means the switch dropped the run`).toBe(before.step);
      expect(contentDifferences(before.contents, after.contents), `${switched}: the drawing should show the same numbers in the same places, only recoloured`).toEqual([]);
      await playback.expectState({ button: 'Replay', step: before.step }, `${switched}: the play button should still offer Replay`);

      await playback.transport.replay();
      await expect
        .poll(() => playback.transport.progress(switched), { message: `${switched}, then Replay: Animation progress should drop below 100 as the run plays again` })
        .toBeLessThan(100);
      await playback.expectState({ button: 'Replay', step: before.step }, `${switched}, then Replay: the run should play to its end again`, 30_000);
      const end = await playback.position(switched);
      await playback.transport.stepBack();
      await playback.expectState(
        { button: 'Play', step: `Step ${(end?.step ?? 1) - 1} of ${end?.of}` },
        `${switched}, Replay to the end, then Previous step: should go back one step, paused`,
      );
    });

    test(`${op.name}: switching theme while the run plays keeps it playing on to its end`, async ({ browser, page, visualiser }) => {
      const ctx = `${op.name}, run at 1× and switched light to dark while it plays`;
      const view = new VisualiserStageView(page);
      const playback = new StagePlayback(page);
      const fresh = await viewVisualiserInFreshPage(browser, 'dark', op.topic, op.data, runToEnd, ctx);
      await visualiser.open(op.topic, op.data);
      await visualiser.run(op.command, ...op.args);
      await view.expectPlaybackButton('Pause', true, `${ctx}: right after Run the operation should be playing (Pause offered)`);
      const at = await playback.position(ctx);
      const progress = await playback.transport.progress(ctx);
      expect(progress, `${ctx}: the switch should happen mid-run (Animation progress below 100), or this test checks nothing`).toBeLessThan(100);

      await view.switchTheme('dark', ctx);
      await expect
        .poll(async () => (await playback.state(ctx)).button, {
          timeout: 2_000,
          message: `${ctx}: right after the switch the run should still be playing (Pause offered); Play with "No steps yet" means the switch dropped the run`,
        })
        .toBe('Pause');
      const after = await playback.position(ctx);
      expect(after?.of, `${ctx}: right after the switch the readout should still count the run's ${at?.of} steps ("No steps yet" means the run was dropped)`).toBe(at?.of);
      expect(after?.step ?? -1, `${ctx}: the switch should not send the run back before step ${at?.step} (now at step ${after?.step})`).toBeGreaterThanOrEqual(at?.step ?? 0);
      await expect
        .poll(() => playback.transport.progress(ctx), { message: `${ctx}: the run should keep playing after the switch (Animation progress above ${progress})` })
        .toBeGreaterThan(progress);
      await playback.expectState({ button: 'Replay', step: fresh.step }, `${ctx}: the run should play on to its end ("${fresh.step}", Replay offered)`, 30_000);
      await view.expectLooks(fresh.looks, `${ctx}, at the end: the drawing should be in dark, like a fresh dark page at the end of the same run`);
    });

    test(`${op.name}: switching theme while the run is paused keeps it paused at that step, and stepping and Play still work`, async ({ browser, page, visualiser }) => {
      const ctx = `${op.name}, played to its end, Back to the start, Next step to step 2 (paused)`;
      const view = new VisualiserStageView(page);
      const playback = new StagePlayback(page);
      const fresh = await viewVisualiserInFreshPage(browser, 'dark', op.topic, op.data, (v) => pausedAtStep2(v, `${ctx} (fresh dark page)`), ctx);
      await visualiser.open(op.topic, op.data);
      await pausedAtStep2(visualiser, ctx);
      const before = await view.settledView(ctx);

      const switched = `${ctx}, then switching light to dark`;
      await view.switchTheme('dark', switched);
      await view.expectLooks(fresh.looks, `${switched}: the drawing should redraw in dark at once, like a fresh dark page paused at the same step. Missing highlight colours mean the switch dropped the run and redrew the plain structure`);
      const after = await view.settledView(switched);
      expect(after.step, `${switched}: the run should stay at "${before.step}"; "No steps yet" means the switch dropped the run`).toBe(before.step);
      expect(contentDifferences(before.contents, after.contents), `${switched}: the drawing should show the same numbers in the same places, only recoloured`).toEqual([]);
      await playback.expectState({ button: 'Play', step: before.step }, `${switched}: the run should stay paused (Play offered)`);

      const at = await playback.position(switched);
      await playback.transport.stepForward();
      await playback.expectState(
        { button: 'Play', step: `Step ${(at?.step ?? 0) + 1} of ${at?.of}` },
        `${switched}, then Next step: should move one step on and stop`,
        20_000,
      );
      await playback.transport.play();
      await playback.expectState({ button: 'Replay', step: `Step ${at?.of} of ${at?.of}` }, `${switched}, then Play: the run should play on to its end`, 30_000);
    });

    test(`${op.name}: switching theme while one Next step animates stops at the end of that step`, async ({ page, visualiser }) => {
      const ctx = `${op.name}, played to its end, Back to the start, speed 0.25×, Next step to step 1`;
      const view = new VisualiserStageView(page);
      const playback = new StagePlayback(page);
      await visualiser.open(op.topic, op.data);
      await runToEnd(visualiser);
      await visualiser.transport.rewind();
      await visualiser.transport.setSpeed(0.25);
      await playback.stepTo(1, ctx);
      const at = await playback.position(ctx);

      const switched = `${ctx}, then Next step and switching light to dark while that step animates`;
      await playback.startOneStep(switched);
      await view.switchTheme('dark', switched);
      await playback.expectState(
        { button: 'Play', step: `Step 2 of ${at?.of}` },
        `${switched}: playback should stop at the end of that one step, paused at "Step 2 of ${at?.of}" with Play offered. "No steps yet" means the switch dropped the run; Pause or a later step means it turned the step into continuous playback`,
        12_000,
      );
      await playback.expectProgressStays(`${switched}, after the step ended`);
    });
  }

  const zooms: { op: Operation; how: string; zoom: (stage: StageGeometry, context: string) => Promise<void> }[] = [
    { op: OPERATIONS[0], how: 'the "Zoom in" button clicked', zoom: (stage, context) => stage.clickZoomIn(context) },
    { op: OPERATIONS[1], how: 'the mouse wheel turned 240 up over the stage', zoom: (stage) => stage.wheel(-240) },
  ];
  for (const { op, how, zoom } of zooms) {
    test(`${op.name}: a drawing the player dragged and zoomed keeps its pan and zoom through a theme switch`, async ({ page, visualiser }) => {
      const ctx = `${op.name}, played to its end`;
      const view = new VisualiserStageView(page);
      const stage = new StageGeometry(page);
      await visualiser.open(op.topic, op.data);
      await visualiser.runToEnd(op.command, ...op.args);
      const fitted = await stage.settled(`${ctx}, before panning`);

      const moved = `${ctx}, ${how}, then the drawing dragged 60px left and 30px down`;
      await zoom(stage, moved);
      await stage.drag(-60, 30);
      const panned = await stage.settled(moved);
      expect(
        placementDifferences(fitted.nodes, panned.nodes),
        `${moved}: zooming and dragging should move the drawing, or this test checks nothing (drawn before: ${describeNodes(fitted.nodes)})`,
      ).not.toEqual([]);
      const [{ background }] = await view.looks();

      const switched = `${moved}, then switching light to dark`;
      await view.switchTheme('dark', switched);
      await view.expectStageBackgroundChanged(background, `${switched}: the drawing should redraw in dark`);
      const after = await stage.settled(switched);
      expect(
        placementDifferences(panned.nodes, after.nodes),
        `${switched}: every drawn number should stay where the player's pan and zoom put it (within 3px, same size). Numbers back where the stage first fitted them (${describeNodes(fitted.nodes)}) mean the switch dropped the pan and zoom`,
      ).toEqual([]);
    });
  }
});
