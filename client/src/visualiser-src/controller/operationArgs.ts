const splitNumbers = (raw: string): string[] => raw.split(/,| /g).filter((str) => str !== '');

const MIN_I32 = -0x80000000;
const MAX_I32 = 0x7fffffff;

const isI32String = (el: string): boolean => {
  if (!/^-?\d+$/.test(el)) return false;
  const n = Number(el);
  return Number.isSafeInteger(n) && n >= MIN_I32 && n <= MAX_I32;
};

export const validateOperationArgs = (expectedArgs: string[], args: string[]): string => {
  if (args.length !== expectedArgs.length) {
    return `Invalid arguments. Please provide ${args.join(', ')}`;
  }
  const hasMissing = expectedArgs.some(
    (name, idx) => name !== 'keys' && (args[idx] === '' || !args[idx].match(/\d/))
  );
  if (hasMissing) {
    return 'Argument(s) missing';
  }
  const keysIdx = expectedArgs.indexOf('keys');
  if (keysIdx !== -1 && !splitNumbers(args[keysIdx]).every(isI32String)) {
    return 'Keys must be 32-bit integers';
  }
  if (
    !args.every((value, idx) => {
      if (expectedArgs[idx] === 'keys') return true;
      return expectedArgs[idx].endsWith('s')
        ? splitNumbers(value).every((el) => /^\d+$/.test(el))
        : /^\d+$/.test(value);
    })
  ) {
    return 'Argument(s) must be a positive integer';
  }
  const valueIndex =
    expectedArgs.indexOf('value') !== -1
      ? expectedArgs.indexOf('value')
      : expectedArgs.indexOf('values');
  if (
    valueIndex !== -1 &&
    !args[valueIndex]
      .split(/,|\s+/g)
      .filter((str) => str !== '')
      .every((arg) => Number(arg) >= 0 && Number(arg) <= 99)
  ) {
    return 'Values must be between 0 and 99';
  }
  return '';
};

export const parseOperationArgs = (expectedArgs: string[], args: string[]): (number | number[])[] =>
  args.map((arg, idx) =>
    expectedArgs[idx].endsWith('s') ? splitNumbers(arg).map((el) => Number(el)) : Number(arg)
  );
