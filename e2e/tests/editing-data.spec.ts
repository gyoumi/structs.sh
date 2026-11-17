import { test, expect } from '../support/test';

test.describe('editing data', () => {
  test.beforeEach(async ({ visualiser }) => {
    await visualiser.open('linked-lists', [10, 20, 30]);
  });

  test('an out-of-range value shows an error and changes nothing', async ({ visualiser }) => {
    await visualiser.run('append', 150);
    await expect.poll(() => visualiser.operationError('append')).not.toBe('');
    await expect.poll(() => visualiser.values()).toEqual([10, 20, 30]);
  });

  test('a missing value shows an error and changes nothing', async ({ visualiser }) => {
    await visualiser.run('append');
    await expect.poll(() => visualiser.operationError('append')).not.toBe('');
    await expect.poll(() => visualiser.values()).toEqual([10, 20, 30]);
  });

  test('new data replaces the current data', async ({ visualiser }) => {
    await visualiser.createNew();
    await expect.poll(() => visualiser.values()).not.toEqual([10, 20, 30]);
    expect((await visualiser.values()).length).toBeGreaterThan(0);
  });

  test('clearing removes every value', async ({ visualiser }) => {
    await visualiser.clear();
    await expect.poll(() => visualiser.values()).toEqual([]);
  });

  test('running an operation shows its C code', async ({ visualiser }) => {
    expect(await visualiser.codeLines()).toEqual([]);
    await visualiser.runToEnd('append', 40);
    expect((await visualiser.codeLines()).join('\n')).toMatch(/\w+\s*\(/);
  });
});
