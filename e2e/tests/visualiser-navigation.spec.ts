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
  'hash-tables': ['insert', 'search', 'delete'],
};

test.describe('visualiser navigation', () => {
  for (const [topic, commands] of Object.entries(operations) as [TopicSlug, string[]][]) {
    test(`${topic} offers its operations`, async ({ visualiser }) => {
      await visualiser.open(topic);
      expect((await visualiser.operations()).sort(), `/visualiser/${topic} should offer exactly its operations`).toEqual(
        [...commands].sort(),
      );
    });
  }

  test('switches to another structure', async ({ visualiser, page }) => {
    await visualiser.open('linked-lists');
    await visualiser.switchTopic('avl-trees');
    await expect(page, 'Switching from linked-lists to AVL trees should go to /visualiser/avl-trees').toHaveURL(
      /\/visualiser\/avl-trees$/,
    );
    await expect.poll(async () => (await visualiser.operations()).sort(), {
      message: 'After switching to avl-trees, the operations offered should be the AVL tree ones',
    }).toEqual(
      [...operations['avl-trees']].sort(),
    );
  });

  test('goes back to the landing page', async ({ visualiser, page }) => {
    await visualiser.open('linked-lists');
    await visualiser.goHome();
    await expect(page, 'The structs.sh home link in /visualiser/linked-lists should go to /').toHaveURL(/\/$/);
  });

  test('opens the debugger', async ({ visualiser, page }) => {
    await visualiser.open('linked-lists');
    await visualiser.openDebugger();
    await expect(page, 'Clicking Debugger in the /visualiser/linked-lists header should go to /debugger').toHaveURL(
      /\/debugger$/,
    );
  });

  test('opens the daily challenge', async ({ visualiser, page }) => {
    await visualiser.open('linked-lists');
    await visualiser.openDaily();
    await expect(page, 'Clicking "Daily" in the /visualiser/linked-lists header should go to /daily').toHaveURL(
      /\/daily$/,
    );
  });
});
