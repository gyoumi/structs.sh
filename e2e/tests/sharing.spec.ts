import { test, expect } from '../support/test';
import type { TopicSlug } from '../support/topics';

const shared: { topic: TopicSlug; data: number[]; drawn: number[] }[] = [
  { topic: 'linked-lists', data: [10, 20, 30], drawn: [10, 20, 30] },
  { topic: 'binary-search-trees', data: [20, 10, 30], drawn: [10, 20, 30] },
  { topic: 'avl-trees', data: [10, 20, 30], drawn: [10, 20, 30] },
  { topic: 'sorting-algorithms', data: [30, 10, 20], drawn: [30, 10, 20] },
  // 12, 23 and 34 all hash to bucket 1, so linear probing puts them in buckets 1, 2 and 3.
  { topic: 'hash-tables', data: [12, 23, 34], drawn: [12, 23, 34] },
];

test.describe('sharing', () => {
  for (const { topic, data, drawn } of shared) {
    test(`a ${topic} link opens with its data`, async ({ visualiser }) => {
      await visualiser.open(topic, data);
      await expect
        .poll(() => visualiser.values(), { message: `/visualiser/${topic}/${data.map((v) => String(v).padStart(2, '0')).join('')}: the values drawn, left to right` })
        .toEqual(drawn);
    });
  }

  test('a copied link reopens the same data', async ({ visualiser, page }) => {
    await visualiser.open('linked-lists', [10, 20, 30]);
    await visualiser.runToEnd('append', 40);
    const link = await visualiser.copyLink();
    expect(new URL(link).origin).toBe(new URL(page.url()).origin);

    await page.goto(link);
    await expect.poll(() => visualiser.values()).toEqual([10, 20, 30, 40]);
  });
});
