import { test, expect } from '../support/test';
import type { TopicSlug } from '../support/topics';

const operations: Record<TopicSlug, string[]> = {
  'linked-lists': ['append', 'prepend', 'insert', 'search', 'delete'],
  'binary-search-trees': [
    'insert',
    'delete',
    'rotateLeft',
    'rotateRight',
    'inorderTraversal',
    'preorderTraversal',
    'postorderTraversal',
  ],
  'avl-trees': ['insert', 'delete', 'inorderTraversal', 'preorderTraversal', 'postorderTraversal'],
  'sorting-algorithms': ['append', 'delete', 'bubble', 'insertion', 'selection', 'merge', 'quick'],
};

test.describe('visualiser navigation', () => {
  for (const [topic, commands] of Object.entries(operations) as [TopicSlug, string[]][]) {
    test(`${topic} offers its operations`, async ({ visualiser }) => {
      await visualiser.open(topic);
      expect((await visualiser.operations()).sort()).toEqual([...commands].sort());
    });
  }

  test('switches to another structure', async ({ visualiser, page }) => {
    await visualiser.open('linked-lists');
    await visualiser.switchTopic('avl-trees');
    await expect(page).toHaveURL(/\/visualiser\/avl-trees$/);
    await expect.poll(async () => (await visualiser.operations()).sort()).toEqual(
      [...operations['avl-trees']].sort(),
    );
  });

  test('goes back to the landing page', async ({ visualiser, page }) => {
    await visualiser.open('linked-lists');
    await visualiser.goHome();
    await expect(page).toHaveURL(/\/$/);
  });

  test('opens the debugger', async ({ visualiser, page }) => {
    await visualiser.open('linked-lists');
    await visualiser.openDebugger();
    await expect(page).toHaveURL(/\/debugger$/);
  });
});
