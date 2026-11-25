import { describe, expect, it } from 'vitest';
import { parseOperationArgs, validateOperationArgs } from './operationArgs';

describe('validateOperationArgs', () => {
  it('accepts signed 32-bit integers and empty input for keys while keeping value/values at 0..99', () => {
    expect(validateOperationArgs(['keys'], ['-1,100,-2147483648,2147483647'])).toBe('');
    expect(parseOperationArgs(['keys'], ['-1,100,-2147483648,2147483647'])).toEqual([
      [-1, 100, -2147483648, 2147483647],
    ]);
    expect(validateOperationArgs(['keys'], [''])).toBe('');
    expect(parseOperationArgs(['keys'], [''])).toEqual([[]]);

    expect(validateOperationArgs(['keys'], ['2147483648'])).not.toBe('');
    expect(validateOperationArgs(['value'], ['-1'])).not.toBe('');
    expect(validateOperationArgs(['value'], ['100'])).not.toBe('');
    expect(validateOperationArgs(['values'], ['100'])).not.toBe('');
  });
});
