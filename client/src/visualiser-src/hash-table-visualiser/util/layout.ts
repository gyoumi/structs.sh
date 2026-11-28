import type { DrawingBounds } from '@/visualiser-src/common/AnimationProducer';
import { HASH_TABLE_CAPACITY } from './shareEncoding';

export const SLOT_SIZE = 52;
export const SLOT_GAP = 6;
export const ORIGIN_X = 24;
export const ROW_Y = 24;
export const INDEX_Y = ROW_Y + SLOT_SIZE + 18;
export const WRAP_DEPTH = INDEX_Y + 42;
export const VALUE_FONT_SIZE = 23;
export const TOMBSTONE_FONT_SIZE = 15;
export const INDEX_FONT_SIZE = 16;
export const TOMBSTONE_DASH = '6 4';
export const HIGHLIGHT_INSET = 4;
export const FADE_MS = 400;

const PADDING = 12;

/** The left edge of bucket `index`. */
export const slotX = (index: number): number => ORIGIN_X + index * (SLOT_SIZE + SLOT_GAP);

/** The horizontal centre of bucket `index`. */
export const slotCentreX = (index: number): number => slotX(index) + SLOT_SIZE / 2;

const rowRight = slotX(HASH_TABLE_CAPACITY - 1) + SLOT_SIZE;

/** Everything the table draws: buckets, indexes and the wrap arc. */
export const tableBounds = (): DrawingBounds => ({
  x: ORIGIN_X - PADDING,
  y: ROW_Y - PADDING,
  width: rowRight - ORIGIN_X + 2 * PADDING,
  height: WRAP_DEPTH - ROW_Y + 2 * PADDING,
});

/** The bucket at `index` with its index label. */
export const slotBounds = (index: number): DrawingBounds => ({
  x: slotX(index) - PADDING,
  y: ROW_Y - PADDING,
  width: SLOT_SIZE + 2 * PADDING,
  height: INDEX_Y - ROW_Y + 2 * PADDING,
});

/** The arc from the bottom of bucket 10 back to the bottom of bucket 0. */
export const wrapPath = (): string => {
  const startX = slotCentreX(HASH_TABLE_CAPACITY - 1);
  const endX = slotCentreX(0);
  const top = INDEX_Y + 13;
  return `M ${startX} ${top} C ${startX} ${WRAP_DEPTH + 10}, ${endX} ${WRAP_DEPTH + 10}, ${endX} ${top}`;
};

/** The arrowhead at the end of the wrap arc, pointing up into bucket 0. */
export const wrapArrowPoints = (): string => {
  const x = slotCentreX(0);
  const tip = INDEX_Y + 11;
  return `${x},${tip} ${x - 6},${tip + 10} ${x + 6},${tip + 10}`;
};
