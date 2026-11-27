import { test, expect } from '../support/test';
import { describeSlots, keysOf, type DrawnSlot, type HashTableState } from '../support/hash-table-page';
import { watchPageErrors } from '../support/page-errors';
import { viewVisualiserInFreshPage, VisualiserStageView, WIDE } from '../support/stage-playback';

/**
 * Checkpoint 3 of docs/hash-table.md: the linear-probing hash table at /visualiser/hash-tables.
 * 11 buckets, h(k) = k % 11, probing +1 and wrapping from bucket 10 to 0. Deleting leaves a DEL
 * tombstone (dashed border) that searches probe past and inserts reuse. The steps come from the
 * Rust runner in challenges.wasm, so the page loads that first and offers Retry if it fails.
 *
 * Tables used here (from share links, so each test starts the same):
 * - CHAIN, the link 122334: 12, 23 and 34 all hash to 1, so they sit in buckets 1, 2 and 3.
 * - TOMBSTONE, the link s--12xx34--------------: CHAIN after delete(23), bucket 2 is DEL.
 */

const CHAIN = [12, 23, 34];
const TOMBSTONE = 's--12xx34--------------';
const show = (value: unknown) => JSON.stringify(value);

/** The table written as describeSlots writes it: `table({ 1: 12, 2: 'DEL' })` is "0:_ 1:12 2:DEL 3:_ ... 10:_". */
const table = (filled: Record<number, number | 'DEL'>): string =>
  Array.from({ length: 11 }, (_, i) => `${i}:${filled[i] ?? '_'}`).join(' ');

/** The buckets highlighted across `steps`, in the order the probe visited them. */
const probeOrder = (steps: HashTableState[]): number[] =>
  steps.flatMap((step) => step.highlighted).filter((index, i, all) => i === 0 || all[i - 1] !== index);

/** What a user compares between two moments: the table, banner, probe highlight and C line. */
const summary = (state: HashTableState) => ({
  table: describeSlots(state.slots),
  banner: state.banner,
  highlighted: state.highlighted,
  codeLine: state.codeLine,
});

/** Checks a drawn table is one linear probing could build: every key sits at or after its home bucket with no gap. */
const expectReachable = (slots: DrawnSlot[], context: string) => {
  for (const slot of slots.filter((s) => s.kind === 'occupied')) {
    const key = Number(slot.value);
    for (let i = key % 11; i !== slot.index; i = (i + 1) % 11) {
      expect(slots[i].kind, `${context}: key ${key} in bucket ${slot.index} was probed past bucket ${i}, which should be full (${describeSlots(slots)})`).not.toBe('empty');
    }
  }
};

/** Checks a generated table: 5 or 6 distinct keys from 0 to 99, at least two sharing a home bucket, no tombstones. */
const expectGeneratedTable = (slots: DrawnSlot[], context: string) => {
  const keys = keysOf(slots);
  const drawn = describeSlots(slots);
  expect(keys.length, `${context}: number of keys stored (${drawn})`).toBeGreaterThanOrEqual(5);
  expect(keys.length, `${context}: number of keys stored (${drawn})`).toBeLessThanOrEqual(6);
  expect(new Set(keys).size, `${context}: keys should be distinct (${drawn})`).toBe(keys.length);
  expect(keys.every((key) => key >= 0 && key <= 99), `${context}: every key should be from 0 to 99 (${drawn})`).toBe(true);
  const homes = keys.map((key) => key % 11);
  expect(new Set(homes).size, `${context}: at least two keys should share a home bucket k % 11 (homes ${show(homes)}, table ${drawn})`).toBeLessThan(keys.length);
  expect(slots.filter((s) => s.kind === 'tombstone').map((s) => s.index), `${context}: DEL buckets in a new table (${drawn})`).toEqual([]);
  expectReachable(slots, context);
};

test.describe('hash table', () => {
  test('opens with 11 numbered buckets holding 5 or 6 keys, two of them colliding', async ({ visualiser, hashTable }) => {
    const ctx = '/visualiser/hash-tables (no data in the link)';
    await visualiser.open('hash-tables');
    const state = await hashTable.settled(ctx);
    expect(state.slots.map((slot) => slot.label), `${ctx}: the numbers drawn under the buckets`).toEqual(
      Array.from({ length: 11 }, (_, i) => String(i)),
    );
    expectGeneratedTable(state.slots, ctx);
    expect(state.banner, `${ctx}: the banner above the buckets should give the hash function`).toContain('% 11');
    expect(await visualiser.values(), `${ctx}: the values drawn, left to right, should be the stored keys without the bucket numbers`).toEqual(
      keysOf(state.slots),
    );
  });

  test('insert shows h(k) = k % 11 and the probe count, and wraps from bucket 10 to bucket 0', async ({ visualiser, hashTable }) => {
    const ctx = '/visualiser/hash-tables/10 (10 in bucket 10), insert(21): 21 % 11 = 10 is taken, so it wraps to bucket 0';
    await visualiser.open('hash-tables', [10]);
    await visualiser.runToEnd('insert', 21);
    const end = await hashTable.settled(`${ctx}, at the end`);
    expect(describeSlots(end.slots), `${ctx}, at the end: the buckets`).toBe(table({ 0: 21, 10: 10 }));
    expect(end.banner, `${ctx}, at the end: the banner should give the hash`).toContain('h(21) = 21 % 11 = 10');
    expect(end.banner, `${ctx}, at the end: the banner should count 2 probes (bucket 10, then 0)`).toContain('Probes: 2');
    expect(end.banner, `${ctx}, at the end: the banner should give the outcome`).toContain('Placed at slot 0');

    const steps = await hashTable.stepThrough(ctx);
    const banners = steps.map((step) => step.banner);
    expect(probeOrder(steps), `${ctx}: buckets highlighted while probing, in order (banners ${show(banners)})`).toEqual([10, 0]);
    const probes = banners.map((banner) => Number(banner.match(/Probes: (\d+)/)?.[1] ?? -1));
    expect(probes, `${ctx}: the probe count in each step's banner (${show(banners)})`).toEqual([...probes].sort((a, b) => a - b));
    expect(probes, `${ctx}: the probe count should reach 1 then 2 (${show(banners)})`).toEqual(expect.arrayContaining([1, 2]));
    expect(steps[0].wrapShown, `${ctx}, step 1 (${banners[0]}): the wrap arc should be hidden before any wrap`).toBe(false);

    const wrapped = steps.find((step) => step.banner.includes('wrap → 0'));
    expect(wrapped, `${ctx}: one step's banner should say "wrap → 0" (banners ${show(banners)})`).toBeDefined();
    expect(wrapped?.wrapShown, `${ctx}, the "wrap → 0" step (${wrapped?.banner}): the 10 → 0 wrap arc should be visible`).toBe(true);
    expect(wrapped?.highlighted, `${ctx}, the "wrap → 0" step: the highlighted bucket`).toEqual([0]);

    const placed = steps.findIndex((step) => step.slots[0].value === '21');
    expect(placed, `${ctx}: 21 should appear in bucket 0 only at the last step, after the probes (banners ${show(banners)})`).toBe(steps.length - 1);
    expect(placed, `${ctx}: placement should be animated after at least one probe step`).toBeGreaterThan(0);
  });

  test('inserting a key already present leaves the table as it was and says Already present', async ({ visualiser, hashTable }) => {
    const ctx = '/visualiser/hash-tables/122334, insert(23)';
    await visualiser.open('hash-tables', CHAIN);
    await visualiser.runToEnd('insert', 23);
    const end = await hashTable.settled(`${ctx}, at the end`);
    expect(describeSlots(end.slots), `${ctx}, at the end: the buckets should be unchanged`).toBe(table({ 1: 12, 2: 23, 3: 34 }));
    expect(end.banner, `${ctx}, at the end: the banner`).toContain('Already present');
  });

  test('search finds a key past collisions, and a missing key stops at an empty bucket', async ({ visualiser, hashTable }) => {
    const ctx = '/visualiser/hash-tables/122334';
    await visualiser.open('hash-tables', CHAIN);
    await visualiser.runToEnd('search', 34);
    const found = await hashTable.settled(`${ctx}, search(34)`);
    expect(found.banner, `${ctx}, search(34) at the end: the banner`).toContain('Found at slot 3');
    expect(found.highlighted, `${ctx}, search(34) at the end: the highlighted bucket`).toEqual([3]);
    expect(describeSlots(found.slots), `${ctx}, search(34): the buckets should be unchanged`).toBe(table({ 1: 12, 2: 23, 3: 34 }));

    const missing = `${ctx}, search(45): 45 % 11 = 1, probing 1, 2, 3 then the empty bucket 4`;
    await visualiser.runToEnd('search', 45);
    const end = await hashTable.settled(`${missing}, at the end`);
    expect(end.banner, `${missing}, at the end: the banner`).toContain('Not found');
    expect(describeSlots(end.slots), `${missing}: the buckets should be unchanged`).toBe(table({ 1: 12, 2: 23, 3: 34 }));
    const steps = await hashTable.stepThrough(missing);
    expect(probeOrder(steps), `${missing}: buckets highlighted, in order (banners ${show(steps.map((s) => s.banner))})`).toEqual([1, 2, 3, 4]);
  });

  test('delete leaves a dashed DEL that search probes past and the next colliding insert reuses', async ({ visualiser, hashTable }) => {
    const ctx = '/visualiser/hash-tables/122334';
    await visualiser.open('hash-tables', CHAIN);
    await visualiser.runToEnd('delete', 23);
    const deleted = await hashTable.settled(`${ctx}, delete(23)`);
    expect(describeSlots(deleted.slots), `${ctx}, delete(23): the buckets`).toBe(table({ 1: 12, 2: 'DEL', 3: 34 }));
    expect(deleted.banner, `${ctx}, delete(23): the banner`).toContain('marked DEL');
    const tomb = deleted.slots[2];
    expect({ dashed: tomb.dashed, solid: tomb.solid }, `${ctx}, delete(23): bucket 2's border opacities (a DEL bucket is dashed)`).toEqual({ dashed: 1, solid: 0 });

    await visualiser.runToEnd('search', 34);
    const found = await hashTable.settled(`${ctx}, delete(23), search(34)`);
    expect(found.banner, `${ctx}, delete(23), search(34): the search should probe past DEL in bucket 2`).toContain('Found at slot 3');

    const reuse = `${ctx}, delete(23), insert(45): 45 % 11 = 1, the first DEL is bucket 2`;
    await visualiser.runToEnd('insert', 45);
    const end = await hashTable.settled(reuse);
    expect(describeSlots(end.slots), `${reuse}: the buckets`).toBe(table({ 1: 12, 2: 45, 3: 34 }));
    expect(end.banner, `${reuse}: the banner`).toContain('Placed at slot 2 (reused DEL)');
    const reused = end.slots[2];
    expect({ dashed: reused.dashed, solid: reused.solid }, `${reuse}: bucket 2's border opacities (solid again once it holds a key)`).toEqual({ dashed: 0, solid: 1 });
  });

  test('playback controls and the C code panel follow the probe step by step', async ({ visualiser, hashTable }) => {
    const ctx = '/visualiser/hash-tables/122334, insert(45): probes buckets 1, 2, 3, then places 45 in empty bucket 4';
    await visualiser.open('hash-tables', CHAIN);
    await visualiser.runToEnd('insert', 45);
    const steps = await hashTable.stepThrough(ctx);
    const occupied = 'if (ht->state[idx] == OCCUPIED && ht->keys[idx] == key) {';
    const expected = [
      { banner: 'Start at slot 1', codeLine: 'int start = key % ht->size;', highlighted: [] },
      { banner: 'slot 1 holds 12', codeLine: occupied, highlighted: [1] },
      { banner: 'slot 2 holds 23', codeLine: occupied, highlighted: [2] },
      { banner: 'slot 3 holds 34', codeLine: occupied, highlighted: [3] },
      { banner: 'slot 4 is empty', codeLine: 'if (ht->state[idx] == EMPTY) {', highlighted: [4] },
      { banner: 'Placed at slot 4', codeLine: 'ht->keys[target] = key;', highlighted: [4] },
    ];
    expect(steps.map((step) => step.banner), `${ctx}: one Next step per hash, probe and placement (banners shown)`).toHaveLength(expected.length);
    for (const [i, want] of expected.entries()) {
      const at = `${ctx}, step ${i + 1}`;
      expect(steps[i].banner, `${at}: the banner`).toContain(want.banner);
      expect(steps[i].codeLine, `${at} (${steps[i].banner}): the highlighted C line`).toBe(want.codeLine);
      expect(steps[i].highlighted, `${at} (${steps[i].banner}): the highlighted bucket`).toEqual(want.highlighted);
    }

    await hashTable.transport.rewind();
    const start = await hashTable.settled(`${ctx}, Back to the start`);
    expect(describeSlots(start.slots), `${ctx}, Back to the start: the buckets as before the insert`).toBe(table({ 1: 12, 2: 23, 3: 34 }));
    expect(start.highlighted, `${ctx}, Back to the start: no bucket highlighted`).toEqual([]);
    await hashTable.nextStep(`${ctx}, Back to the start`);
    await hashTable.nextStep(`${ctx}, Back to the start, Next step`);
    const third = await hashTable.nextStep(`${ctx}, Back to the start, Next step x2`);
    expect(summary(third), `${ctx}, Back to the start then Next step x3: should match step 3 of the step-through`).toEqual(summary(steps[2]));
    const back = await hashTable.previousStep(`${ctx}, at step 3`);
    expect(summary(back), `${ctx}, at step 3 then Previous step: should match step 2 of the step-through`).toEqual(summary(steps[1]));

    await hashTable.transport.play();
    await expect
      .poll(() => hashTable.transport.roundedProgress(ctx), { timeout: 30_000, message: `${ctx}, at step 2 then Play: Animation progress should reach 100` })
      .toBe(100);
    const played = await hashTable.settled(`${ctx}, played to the end`);
    expect(summary(played), `${ctx}, Play to the end: should match the last step of the step-through`).toEqual(summary(steps[steps.length - 1]));
    await expect
      .poll(() => hashTable.codeLineInView(), {
        message: `${ctx}, Play to the end: the highlighted placement line should stay scrolled into view after the completion banner expands`,
      })
      .toBe(true);

    await hashTable.transport.setSpeed(0.25);
    expect(await hashTable.transport.speed(), `${ctx}: after choosing 0.25×, the Speed picker`).toBe(0.25);
    await hashTable.transport.replay();
    await expect.poll(() => hashTable.transport.progress(ctx), { message: `${ctx}, Replay at 0.25×: Animation progress should drop below 100` }).toBeLessThan(100);
    await hashTable.transport.pause();
    const paused = await hashTable.transport.progress(ctx);
    await expect(
      expect.poll(() => hashTable.transport.progress(ctx), { timeout: 1_000 }).not.toBe(paused),
      `${ctx}, Replay at 0.25× then Pause at ${paused}: Animation progress should not move for 1 s`,
    ).rejects.toThrow();
    await hashTable.transport.play();
    await expect
      .poll(() => hashTable.transport.roundedProgress(ctx), { timeout: 60_000, message: `${ctx}, paused at ${paused} then Play at 0.25×: Animation progress should reach 100` })
      .toBe(100);
  });

  test.describe('theme', () => {
    test.use({ colorScheme: 'light', viewport: WIDE });

    test('switching theme redraws the table with its DEL bucket and keeps a run at its step, with no errors', async ({ browser, page, visualiser, hashTable }) => {
      const ctx = `/visualiser/hash-tables/${TOMBSTONE} (bucket 2 is DEL)`;
      const view = new VisualiserStageView(page);
      const fresh = await viewVisualiserInFreshPage(browser, 'dark', 'hash-tables', TOMBSTONE, async () => {}, ctx);
      const loggedErrors = watchPageErrors(page);
      await visualiser.open('hash-tables', TOMBSTONE);
      const before = await hashTable.settled(`${ctx}, in light`);
      expect(describeSlots(before.slots), `${ctx}, in light: the buckets`).toBe(table({ 1: 12, 2: 'DEL', 3: 34 }));

      await view.switchTheme('dark', ctx);
      await view.expectLooks(fresh.looks, `${ctx}, switched light to dark: the drawing should look like a fresh dark page of the same link`);
      const dark = await hashTable.settled(`${ctx}, switched to dark`);
      expect(describeSlots(dark.slots), `${ctx}, switched to dark: the buckets, DEL included`).toBe(describeSlots(before.slots));
      expect(dark.slots[2].dashed, `${ctx}, switched to dark: bucket 2's dashed DEL border opacity`).toBe(1);

      const run = `${ctx}, in dark, insert(45), Back to the start, Next step x3`;
      await visualiser.runToEnd('insert', 45);
      await hashTable.transport.rewind();
      await hashTable.nextStep(run);
      await hashTable.nextStep(run);
      const mid = await hashTable.nextStep(run);
      await view.switchTheme('light', run);
      const after = await hashTable.settled(`${run}, switched dark to light`);
      expect(summary(after), `${run}, switched dark to light: the run should stay at the same step`).toEqual(summary(mid));
      await hashTable.transport.play();
      await expect
        .poll(() => hashTable.transport.roundedProgress(run), { timeout: 30_000, message: `${run}, switched, then Play: Animation progress should reach 100` })
        .toBe(100);
      const end = await hashTable.settled(`${run}, switched, played to the end`);
      expect(describeSlots(end.slots), `${run}, switched, played to the end: 45 should reuse DEL in bucket 2`).toBe(table({ 1: 12, 2: 45, 3: 34 }));
      expect(loggedErrors(), `${ctx}: console errors and uncaught page errors through both theme switches`).toEqual([]);
    });
  });

  test('Copy link keeps all 11 buckets, DEL included, and the link restores them', async ({ visualiser, hashTable }) => {
    const ctx = '/visualiser/hash-tables/122334, delete(23), Copy link';
    await visualiser.open('hash-tables', CHAIN);
    await visualiser.runToEnd('delete', 23);
    const link = new URL(await visualiser.copyLink());
    expect(link.pathname, `${ctx}: the copied link's path (s, then -- empty, xx DEL or two digits per bucket)`).toBe(`/visualiser/hash-tables/${TOMBSTONE}`);

    await visualiser.open('hash-tables', link.pathname.split('/').pop());
    const restored = await hashTable.settled(`${ctx}, then opening ${link.pathname}`);
    expect(describeSlots(restored.slots), `opening ${link.pathname}: the buckets`).toBe(table({ 1: 12, 2: 'DEL', 3: 34 }));
    expect(restored.slots[2].dashed, `opening ${link.pathname}: bucket 2's dashed DEL border opacity`).toBe(1);
    await visualiser.runToEnd('search', 34);
    const found = await hashTable.settled(`opening ${link.pathname}, search(34)`);
    expect(found.banner, `opening ${link.pathname}, search(34): the restored DEL should be probed past`).toContain('Found at slot 3');
  });

  test('a plain two-digit link inserts its keys in order', async ({ visualiser, hashTable }) => {
    await visualiser.open('hash-tables', [34, 23, 12]);
    const chain = await hashTable.settled('/visualiser/hash-tables/342312');
    expect(describeSlots(chain.slots), '/visualiser/hash-tables/342312: 34, 23, 12 all hash to 1, inserted in that order').toBe(table({ 1: 34, 2: 23, 3: 12 }));

    await visualiser.open('hash-tables', [10, 21]);
    const wrapped = await hashTable.settled('/visualiser/hash-tables/1021');
    expect(describeSlots(wrapped.slots), '/visualiser/hash-tables/1021: 10 into bucket 10, then 21 wraps to bucket 0').toBe(table({ 0: 21, 10: 10 }));
  });

  test('Clear empties all 11 buckets and New hash table generates a colliding table', async ({ visualiser, hashTable }) => {
    const ctx = '/visualiser/hash-tables/122334';
    await visualiser.open('hash-tables', CHAIN);
    await visualiser.clear();
    const cleared = await hashTable.settled(`${ctx}, Clear`);
    expect(describeSlots(cleared.slots), `${ctx}, Clear: the buckets`).toBe(table({}));
    const link = new URL(await visualiser.copyLink());
    expect(link.pathname, `${ctx}, Clear, Copy link: the path`).toBe('/visualiser/hash-tables/empty');

    await visualiser.createNew();
    await expect
      .poll(async () => keysOf(await hashTable.slots()).length, { message: `${ctx}, Clear, New hash table: keys should be drawn` })
      .toBeGreaterThan(0);
    const generated = await hashTable.settled(`${ctx}, Clear, New hash table`);
    expectGeneratedTable(generated.slots, `${ctx}, Clear, New hash table`);
  });

  test('is reachable from the landing page and the visualiser header', async ({ landingPage, visualiser, hashTable, page }) => {
    await landingPage.open();
    await landingPage.openTopic('hash-tables');
    await expect(page, 'Opening Hash Tables from the landing page should go to /visualiser/hash-tables').toHaveURL(/\/visualiser\/hash-tables$/);
    await hashTable.settled('/ then Open Hash Tables');

    await visualiser.open('linked-lists');
    await visualiser.switchTopic('hash-tables');
    await expect(page, 'Choosing Hash Tables in the /visualiser/linked-lists header should go to /visualiser/hash-tables').toHaveURL(
      /\/visualiser\/hash-tables$/,
    );
    await hashTable.settled('/visualiser/linked-lists then Hash Tables in the header');
  });

  test('shows a loading status until challenges.wasm arrives', async ({ hashTable, page }) => {
    const ctx = '/visualiser/hash-tables/122334 with challenges.wasm held back';
    const release = await hashTable.holdChallengesWasm();
    await page.goto('/visualiser/hash-tables/122334');
    await hashTable.expectLoading(ctx);
    await release();
    const state = await hashTable.settled(`${ctx}, then let through`);
    expect(describeSlots(state.slots), `${ctx}, then let through: the buckets`).toBe(table({ 1: 12, 2: 23, 3: 34 }));
  });

  test('a failed challenges.wasm load shows an alert, and Retry draws the table', async ({ hashTable, page }) => {
    const ctx = '/visualiser/hash-tables/122334 with the first challenges.wasm request answered 500';
    const failed = await hashTable.failChallengesWasmOnce();
    await page.goto('/visualiser/hash-tables/122334');
    await hashTable.expectLoadError(ctx);
    expect(failed(), `${ctx}: challenges.wasm requests answered with 500`).toBe(1);

    await hashTable.retry();
    const state = await hashTable.settled(`${ctx}, then Retry`);
    expect(describeSlots(state.slots), `${ctx}, then Retry: the buckets`).toBe(table({ 1: 12, 2: 23, 3: 34 }));
    await hashTable.expectNoLoadError(`${ctx}, then Retry`);
  });

  test('switching to another topic while challenges.wasm is pending keeps the new topic drawing intact', async ({ visualiser, hashTable, page }) => {
    const ctx = '/visualiser/hash-tables with challenges.wasm held back, switching to linked-lists before release';
    const loggedErrors = watchPageErrors(page);
    const release = await hashTable.holdChallengesWasm();
    await page.goto('/visualiser/hash-tables');
    await hashTable.expectLoading(ctx);

    await visualiser.switchTopic('linked-lists');
    await expect(page, `${ctx}: clicking Linked Lists in the header should navigate to /visualiser/linked-lists`).toHaveURL(
      /\/visualiser\/linked-lists$/,
    );
    await expect
      .poll(async () => (await visualiser.values()).length, {
        message: `${ctx}: the linked list should draw without waiting for challenges.wasm`,
      })
      .toBeGreaterThan(0);
    const drawnBeforeRelease = await visualiser.values();

    await release();
    await visualiser.waitForDrawingToSettle();
    expect(await visualiser.values(), `${ctx}, after challenges.wasm resolves: the linked-list drawing should stay intact`).toEqual(
      drawnBeforeRelease,
    );
    expect(await hashTable.slots(), `${ctx}, after challenges.wasm resolves: no hash-table buckets should overwrite the linked list`).toEqual([]);
    expect(loggedErrors(), `${ctx}: console errors and uncaught page errors`).toEqual([]);
  });

  test.describe('phone status pill', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('updates on every intermediate probe step during a run', async ({ visualiser, hashTable }) => {
      const ctx = `/visualiser/hash-tables/${TOMBSTONE} at 390x844, insert(45)`;
      await visualiser.open('hash-tables', TOMBSTONE);
      expect(await hashTable.phoneBanner(), `${ctx}, before running: idle phone status pill`).toContain('% 11');

      await visualiser.runToEnd('insert', 45);
      await hashTable.transport.rewind();
      const expected = [
        'Start at slot 1',
        'Probes: 1 · slot 1 holds 12',
        'Probes: 2 · slot 2 is DEL',
        'Probes: 3 · slot 3 holds 34',
        'Probes: 4 · slot 4 is empty',
        'Probes: 4 · Placed at slot 2 (reused DEL)',
      ];
      for (const [i, phrase] of expected.entries()) {
        await hashTable.nextStep(`${ctx}, step ${i + 1}`);
        expect(
          await hashTable.phoneBanner(),
          `${ctx}, step ${i + 1}: phone status pill should update immediately with the playhead`,
        ).toContain(phrase);
      }
    });
  });
});
