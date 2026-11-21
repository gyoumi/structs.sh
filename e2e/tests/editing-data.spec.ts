import { test, expect } from '../support/test';

/** Insert at index runs refused on the list 10 20 30, and the boxes each refusal should mark invalid. */
const refusals: { title: string; input: string; args: (number | string)[]; error: string; invalid: string[] }[] = [
  {
    title: 'an index out of range marks only the Index box',
    input: 'Value 5 and Index 9',
    args: [5, 9],
    error: 'Index needs to be between 0 and 3.',
    invalid: ['Index'],
  },
  {
    title: 'an empty box marks only the empty box',
    input: 'Value 5 and the Index box left empty',
    args: [5],
    error: 'Fill in every box first.',
    invalid: ['Index'],
  },
  {
    title: 'a value out of range marks only the Value box',
    input: 'Value 150 and Index 1',
    args: [150, 1],
    error: 'Values need to be between 0 and 99.',
    invalid: ['Value'],
  },
];

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
    await expect
      .poll(async () => {
        const values = await visualiser.values();
        return values.length > 0 && values.join() !== '10,20,30';
      })
      .toBe(true);
  });

  test('clearing removes every value', async ({ visualiser }) => {
    await visualiser.clear();
    await expect.poll(() => visualiser.values()).toEqual([]);
  });

  for (const { title, input, args, error, invalid } of refusals) {
    test(title, async ({ visualiser }) => {
      await visualiser.run('insert', ...args);
      await expect
        .poll(() => visualiser.operationError('insert'), {
          message: `On the list 10 20 30, Insert at index with ${input} should be refused with this error`,
        })
        .toBe(error);
      await expect
        .poll(() => visualiser.invalidBoxes(), {
          message: `On the list 10 20 30, Insert at index with ${input} is refused with "${error}". Only the ${invalid.join(' and ')} box should be marked invalid (aria-invalid="true", red outline); received the labels of every box marked invalid`,
        })
        .toEqual(invalid);
    });
  }

  test('typing in a box clears the invalid mark', async ({ visualiser }) => {
    await visualiser.run('insert', 5, 9);
    await expect.poll(() => visualiser.operationError('insert')).not.toBe('');
    await visualiser.typeInBox('Index', '1');
    await expect
      .poll(() => visualiser.invalidBoxes(), {
        message: 'After a refused Insert at index (Value 5, Index 9 on the list 10 20 30), typing 1 in the Index box should clear the error, so no box stays marked invalid',
      })
      .toEqual([]);
  });

  test('running an operation shows its C code', async ({ visualiser }) => {
    expect(await visualiser.codeLines()).toEqual([]);
    await visualiser.runToEnd('append', 40);
    await expect.poll(async () => (await visualiser.codeLines()).join('\n')).toMatch(/\w+\s*\(/);
  });
});
