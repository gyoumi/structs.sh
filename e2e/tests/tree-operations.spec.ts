import { test, expect } from '../support/test';
import type { TopicSlug } from '../support/topics';

/** The order each traversal visits the tree with 20 at the root, 10 on its left and 30 on its right. */
const traversals: Record<string, number[]> = {
  inorderTraversal: [10, 20, 30],
  preorderTraversal: [20, 10, 30],
  postorderTraversal: [10, 30, 20],
};

test.describe('binary search tree operations', () => {
  test.beforeEach(async ({ visualiser }) => {
    await visualiser.open('binary-search-trees', [20, 10, 30]);
  });

  test('insert places the value in order', async ({ visualiser }) => {
    await visualiser.runToEnd('insert', 25);
    await expect.poll(() => visualiser.values()).toEqual([10, 20, 25, 30]);
    await expect.poll(() => visualiser.root()).toBe(20);
  });

  test('delete removes the value', async ({ visualiser }) => {
    await visualiser.runToEnd('delete', 20);
    await expect.poll(() => visualiser.values()).toEqual([10, 30]);
  });

  test('rotate left lifts the right child', async ({ visualiser }) => {
    await visualiser.runToEnd('rotateLeft', 20);
    await expect.poll(() => visualiser.root()).toBe(30);
    await expect.poll(() => visualiser.values()).toEqual([10, 20, 30]);
  });

  test('rotate right lifts the left child', async ({ visualiser }) => {
    await visualiser.runToEnd('rotateRight', 20);
    await expect.poll(() => visualiser.root()).toBe(10);
    await expect.poll(() => visualiser.values()).toEqual([10, 20, 30]);
  });

  for (const [traversal, order] of Object.entries(traversals)) {
    test(`${traversal} visits ${order.join(', ')} and leaves the tree unchanged`, async ({ visualiser }) => {
      await visualiser.run(traversal);
      expect(await visualiser.visitOrder()).toEqual(order);
      await expect.poll(() => visualiser.values()).toEqual([10, 20, 30]);
      await expect.poll(() => visualiser.root()).toBe(20);
    });
  }
});

test.describe('stepping through a traversal at 5× speed', () => {
  // Postorder on a chain visits every node back to back, so each step boundary
  // between two visits is a chance for one Next step to run into the next visit.
  const chain = [10, 20, 30, 40, 50, 60, 70, 80];
  const visits = [...chain].reverse();

  test('each Next step visits exactly one node in postorderTraversal of a right-leaning chain', async ({ visualiser }) => {
    const context = `/visualiser/binary-search-trees [${chain.join(', ')}] (each value the right child of the one before), postorderTraversal at 5× speed, rewound to the start and stepped with Next step only`;
    await visualiser.open('binary-search-trees', chain);
    await visualiser.transport.setSpeed(5);
    expect(await visualiser.transport.speed(), `${context}: the Speed picker should show 5× after choosing it`).toBe(5);
    await visualiser.run('postorderTraversal');
    await visualiser.transport.rewind();
    expect(
      await visualiser.visitOrder(context),
      `${context}: each Next step should colour at most one node as visited, giving the postorder ${visits.join(', ')}`,
    ).toEqual(visits);
  });
});

test.describe('AVL tree operations', () => {
  test.beforeEach(async ({ visualiser }) => {
    await visualiser.open('avl-trees', [10, 20]);
  });

  test('insert rebalances the tree', async ({ visualiser }) => {
    await visualiser.runToEnd('insert', 30);
    await expect.poll(() => visualiser.values()).toEqual([10, 20, 30]);
    await expect.poll(() => visualiser.root()).toBe(20);
  });

  test('delete removes the value', async ({ visualiser }) => {
    await visualiser.runToEnd('delete', 10);
    await expect.poll(() => visualiser.values()).toEqual([20]);
  });
});

test.describe('AVL tree traversals', () => {
  test.beforeEach(async ({ visualiser }) => {
    await visualiser.open('avl-trees', [20, 10, 30]);
  });

  for (const [traversal, order] of Object.entries(traversals)) {
    test(`${traversal} visits ${order.join(', ')} and leaves the tree unchanged`, async ({ visualiser }) => {
      await visualiser.run(traversal);
      expect(await visualiser.visitOrder()).toEqual(order);
      await expect.poll(() => visualiser.values()).toEqual([10, 20, 30]);
      await expect.poll(() => visualiser.root()).toBe(20);
    });
  }
});

const linkPath = (topic: TopicSlug, data: number[]) =>
  `/visualiser/${topic}/${data.map((value) => String(value).padStart(2, '0')).join('')}`;

/** Trees are written as value(left, right), the way `visualiser.tree()` reads the drawing. */
const treeLinks: { title: string; topic: TopicSlug; data: number[]; tree: string; why: string }[] = [
  {
    title: 'a binary search tree link in pre-order keeps the shape it describes',
    topic: 'binary-search-trees',
    data: [50, 30, 20, 40, 70],
    tree: '50(30(20, 40), 70)',
    why: 'a valid pre-order listing keeps its shape: root 50, 30 on its left with 20 and 40 under it, 70 on its right',
  },
  {
    title: 'a binary search tree link not in pre-order inserts the values in the order given',
    topic: 'binary-search-trees',
    data: [50, 30, 70, 20, 40],
    tree: '50(30(20, 40), 70)',
    why: 'values that are not a pre-order listing are inserted in order, so 20 and 40 go under 30, not under 70',
  },
  {
    title: 'a binary search tree link with a repeated value ignores the repeat',
    topic: 'binary-search-trees',
    data: [50, 30, 50, 70],
    tree: '50(30, 70)',
    why: 'values are inserted in order with duplicates ignored, so the second 50 adds nothing',
  },
  {
    title: 'an AVL tree link in pre-order of a balanced tree keeps the shape it describes',
    topic: 'avl-trees',
    data: [40, 20, 10, 30, 50],
    tree: '40(20(10, 30), 50)',
    why: 'a valid pre-order listing of a balanced AVL tree keeps its shape (inserting with rebalancing would give 20 at the root instead)',
  },
  {
    title: 'an AVL tree link that is not a balanced tree is drawn balanced',
    topic: 'avl-trees',
    data: [10, 20, 30],
    tree: '20(10, 30)',
    why: 'read as pre-order these values form a chain 10 -> 20 -> 30, which is not a valid AVL tree; the result must be balanced, with 20 at the root',
  },
];

test.describe('opening a tree from a link', () => {
  for (const { title, topic, data, tree, why } of treeLinks) {
    test(title, async ({ visualiser }) => {
      await visualiser.open(topic, data);
      await expect
        .poll(() => visualiser.tree(), {
          message: `Opening ${linkPath(topic, data)} ([${data.join(', ')}]): ${why}. Expected the drawing to show ${tree}, written as value(left child, right child)`,
        })
        .toBe(tree);
    });
  }

  test('an AVL tree link of sorted values is drawn as a valid AVL tree', async ({ visualiser }) => {
    const data = [10, 20, 30, 40, 50, 60, 70];
    await visualiser.open('avl-trees', data);
    await expect
      .poll(() => visualiser.values(), {
        message: `Opening ${linkPath('avl-trees', data)}: reading the drawn tree left to right should give the values in ascending order`,
      })
      .toEqual(data);
    await expect
      .poll(() => visualiser.unbalancedValues(), {
        message: `Opening ${linkPath('avl-trees', data)} ([${data.join(', ')}]) should give a valid AVL tree, where every node's left and right subtrees differ in height by at most 1. Expected no unbalanced nodes; received the values of the nodes that are unbalanced (drawn tree: ${await visualiser.tree()})`,
      })
      .toEqual([]);
  });
});
