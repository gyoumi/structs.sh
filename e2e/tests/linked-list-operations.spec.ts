import { test, expect } from '../support/test';

test.describe('linked list operations', () => {
  test.beforeEach(async ({ visualiser }) => {
    await visualiser.open('linked-lists', [10, 20, 30]);
  });

  test('append adds to the end', async ({ visualiser }) => {
    await visualiser.runToEnd('append', 40);
    await expect.poll(() => visualiser.values()).toEqual([10, 20, 30, 40]);
  });

  test('prepend adds to the front', async ({ visualiser }) => {
    await visualiser.runToEnd('prepend', 5);
    await expect.poll(() => visualiser.values()).toEqual([5, 10, 20, 30]);
  });

  test('insert adds at an index', async ({ visualiser }) => {
    await visualiser.runToEnd('insert', 15, 1);
    await expect.poll(() => visualiser.values()).toEqual([10, 15, 20, 30]);
  });

  test('delete removes the node at an index', async ({ visualiser }) => {
    await visualiser.runToEnd('delete', 1);
    await expect.poll(() => visualiser.values()).toEqual([10, 30]);
  });

  test('search finds the value and leaves the list unchanged', async ({ visualiser }) => {
    await visualiser.run('search', 20);
    expect(await visualiser.foundValues()).toEqual([20]);
    await expect.poll(() => visualiser.values()).toEqual([10, 20, 30]);
  });
});
