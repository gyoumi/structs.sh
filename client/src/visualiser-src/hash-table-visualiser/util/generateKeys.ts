import { HASH_TABLE_CAPACITY } from './shareEncoding';

const MAX_KEY = 99;

const randomKey = (): number => Math.floor(Math.random() * (MAX_KEY + 1));

const shuffle = <T>(items: T[]): T[] => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/** 5 or 6 distinct keys from 0 to 99, at least two of which hash to the same bucket. */
export const generateCollidingKeys = (): number[] => {
  const count = 5 + Math.floor(Math.random() * 2);
  const first = randomKey();
  const sameBucket = Array.from(
    { length: Math.floor(MAX_KEY / HASH_TABLE_CAPACITY) + 1 },
    (_, i) => (first % HASH_TABLE_CAPACITY) + i * HASH_TABLE_CAPACITY
  ).filter((key) => key <= MAX_KEY && key !== first);
  const keys = new Set([first, sameBucket[Math.floor(Math.random() * sameBucket.length)]]);
  while (keys.size < count) keys.add(randomKey());
  return shuffle([...keys]);
};
