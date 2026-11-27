import { beforeAll } from 'vitest';
import {
  loadChallenges,
  runHashTableStepLog,
  type HashOp,
  type HashRunResult,
  type HashSlot,
} from '@/Services/challenges/challenges';
import { getCanvasTarget } from '@/visualiser-src/common/canvasTarget';
import { CODE_CANVAS, CODE_CONTAINER, VISUALISER_CANVAS } from '@/visualiser-src/common/constants';
import { setUpParityEnvironment } from './sortingParity';

/**
 * Shared helpers for the hash table visualiser tests. They read the drawing only through the
 * `data-hash-*` attributes the visualiser promises (see docs/hash-table.md, step 2b):
 * `[data-hash-slot="i"]` per bucket, holding `[data-hash-index]` and `[data-hash-value]` text,
 * `[data-hash-banner]` above the buckets, and `[data-hash-wrap]` for the 10 → 0 wrap cue.
 */

export const CAPACITY = 11;

export const show = (value: unknown) => JSON.stringify(value);

/** Loads the real challenges.wasm (built by `pnpm run challenges`) before any test in the file. */
export const setUpHashTableEnvironment = () => {
  setUpParityEnvironment();
  beforeAll(async () => {
    await loadChallenges();
  });
};

export const resetCanvases = () => {
  const visualiserId = VISUALISER_CANVAS.replace(/^#/, '');
  const codeId = CODE_CANVAS.replace(/^#/, '');
  document.body.innerHTML = `<svg id="${visualiserId}"></svg><svg id="${codeId}"></svg><div id="${CODE_CONTAINER}"></div>`;
};

export const E: HashSlot = { kind: 'empty' };
export const T: HashSlot = { kind: 'tombstone' };
export const K = (key: number): HashSlot => ({ kind: 'occupied', key });

/** An 11-slot table, empty except for `filled` (index → slot). */
export const table = (filled: Record<number, HashSlot> = {}): HashSlot[] =>
  Array.from({ length: CAPACITY }, (_, i) => filled[i] ?? E);

/** Short text for a table: `[-, DEL, 14, ...]`. */
export const pictureOf = (slots: readonly HashSlot[]) =>
  `[${slots.map((s) => (s.kind === 'empty' ? '-' : s.kind === 'tombstone' ? 'DEL' : s.key)).join(', ')}]`;

/** The wasm's answer for one operation on `slots`: the reference every visualiser check uses. */
export const wasmRun = (slots: readonly HashSlot[], op: HashOp): HashRunResult =>
  runHashTableStepLog({ capacity: CAPACITY, slots: [...slots], op });

/** Inserts `keys` in order into an empty table through the wasm. */
export const wasmLoad = (keys: readonly number[]): HashSlot[] =>
  keys.reduce<HashSlot[]>((slots, key) => wasmRun(slots, { kind: 'insert', key }).slots, table());

export const canvasElement = (): Element => {
  const canvas = document.querySelector(getCanvasTarget().canvas);
  if (!canvas) throw new Error(`test setup: no canvas ${getCanvasTarget().canvas}`);
  return canvas;
};

export const canvasMarkup = () => canvasElement().outerHTML.toLowerCase();

export const slotElements = () => Array.from(canvasElement().querySelectorAll('[data-hash-slot]'));

export const slotElement = (index: number) =>
  canvasElement().querySelector(`[data-hash-slot="${index}"]`);

const hiddenItself = (el: Element) => {
  const style = el.getAttribute('style') ?? '';
  const styleOpacity = style.match(/(?:^|;)\s*opacity\s*:\s*([\d.]+)/);
  const opacity = el.getAttribute('opacity');
  return (
    (opacity !== null && Number(opacity) < 0.5) ||
    (styleOpacity !== null && Number(styleOpacity[1]) < 0.5) ||
    /display\s*:\s*none/.test(style) ||
    /visibility\s*:\s*hidden/.test(style) ||
    el.getAttribute('display') === 'none' ||
    el.getAttribute('visibility') === 'hidden'
  );
};

/** Whether `el` is in the canvas and neither it nor an ancestor is hidden (opacity < 0.5, display none, visibility hidden). */
export const isShown = (el: Element | null) => {
  const canvas = canvasElement();
  if (!el || !canvas.contains(el)) return false;
  for (let node: Element | null = el; node && node !== canvas; node = node.parentElement) {
    if (hiddenItself(node)) return false;
  }
  return true;
};

/** The non-blank texts of the shown `[data-hash-value]` elements in bucket `index`. */
export const shownValues = (index: number): string[] => {
  const slot = slotElement(index);
  if (!slot) return [`<no [data-hash-slot="${index}"]>`];
  return Array.from(slot.querySelectorAll('[data-hash-value]'))
    .filter(isShown)
    .map((el) => (el.textContent ?? '').trim())
    .filter((text) => text !== '');
};

/** What bucket `slot` should show: nothing when empty, the key, or `DEL`. */
export const expectedValues = (slot: HashSlot): string[] =>
  slot.kind === 'empty' ? [] : slot.kind === 'tombstone' ? ['DEL'] : [String(slot.key)];

/** Every bucket's shown values, for comparing against `slots.map(expectedValues)`. */
export const allShownValues = () => Array.from({ length: CAPACITY }, (_, i) => shownValues(i));

/** Whether bucket `index` (or a shown element in it) has a dashed stroke. */
export const isDashed = (index: number) => {
  const slot = slotElement(index);
  if (!slot) return false;
  return [slot, ...Array.from(slot.querySelectorAll('*'))].filter(isShown).some((el) => {
    const attr = el.getAttribute('stroke-dasharray');
    const style = (el.getAttribute('style') ?? '').match(/stroke-dasharray\s*:\s*([^;]+)/);
    const dash = (attr ?? style?.[1] ?? '').trim();
    return dash !== '' && dash !== 'none' && !/^0(\s*,?\s*0)*$/.test(dash);
  });
};

/** The text of the shown `<text>` elements in the banner, joined by spaces. */
export const bannerText = () => {
  const banner = canvasElement().querySelector('[data-hash-banner]');
  if (!banner) return '<no [data-hash-banner]>';
  const texts = banner.tagName.toLowerCase() === 'text' ? [banner] : [];
  texts.push(...Array.from(banner.querySelectorAll('text')));
  return texts
    .filter(isShown)
    .map((el) => el.textContent ?? '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const wrapShown = () => isShown(canvasElement().querySelector('[data-hash-wrap]'));

const translationOf = (el: Element) => {
  const transform = el.getAttribute('transform') ?? '';
  const matrix = transform.match(/matrix\(([^)]+)\)/);
  if (matrix) {
    const parts = matrix[1].split(/[\s,]+/).map(Number);
    return { x: parts[4] ?? 0, y: parts[5] ?? 0 };
  }
  const translate = transform.match(/translate\(\s*([-\d.e]+)(?:[\s,]+([-\d.e]+))?\s*\)/);
  return translate ? { x: Number(translate[1]), y: Number(translate[2] ?? 0) } : { x: 0, y: 0 };
};

/**
 * Where an element sits on the canvas: its own `x`/`y` (or, for a group, its first `<rect>`'s, else
 * its first child with `y`), plus any translate/matrix transforms up to the canvas.
 */
export const positionOf = (el: Element) => {
  const hasOwn = el.hasAttribute('x') || el.hasAttribute('y');
  const anchor = hasOwn ? el : (el.querySelector('rect') ?? el.querySelector('[y]') ?? el);
  const point = {
    x: Number(anchor.getAttribute('x') ?? 0),
    y: Number(anchor.getAttribute('y') ?? 0),
  };
  const canvas = canvasElement();
  for (let node: Element | null = anchor; node && node !== canvas; node = node.parentElement) {
    const shift = translationOf(node);
    point.x += shift.x;
    point.y += shift.y;
  }
  return point;
};
