/** The latest step time more than 25ms before `now`, or 0 when there is none. */
export const previousStepTime = (timestamps: readonly number[], now: number): number => {
  const earlier = timestamps.filter((t) => t + 25 < now);
  return earlier.length > 0 ? Math.max(...earlier) : 0;
};

/** Step times in order, dropping any within 2ms of the one before. */
export const distinctStepTimes = (timestamps: readonly number[]): number[] =>
  [...timestamps].sort((a, b) => a - b).filter((t, i, sorted) => i === 0 || t - sorted[i - 1] > 2);
