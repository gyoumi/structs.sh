export const MIN_I32 = -0x80000000;
export const MAX_I32 = 0x7fffffff;

/** Whether `value` is a whole number that fits in a signed 32-bit integer, as the wasm build takes. */
export const isI32 = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_I32 && value <= MAX_I32;
