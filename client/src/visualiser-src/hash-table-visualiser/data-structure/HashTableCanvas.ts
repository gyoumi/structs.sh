import { G, Rect, SVG, Svg, Text } from '@svgdotjs/svg.js';
import type { HashSlot } from '@/Services/challenges/challenges';
import { canvasTheme } from '@/visualiser-src/common/canvasTheme';
import { getCanvasTarget } from '@/visualiser-src/common/canvasTarget';
import {
  BANNER_FONT_SIZE,
  BANNER_Y,
  HIGHLIGHT_INSET,
  INDEX_FONT_SIZE,
  INDEX_Y,
  ROW_CENTRE_X,
  ROW_Y,
  SLOT_SIZE,
  TOMBSTONE_DASH,
  TOMBSTONE_FONT_SIZE,
  VALUE_FONT_SIZE,
  slotCentreX,
  slotX,
  wrapArrowPoints,
  wrapPath,
} from '../util/layout';

/** The drawn parts of one bucket that an animation changes. */
export interface SlotView {
  group: G;
  solidBorder: Rect;
  dashedBorder: Rect;
  highlight: Rect;
  value: Text;
}

/** The drawn table: buckets, banner and wrap cue. */
export interface HashTableView {
  slots: SlotView[];
  banner: G;
  bannerText: Text;
  wrap: G;
}

const slotLabel = (slot: HashSlot): string => {
  if (slot.kind === 'occupied') return String(slot.key);
  if (slot.kind === 'tombstone') return 'DEL';
  return '';
};

const centredText = (parent: G, content: string, x: number, y: number, size: number): Text =>
  parent
    .plain(content)
    .attr({ x, y, 'text-anchor': 'middle', 'dominant-baseline': 'middle' })
    .font({ family: canvasTheme.fontFamily, size })
    .fill(canvasTheme.ink);

/** Adds a hidden value label to bucket `index`, for an animation to fade in. */
export const addValueText = (group: G, index: number, slot: HashSlot): Text => {
  const isTombstone = slot.kind === 'tombstone';
  const text = centredText(
    group,
    slotLabel(slot),
    slotCentreX(index),
    ROW_Y + SLOT_SIZE / 2,
    isTombstone ? TOMBSTONE_FONT_SIZE : VALUE_FONT_SIZE
  )
    .attr('data-hash-value', '')
    .opacity(0);
  return isTombstone ? text.attr('fill-opacity', 0.65) : text;
};

/** Adds a hidden banner line, for an animation to fade in. */
export const addBannerText = (banner: G, content: string): Text =>
  centredText(banner, content, ROW_CENTRE_X, BANNER_Y, BANNER_FONT_SIZE).opacity(0);

const border = (group: G, index: number): Rect =>
  group
    .rect(SLOT_SIZE, SLOT_SIZE)
    .attr({ x: slotX(index), y: ROW_Y })
    .fill('none')
    .stroke({ color: canvasTheme.ink, width: 2 });

const drawSlot = (canvas: Svg, slot: HashSlot, index: number): SlotView => {
  const group = canvas.group().attr('data-hash-slot', String(index));
  group
    .rect(SLOT_SIZE, SLOT_SIZE)
    .attr({ x: slotX(index), y: ROW_Y })
    .fill(canvasTheme.nodeFill)
    .stroke('none');
  const isTombstone = slot.kind === 'tombstone';
  const solidBorder = border(group, index).opacity(isTombstone ? 0 : 1);
  const dashedBorder = border(group, index)
    .attr({ 'stroke-dasharray': TOMBSTONE_DASH, 'stroke-opacity': 0.7 })
    .opacity(isTombstone ? 1 : 0);
  const highlight = group
    .rect(SLOT_SIZE - 2 * HIGHLIGHT_INSET, SLOT_SIZE - 2 * HIGHLIGHT_INSET)
    .attr({ x: slotX(index) + HIGHLIGHT_INSET, y: ROW_Y + HIGHLIGHT_INSET })
    .attr('data-hash-highlight', '')
    .fill('none')
    .stroke({ color: canvasTheme.accent, width: 3 })
    .opacity(0);
  centredText(group, String(index), slotCentreX(index), INDEX_Y, INDEX_FONT_SIZE).attr(
    'data-hash-index',
    ''
  );
  const value = addValueText(group, index, slot).opacity(1);
  return { group, solidBorder, dashedBorder, highlight, value };
};

const drawWrap = (canvas: Svg): G => {
  const wrap = canvas.group().attr('data-hash-wrap', '').opacity(0);
  wrap.path(wrapPath()).fill('none').stroke({ color: canvasTheme.pointer, width: 2.5 });
  wrap.polygon(wrapArrowPoints()).fill(canvasTheme.pointer).stroke('none');
  return wrap;
};

/** Clears the canvas and draws `slots` as a still table with `banner` above it. */
export const drawHashTable = (slots: readonly HashSlot[], banner: string): HashTableView => {
  const canvas = SVG(getCanvasTarget().canvas) as Svg;
  canvas.clear();
  const slotViews = slots.map((slot, index) => drawSlot(canvas, slot, index));
  const bannerGroup = canvas.group().attr('data-hash-banner', '');
  const bannerText = addBannerText(bannerGroup, banner).opacity(1);
  return { slots: slotViews, banner: bannerGroup, bannerText, wrap: drawWrap(canvas) };
};
