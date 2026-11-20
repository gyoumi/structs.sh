import { partitionPoint } from './partitionPoint';
import { DebugType, resolveTypeIndex } from './debugSection';

/** A heap struct the variables reach, as [start, end, type]. */
export type ReachedStruct = [number, number, number];

/** The reached structs by start, with the furthest end of each and those before it. */
export type ReachedByStart = { sorted: ReachedStruct[]; furthestEnds: number[] };

export const indexReachedByStart = (reached: ReachedStruct[]): ReachedByStart => {
  const sorted = [...reached].sort((a, b) => a[0] - b[0]);
  const furthestEnds: number[] = [];
  sorted.forEach(([, structEnd], i) =>
    furthestEnds.push(Math.max(structEnd, furthestEnds[i - 1] ?? -Infinity))
  );
  return { sorted, furthestEnds };
};

const embeds = (types: DebugType[], outer: number, offset: number, inner: number): boolean => {
  const resolved = resolveTypeIndex(types, outer);
  if (offset === 0 && resolved === resolveTypeIndex(types, inner)) return true;
  const type = types[resolved];
  if (type.kind === 'struct') {
    return type.fields.some(
      (field) =>
        field.bitSize === undefined &&
        offset >= field.offset &&
        offset < field.offset + types[field.type].size &&
        embeds(types, field.type, offset - field.offset, inner)
    );
  }
  if (type.kind === 'array') {
    const { size } = types[type.of];
    const element = size > 0 ? Math.floor(offset / size) : 0;
    return element < type.count && embeds(types, type.of, offset - element * size, inner);
  }
  return false;
};

/**
 * Whether a struct of `type` at [start, end) clashes with one the variables
 * reach: they overlap, and neither is the other or a field inside it, so
 * the memory now holds something else.
 */
export const clashesWithReached = (
  types: DebugType[],
  { sorted, furthestEnds }: ReachedByStart,
  start: number,
  end: number,
  type: number
) => {
  const startingBeforeEnd = partitionPoint(sorted, ([otherStart]) => otherStart < end);
  for (let i = startingBeforeEnd - 1; i >= 0 && furthestEnds[i] > start; i -= 1) {
    const [otherStart, otherEnd, other] = sorted[i];
    if (
      otherEnd > start &&
      !(start >= otherStart && embeds(types, other, start - otherStart, type)) &&
      !(otherStart >= start && embeds(types, type, otherStart - start, other))
    ) {
      return true;
    }
  }
  return false;
};
