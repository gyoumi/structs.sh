/** How many items lead `sorted` while `isBefore` holds, found by binary search. */
export const partitionPoint = <T>(sorted: readonly T[], isBefore: (item: T) => boolean) => {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (isBefore(sorted[middle])) low = middle + 1;
    else high = middle;
  }
  return low;
};
