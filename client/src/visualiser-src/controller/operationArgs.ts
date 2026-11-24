import type { ListOperation } from '@/Services/puzzles/puzzles';

const splitNumbers = (raw: string): string[] => raw.split(/,| /g).filter((str) => str !== '');

const MIN_I32 = -0x80000000;
const MAX_I32 = 0x7fffffff;

const isI32String = (el: string): boolean => {
  if (!/^-?\d+$/.test(el)) return false;
  const n = Number(el);
  return Number.isSafeInteger(n) && n >= MIN_I32 && n <= MAX_I32;
};

const isIndex = (n: unknown): boolean => Number.isSafeInteger(n) && (n as number) >= 0;

const isI32 = (n: unknown): boolean =>
  Number.isInteger(n) && (n as number) >= MIN_I32 && (n as number) <= MAX_I32;

const isListOperation = (op: unknown): op is ListOperation => {
  if (typeof op !== 'object' || op === null || Array.isArray(op)) return false;
  const { kind, value, index, ...rest } = op as Record<string, unknown>;
  if (Object.keys(rest).length > 0 || !isIndex(index)) return false;
  if (kind === 'insert') return isI32(value);
  return kind === 'delete' && !('value' in op);
};

const parseListOperations = (raw: string): ListOperation[] | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every(isListOperation) ? parsed : null;
  } catch {
    return null;
  }
};

const SPECIAL_ARGS = ['keys', 'operations'];

export const validateOperationArgs = (expectedArgs: string[], args: string[]): string => {
  if (args.length !== expectedArgs.length) {
    return `Invalid arguments. Please provide ${args.join(', ')}`;
  }
  const hasMissing = expectedArgs.some(
    (name, idx) => !SPECIAL_ARGS.includes(name) && (args[idx] === '' || !args[idx].match(/\d/))
  );
  if (hasMissing) {
    return 'Argument(s) missing';
  }
  const keysIdx = expectedArgs.indexOf('keys');
  if (keysIdx !== -1 && !splitNumbers(args[keysIdx]).every(isI32String)) {
    return 'Keys must be 32-bit integers';
  }
  const operationsIdx = expectedArgs.indexOf('operations');
  if (operationsIdx !== -1 && parseListOperations(args[operationsIdx]) === null) {
    return 'Operations must be inserts and deletes with 32-bit values and non-negative indexes';
  }
  if (
    !args.every((value, idx) => {
      if (SPECIAL_ARGS.includes(expectedArgs[idx])) return true;
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

export const parseOperationArgs = (
  expectedArgs: string[],
  args: string[]
): (number | number[] | ListOperation[])[] =>
  args.map((arg, idx) => {
    if (expectedArgs[idx] === 'operations') return parseListOperations(arg) ?? [];
    return expectedArgs[idx].endsWith('s')
      ? splitNumbers(arg).map((el) => Number(el))
      : Number(arg);
  });
