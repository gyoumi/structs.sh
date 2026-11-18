import { test, expect } from '../support/test';

const sorts = ['bubble', 'insertion', 'selection', 'merge', 'quick'];

test.describe('sorting', () => {
  test.beforeEach(async ({ visualiser }) => {
    await visualiser.open('sorting-algorithms', [50, 10, 40, 30, 20]);
  });

  for (const sort of sorts) {
    test(`${sort} sort puts the values in order`, async ({ visualiser }) => {
      await visualiser.runToEnd(sort);
      await expect.poll(() => visualiser.values()).toEqual([10, 20, 30, 40, 50]);
    });
  }

  test('values can be added', async ({ visualiser }) => {
    await visualiser.run('append', '60 70');
    await expect.poll(() => visualiser.values()).toEqual([50, 10, 40, 30, 20, 60, 70]);
  });

  test('values can be removed', async ({ visualiser }) => {
    await visualiser.run('delete', '40');
    await expect.poll(() => visualiser.values()).toEqual([50, 10, 30, 20]);
  });
});
