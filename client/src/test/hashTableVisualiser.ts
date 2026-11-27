import { Animator } from '@svgdotjs/svg.js';
import { beforeAll, vi } from 'vitest';
import {
  loadChallenges,
  runHashTableStepLog,
  type HashOp,
  type HashRunResult,
  type HashSlot,
  type HashStep,
} from '@/Services/challenges/challenges';
import { getCanvasTarget } from '@/visualiser-src/common/canvasTarget';
import {
  CODE_CANVAS,
  CODE_CONTAINER,
  VISUALISER_CANVAS,
  defaultSpeed,
} from '@/visualiser-src/common/constants';
import type { DrawingBounds } from '@/visualiser-src/common/AnimationProducer';
import type AnimationProducer from '@/visualiser-src/common/AnimationProducer';
import VisualiserController from '@/visualiser-src/controller/VisualiserController';
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

/** What bucket `index` shows: its value texts and whether its border is dashed. */
export const slotLook = (index: number) => ({
  values: shownValues(index),
  dashed: isDashed(index),
});

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

/** A paused VisualiserController with `producer`'s timeline built, at time 0. */
export const play = (producer: AnimationProducer) => {
  const controller = new VisualiserController();
  controller.constructTimeline(producer, () => {});
  controller.pause();
  return controller;
};

export const validBox = (box: DrawingBounds | null | undefined) =>
  !!box &&
  [box.x, box.y, box.width, box.height].every(Number.isFinite) &&
  box.width > 0 &&
  box.height > 0;

/** Indices of the buckets whose `[data-hash-highlight]` is shown. */
export const highlightedSlots = () =>
  Array.from({ length: CAPACITY }, (_, i) => i).filter((i) =>
    isShown(slotElement(i)?.querySelector('[data-hash-highlight]') ?? null)
  );

const boxOf = (el: Element) => ({
  ...positionOf(el),
  width: Number(el.getAttribute('width')),
  height: Number(el.getAttribute('height')),
  stroke: Number(el.getAttribute('stroke-width') ?? 1),
});

/**
 * Why bucket `index`'s highlight could hide its dashed tombstone border, or '' when the dashed
 * border and `[data-hash-highlight]` are both shown and the highlight's stroke sits strictly inside
 * the border's stroke on every side.
 */
export const highlightCoversDash = (index: number): string => {
  const slot = slotElement(index);
  const dashed = slot?.querySelector('[stroke-dasharray]') ?? null;
  const highlight = slot?.querySelector('[data-hash-highlight]') ?? null;
  if (!isShown(dashed)) return `slot ${index}: no shown dashed border (stroke-dasharray)`;
  if (!isShown(highlight)) return `slot ${index}: [data-hash-highlight] is not shown`;
  const d = boxOf(dashed as Element);
  const h = boxOf(highlight as Element);
  const gap = (d.stroke + h.stroke) / 2;
  const sides = [
    h.x - d.x,
    h.y - d.y,
    d.x + d.width - h.x - h.width,
    d.y + d.height - h.y - h.height,
  ];
  return sides.every((side) => side > gap)
    ? ''
    : `slot ${index}: highlight ${show(h)} should sit inside dashed border ${show(d)} by more than ${gap} on every side (left, top, right, bottom were ${show(sides)}), or its stroke covers the dashes`;
};

/** A C statement each non-probe step may highlight, matched against `codeLines[line - 1]`. */
const STATEMENT: Record<Exclude<HashStep['kind'], 'probe'>, RegExp> = {
  computeHash: /key % ht->size/,
  place: /ht->(keys|state)\[target\]/,
  alreadyPresent: /^\s*return;/,
  tableFull: /Table is full/,
  found: /return true;/,
  markTombstone: /= DELETED;/,
  notFound: /return false;|^\s*return;|Not found/,
};

const statementFor = (step: HashStep, isInsert: boolean): RegExp => {
  if (step.kind !== 'probe') return STATEMENT[step.kind];
  if (step.slot.kind === 'empty') return /state\[idx\]\s*==\s*EMPTY/;
  if (step.slot.kind === 'tombstone' && isInsert) {
    return step.firstTombstone === step.index
      ? /^\s*target = idx;$/
      : /state\[idx\]\s*==\s*DELETED/;
  }
  return /state\[idx\]\s*==\s*OCCUPIED/;
};

const WRAP_CUE = /wrap\s*(?:→|->)\s*0\b/i;

/** The bucket a step looks at: none for computeHash, notFound and tableFull. */
const activeSlotOf = (step: HashStep): number[] =>
  step.kind === 'computeHash' || step.kind === 'notFound' || step.kind === 'tableFull'
    ? []
    : [step.index];

/** Indices of the steps that probe bucket 0 straight after probing bucket 10. */
export const wrapStepIndices = (steps: readonly HashStep[]) =>
  steps.flatMap((step, i) => {
    const prev = steps[i - 1];
    const wraps = step.kind === 'probe' && step.index === 0 && prev?.kind === 'probe';
    return wraps && prev.index === 10 ? [i] : [];
  });

/**
 * Seeks to each `controller.stepTimes[i]` and lists where the drawing disagrees with `steps[i]`:
 * the highlighted C statement, the one highlighted bucket, and the wrap cue plus "wrap → 0" banner
 * shown on exactly the 10 → 0 probe.
 */
export const stopProblems = (controller: VisualiserController, steps: readonly HashStep[]) => {
  const codeLines = controller.code.split('\n');
  const isInsert = /void insert\(/.test(controller.code);
  const wrapAt = wrapStepIndices(steps);
  return steps.flatMap((step, i) => {
    controller.seekTime(controller.stepTimes[i]);
    const line = controller.currentLine;
    const statement = line === null ? '<no line>' : (codeLines[line - 1] ?? '<past the end>');
    const wantStatement = statementFor(step, isInsert);
    const lit = highlightedSlots();
    const banner = bannerText();
    const wrapWanted = wrapAt.includes(i);
    const wrapSeen = wrapShown() || /wrap/i.test(banner);
    const wrapFull = wrapShown() && WRAP_CUE.test(banner);
    const issues = [
      wantStatement.test(statement)
        ? ''
        : `highlights line ${line} "${statement.trim()}", want a line matching ${wantStatement}`,
      show(lit) === show(activeSlotOf(step))
        ? ''
        : `[data-hash-highlight] shown on buckets ${show(lit)}, want ${show(activeSlotOf(step))}`,
      wrapWanted && !wrapFull
        ? `10 → 0 probe: want [data-hash-wrap] shown (${wrapShown()}) and banner matching ${WRAP_CUE}; banner "${banner}"`
        : '',
      !wrapWanted && wrapSeen
        ? `not the 10 → 0 probe (that is step ${show(wrapAt)}), yet [data-hash-wrap] shown=${wrapShown()}, banner "${banner}"`
        : '',
    ].filter(Boolean);
    return issues.length ? [`stop ${i} ${show(step)}: ${issues.join('; ')}`] : [];
  });
};

const FRAME_MS = 1000 / 60;

/** Drops a frame svg.js asked for, so the next animation asks the current requestAnimationFrame. */
const dropPendingFrame = () => {
  if (Animator.nextDraw !== null) cancelAnimationFrame(Animator.nextDraw);
  Animator.nextDraw = null;
};

/**
 * Runs `body` with fake timers, one svg.js animation frame every 1/60 s, as in
 * VisualiserController.stepping.test.ts. Earlier tests' frames wait on the real clock, so drop them.
 */
export const withFrameClock = (body: () => void) => {
  dropPendingFrame();
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (draw: FrameRequestCallback) =>
    setTimeout(() => draw(performance.now()), FRAME_MS)
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
  try {
    body();
  } finally {
    vi.advanceTimersByTime(1000);
    dropPendingFrame();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
};

/**
 * From time 0, presses stepForwards() `presses` times, letting frames run until each press stops,
 * then stepBackwards() as many times. Lists presses that did not stop at, or go back to, the
 * neighbouring entry of `controller.stepTimes` (within 1 ms). Call inside withFrameClock.
 */
export const stepBothWaysProblems = (controller: VisualiserController, presses: number) => {
  const { stepTimes } = controller;
  const limit = controller.duration / defaultSpeed + 5_000;
  const problems: string[] = [];
  controller.seekTime(0);
  for (let k = 0; k < presses; k += 1) {
    controller.stepForwards();
    const started = controller.stepping;
    for (let waited = 0; controller.stepping && waited < limit; waited += FRAME_MS) {
      vi.advanceTimersByTime(FRAME_MS);
    }
    const at = controller.time;
    if (!started) problems.push(`stepForwards() press ${k + 1} did not set controller.stepping`);
    if (controller.stepping) problems.push(`stepForwards() press ${k + 1} never stopped`);
    if (Math.abs(at - stepTimes[k]) > 1)
      problems.push(
        `stepForwards() press ${k + 1} stopped at ${at}, want stepTimes[${k}] = ${stepTimes[k]}`
      );
  }
  for (let k = presses - 1; k >= 0; k -= 1) {
    const before = controller.time;
    const want = k === 0 ? 0 : stepTimes[k - 1];
    controller.stepBackwards();
    if (!(controller.time < before) || Math.abs(controller.time - want) > 1)
      problems.push(
        `stepBackwards() from ${before} went to ${controller.time}, want ${k === 0 ? 'the start, 0' : `stepTimes[${k - 1}] = ${want}`}`
      );
  }
  return problems;
};
