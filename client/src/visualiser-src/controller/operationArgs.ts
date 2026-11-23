const splitNumbers = (raw: string): string[] => raw.split(/,| /g).filter((str) => str !== '');

export const validateOperationArgs = (expectedArgs: string[], args: string[]): string => {
  if (args.length !== expectedArgs.length) {
    return `Invalid arguments. Please provide ${args.join(', ')}`;
  }
  if (args.includes('') || (expectedArgs.length > 0 && args.some((arg) => !arg.match(/\d/)))) {
    return 'Argument(s) missing';
  }
  if (
    !args.every((value, idx) =>
      expectedArgs[idx].endsWith('s')
        ? splitNumbers(value).every((el) => /^\d+$/.test(el))
        : /^\d+$/.test(value)
    )
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
