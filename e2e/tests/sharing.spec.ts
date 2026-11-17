import { test, expect } from '../support/test';
import type { TopicSlug } from '../support/visualiser-page';

const shared: { topic: TopicSlug; data: number[]; drawn: number[] }[] = [
  { topic: 'linked-lists', data: [10, 20, 30], drawn: [10, 20, 30] },
  { topic: 'binary-search-trees', data: [20, 10, 30], drawn: [10, 20, 30] },
  { topic: 'avl-trees', data: [10, 20, 30], drawn: [10, 20, 30] },
  { topic: 'sorting-algorithms', data: [30, 10, 20], drawn: [30, 10, 20] },
];

test.describe('sharing', () => {
  for (const { topic, data, drawn } of shared) {
    test(`a ${topic} link opens with its data`, async ({ visualiser }) => {
      await visualiser.open(topic, data);
      await expect.poll(() => visualiser.values()).toEqual(drawn);
    });
  }

  test('a copied link reopens the same data', async ({ visualiser, page }) => {
    await visualiser.open('linked-lists', [10, 20, 30]);
    await visualiser.runToEnd('append', 40);
    const link = await visualiser.copyLink();

    await page.goto(new URL(link).pathname);
    await expect.poll(() => visualiser.values()).toEqual([10, 20, 30, 40]);
  });
});
