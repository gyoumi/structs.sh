import type { Page } from '@playwright/test';
import { test, expect } from '../support/test';
import type { DailyPage } from '../support/daily-page';
import type { DailyTemplatePage } from '../support/daily-template-page';
import { DailyLongList, narrowNodes, widthsOf } from '../support/daily-long-list';
import { DRIFT_26 } from '../support/daily-list-fixtures';
import { LONG_DRIFT } from '../support/daily-long-list-fixtures';
import { describeNodes, StageGeometry, type StageFrame } from '../support/stage-geometry';
import { WIDE } from '../support/stage-playback';

/**
 * Step 3f: long linked lists stay readable on a phone. Found in the 3e recorded run: Index drift with about
 * 40 inserts drew the 46-node list shrunk to fit the stage, an unreadable strip of 3px nodes on a 390px phone.
 *
 * The design the user chose:
 * 1. List nodes are never drawn smaller than the size they have when the list is short enough to fit: here,
 *    the 6-node start list of LONG_DRIFT on the same phone. A list that fits is drawn as before 3f.
 * 2. While a run plays, the stage keeps the node being walked in view (it pans along the list); when the run
 *    ends or is skipped it keeps the last node it showed in view.
 * 3. The player can drag the stage to see the rest of the list.
 * 4. The list stays one row, and only the daily stage changes: the visualiser's linked-list page is unchanged.
 *
 * A node's size is the on-screen width of its circle; "in view" means its circle lies inside the stage's box.
 * LONG_DRIFT is worked in daily-long-list-fixtures.ts. A later `serve` answers /api/daily in place of an earlier one.
 */

const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };
const DESKTOP = { viewport: WIDE };

/** The last operation, insert(99, 45), starts at about 77% of the run; seeking to 76% lands just before it. */
const BEFORE_LAST_OPERATION = 0.76;

/** Opens LONG_DRIFT, reads the start list's node width (before any run), and builds the 40 operations. */
async function openLongList(page: Page, dailyPage: DailyPage, dailyTemplate: DailyTemplatePage, context: string): Promise<{ list: DailyLongList; minWidth: number }> {
  await dailyPage.serve(LONG_DRIFT.challenge);
  await dailyTemplate.operations.open(context);
  const list = new DailyLongList(page);
  const start = await list.geometry.settled(`${context}, before Run`);
  expect(start.nodes.map((node) => node.value), `${context}: before Run the stage should draw the start list`).toEqual([...LONG_DRIFT.challenge.start]);
  const minWidth = Math.min(...start.nodes.map((node) => node.width));
  await dailyTemplate.operations.build(LONG_DRIFT.operations, LONG_DRIFT.listed, context);
  return { list, minWidth };
}

/** Every node is at least `minWidth` wide (less 0.5px). */
function expectReadable(frame: StageFrame, minWidth: number, message: string): void {
  const small = narrowNodes(frame, minWidth);
  const sample = small.slice(0, 5).map((node) => `${node.value} w${node.width}`).join(', ');
  expect(
    small.map((node) => node.value),
    `${message}: no list node should be drawn narrower than the ${minWidth}px the 6-node start list has on this phone, but ${small.length} of ${frame.nodes.length} are (${sample}${small.length > 5 ? ', ...' : ''}; widths drawn: ${widthsOf(frame.nodes)}px)`,
  ).toHaveLength(0);
}

/** Lists any node whose width is off `width` by more than 1px or that sits outside the stage. */
function drawnAsBeforeProblems(frame: StageFrame, width: number): string[] {
  const wrongWidth = frame.nodes
    .filter((node) => Math.abs(node.width - width) > 1)
    .map((node) => `${node.value} w${node.width} (expected ${width}±1)`);
  const outside = frame.nodes.filter((node) => !node.inside).map((node) => `${node.value} outside stage (${describeNodes(frame.nodes)})`);
  return [...wrongWidth, ...outside];
}

/** Runs the try at 5×, seeks to just before insert(99, 45), and plays on at 2× from there. */
async function playTheLastOperation(list: DailyLongList, dailyPage: DailyPage, context: string): Promise<void> {
  await list.transport.setSpeed(5);
  await dailyPage.run();
  await list.seekTo(BEFORE_LAST_OPERATION, `${context}, seeking to ${BEFORE_LAST_OPERATION * 100}% (just before insert(99, 45))`);
  await list.transport.setSpeed(2);
  await list.transport.play();
}

test.describe('daily long linked lists', () => {
  test.describe('on a 390x844 phone', () => {
    test.use(PHONE);

    test('after Skip, the 46-node list is drawn no smaller than the 6-node start list, in one row', async ({ page, dailyPage, dailyTemplate }) => {
      const ctx = `${LONG_DRIFT.name} on a 390x844 phone`;
      const { list, minWidth } = await openLongList(page, dailyPage, dailyTemplate, ctx);
      await dailyPage.run();
      await dailyPage.skip(ctx);
      const end = await list.geometry.settled(`${ctx}, Run then Skip`);
      expect(end.nodes.map((node) => node.value), `${ctx}, Run then Skip: the nodes left to right should be the final list`).toEqual([...LONG_DRIFT.final]);
      expectReadable(end, minWidth, `${ctx}, Run then Skip`);
      const ys = end.nodes.map((node) => node.y);
      expect(
        Math.max(...ys) - Math.min(...ys),
        `${ctx}, Run then Skip: the list should stay one row, so node centres differ in height by at most 4px (they are at y ${[...new Set(ys.map(Math.round))].join(', ')})`,
      ).toBeLessThanOrEqual(4);
    });

    test('while the run plays, the node curr walks stays on the stage at a readable size, and the appended node is in view at the end', async ({ page, dailyPage, dailyTemplate }) => {
      const ctx = `${LONG_DRIFT.name} on a 390x844 phone, playing the last operation insert(99, 45) at 2×`;
      const { list, minWidth } = await openLongList(page, dailyPage, dailyTemplate, ctx);
      await playTheLastOperation(list, dailyPage, ctx);
      const frames = await list.framesUntilEnd(ctx);
      const walking = frames.filter((frame) => frame.walked !== null);
      expect(walking.length, `${ctx}: curr should be seen walking the list in at least 20 reads 100 ms apart, or this test checks nothing (seen in ${walking.length} of ${frames.length})`).toBeGreaterThanOrEqual(20);
      const walkedFurthest = Math.max(...walking.map((frame) => LONG_DRIFT.final.indexOf(frame.walked?.value ?? -1)));
      expect(walkedFurthest, `${ctx}: curr should be seen past the middle of the list (furthest node index seen ${walkedFurthest})`).toBeGreaterThan(30);
      expect(
        list.followProblems(frames, minWidth),
        `${ctx}: while the run plays, every node should be drawn at least ${minWidth}px wide and the stage should keep the node curr points at in view, panning along the list`,
      ).toEqual([]);

      const end = await list.geometry.settled(`${ctx}, at the end of the run`);
      const appended = end.nodes.find((node) => node.value === LONG_DRIFT.appended);
      expect(
        appended?.inside,
        `${ctx}, at the end of the run: the node the run appended last (${LONG_DRIFT.appended}) should be in view (on stage: ${describeNodes(end.nodes.filter((node) => node.inside))})`,
      ).toBe(true);
      expectReadable(end, minWidth, `${ctx}, at the end of the run`);
    });

    test('after Skip in the middle of the walk, the node curr was on stays in view', async ({ page, dailyPage, dailyTemplate }) => {
      const ctx = `${LONG_DRIFT.name} on a 390x844 phone, playing insert(99, 45) at 2× until Nodes walked reaches 25, then Pause`;
      const { list, minWidth } = await openLongList(page, dailyPage, dailyTemplate, ctx);
      await playTheLastOperation(list, dailyPage, ctx);
      await expect
        .poll(() => dailyTemplate.statusNumber('Nodes walked', ctx), { timeout: 30_000, message: `${ctx}: Nodes walked should reach 25 as curr walks the list` })
        .toBeGreaterThanOrEqual(25);
      await list.transport.pause();
      const paused = await list.geometry.settled(`${ctx}, paused`);
      const walked = paused.walked;
      expect(walked, `${ctx}, paused: the stage should show curr pointing at a node`).not.toBeNull();
      expect(walked?.inside, `${ctx}, paused: the node curr points at (${walked?.value}) should be in view`).toBe(true);
      expectReadable(paused, minWidth, `${ctx}, paused`);

      const skipped = `${ctx}, then Skip`;
      await dailyPage.skip(skipped);
      const end = await list.geometry.settled(skipped);
      const node = end.nodes.find((n) => n.value === walked?.value);
      expect(
        node?.inside,
        `${skipped}: the node curr was on when Skip was pressed (${walked?.value}) should stay in view (on stage: ${describeNodes(end.nodes.filter((n) => n.inside))})`,
      ).toBe(true);
      expectReadable(end, minWidth, skipped);
    });

    test('the player can drag the stage to see the rest of the list', async ({ page, dailyPage, dailyTemplate }) => {
      const ctx = `${LONG_DRIFT.name} on a 390x844 phone, Run then Skip`;
      const { list, minWidth } = await openLongList(page, dailyPage, dailyTemplate, ctx);
      await dailyPage.run();
      await dailyPage.skip(ctx);
      const end = await list.geometry.settled(ctx);
      const shown = new Set(end.nodes.filter((node) => node.inside).map((node) => node.value));
      expect(
        shown.size,
        `${ctx}: at a readable size the 46-node list is wider than the stage, so some nodes should be off-stage before panning (all ${end.nodes.length} are on stage, ${widthsOf(end.nodes)}px wide)`,
      ).toBeLessThan(end.nodes.length);

      const revealed = new Set<number>();
      for (const dx of [250, -500]) {
        await list.geometry.drag(dx, 0);
        const now = await list.geometry.settled(`${ctx}, dragging the stage ${dx}px sideways`);
        expectReadable(now, minWidth, `${ctx}, after dragging the stage ${dx}px sideways`);
        now.nodes.filter((node) => node.inside && !shown.has(node.value)).forEach((node) => revealed.add(node.value));
      }
      expect(
        revealed.size,
        `${ctx}: dragging the stage 250px right and then 500px left should bring nodes that were off-stage into view (on stage before: ${[...shown].join(', ')})`,
      ).toBeGreaterThan(0);
    });
  });

  /**
   * Lists that fit the stage are drawn as before 3f. The widths were measured on d6d399f7 (the build before
   * 3f), with every node inside the stage: on a 390x844 phone the 4-node DRIFT_26 list drew 35.3px nodes and
   * the 6-node LONG_DRIFT start list 24.3px; at 1440x900 both drew 48px nodes.
   */
  const SHORT_LISTS = [
    { device: '390x844 phone', use: PHONE, drift26: 35.3, sixNodes: 24.3 },
    { device: '1440x900 desktop', use: DESKTOP, drift26: 48, sixNodes: 48 },
  ];
  for (const { device, use, drift26, sixNodes } of SHORT_LISTS) {
    test.describe(`on a ${device}`, () => {
      test.use(use);

      test('a short list is drawn as before, every node in view', async ({ page, dailyPage, dailyTemplate }) => {
        const stage = new StageGeometry(page);

        const six = `${LONG_DRIFT.name} on a ${device}, before Run (6-node start list)`;
        await dailyPage.serve(LONG_DRIFT.challenge);
        await dailyTemplate.operations.open(six);
        expect(drawnAsBeforeProblems(await stage.settled(six), sixNodes), `${six}: every node should be ${sixNodes}px wide (±1) and inside the stage, as before 3f`).toEqual([]);

        const { challenge, cheap } = DRIFT_26;
        const ctx = `${DRIFT_26.name} on a ${device} (start [${challenge.start.join(', ')}]), operations ${cheap.listed.join(', ')}`;
        await dailyPage.serve(challenge);
        await dailyTemplate.operations.open(ctx);
        expect(
          drawnAsBeforeProblems(await stage.settled(`${ctx}, before Run`), drift26),
          `${ctx}, before Run: every node should be ${drift26}px wide (±1) and inside the stage, as before 3f`,
        ).toEqual([]);
        await dailyTemplate.operations.build(cheap.operations, cheap.listed, ctx);
        await dailyPage.run();
        await dailyPage.skip(ctx);
        expect(
          drawnAsBeforeProblems(await stage.settled(`${ctx}, Run then Skip`), drift26),
          `${ctx}, Run then Skip: every node should be ${drift26}px wide (±1) and inside the stage, as before 3f`,
        ).toEqual([]);
      });
    });
  }
});

/**
 * The visualiser's own linked-list page keeps shrinking a long list to fit its stage. Measured on d6d399f7:
 * a 20-node list drew 6.6px nodes on a 390x844 phone and 15.8px nodes at 1440x900, every node inside the stage.
 */
test.describe('visualiser linked list layout', () => {
  const TWENTY = Array.from({ length: 20 }, (_, i) => 10 + i * 3);
  for (const { device, use, width } of [
    { device: '390x844 phone', use: PHONE, width: 6.6 },
    { device: '1440x900 desktop', use: DESKTOP, width: 15.8 },
  ]) {
    test.describe(`on a ${device}`, () => {
      test.use(use);

      test('a 20-node list still fits the stage, and stays fitted after an append', async ({ page, visualiser }) => {
        const stage = new StageGeometry(page);
        const ctx = `/visualiser/linked-lists with 20 nodes [${TWENTY.join(', ')}] on a ${device}`;
        await visualiser.open('linked-lists', TWENTY);
        const open = await stage.settled(ctx);
        expect(open.nodes.map((node) => node.value), `${ctx}: the drawing should show the 20 nodes`).toEqual(TWENTY);
        expect(drawnAsBeforeProblems(open, width), `${ctx}: every node should be ${width}px wide (±1) and inside the stage, as before 3f`).toEqual([]);

        const appended = `${ctx}, append(90) then Skip to the end`;
        await visualiser.runToEnd('append', 90);
        const end = await stage.settled(appended);
        expect(end.nodes.map((node) => node.value), `${appended}: the drawing should show the 21 nodes`).toEqual([...TWENTY, 90]);
        expect(end.nodes.filter((node) => !node.inside).map((node) => node.value), `${appended}: every node should still be inside the stage`).toEqual([]);
      });
    });
  }
});
