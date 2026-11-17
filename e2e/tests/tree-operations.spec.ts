import { test, expect } from '../support/test';

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
