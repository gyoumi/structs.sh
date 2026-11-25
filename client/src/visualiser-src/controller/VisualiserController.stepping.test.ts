// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  CODE_CANVAS,
  CODE_CONTAINER,
  VISUALISER_CANVAS,
  defaultSpeed,
} from '@/visualiser-src/common/constants';
import { DataStructure } from '@/visualiser-src/common/typedefs';
import VisualiserController from './VisualiserController';

/** The speeds the Speed picker offers. The page passes `speed * defaultSpeed` to the controller. */
const offeredSpeeds = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3, 4, 5];

const TREE = [50, 30, 70, 20, 40, 60, 80];
const OPERATION = 'postorderTraversal';
const SIXTY_FPS = 1000 / 60;

/** A step that has stopped is checked again after this long, to see that it stays put. */
const SETTLE_MS = 500;

/** Failures listed per test before the rest are summarised, so the first ones stay readable. */
const LISTED = 8;

type ElementSnapshot = { label: string; attrs: Record<string, string> };

beforeAll(() => {
  (SVGElement.prototype as unknown as SVGGraphicsElement).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
  (SVGElement.prototype as unknown as SVGGraphicsElement).getCTM = () => null;
});

/** Drives svg.js with fake time: one animation frame every `frameMs` of fake wall-clock time. */
const useFrameClock = (frameMs: number) => {
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', (draw: FrameRequestCallback) =>
    setTimeout(() => draw(performance.now()), frameMs)
  );
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id));
};

afterEach(() => {
  vi.advanceTimersByTime(1000);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** The binary search tree page with TREE drawn and OPERATION run, paused at its start. */
const traversalPausedAtStart = (speed: number) => {
  const visualiserId = VISUALISER_CANVAS.replace(/^#/, '');
  const codeId = CODE_CANVAS.replace(/^#/, '');
  document.body.innerHTML = `<svg id="${visualiserId}"></svg><svg id="${codeId}"></svg><div id="${CODE_CONTAINER}"></div>`;
  const controller = new VisualiserController(DataStructure.BINARY_SEARCH_TREE);
  controller.loadData(TREE);
  vi.advanceTimersByTime(10_000);
  controller.setSpeed(speed * defaultSpeed);
  const error = controller.doOperation(OPERATION, () => {});
  if (error)
    throw new Error(`doOperation('${OPERATION}') on [${TREE.join(', ')}] failed: ${error}`);
  controller.pause();
  controller.seekTime(0);
  return controller;
};

/** Every element of the structure's drawing, with its attributes. */
const snapshotDrawing = (): ElementSnapshot[] =>
  Array.from(document.querySelectorAll(`${VISUALISER_CANVAS} *`)).map((element, index) => {
    const next = element.nextElementSibling;
    const value = next?.tagName === 'text' ? (next.textContent?.trim() ?? '') : '';
    const name = /^\d+$/.test(value) ? `${element.tagName} of node ${value}` : element.tagName;
    const attrs = Object.fromEntries(Array.from(element.attributes).map((a) => [a.name, a.value]));
    return { label: `<${name}> #${index}`, attrs };
  });

/** What differs between the drawing at a step's end and the drawing after Next step, in words, or ''. */
const describeDifferences = (
  atStepEnd: ElementSnapshot[],
  afterPress: ElementSnapshot[]
): string => {
  const differences: string[] = [];
  afterPress.forEach((element, index) => {
    const expected = atStepEnd[index];
    if (!expected) return;
    const names = new Set([...Object.keys(expected.attrs), ...Object.keys(element.attrs)]);
    names.forEach((name) => {
      if (expected.attrs[name] !== element.attrs[name]) {
        differences.push(
          `${element.label} ${name}="${element.attrs[name]}" where the step end has "${expected.attrs[name]}"`
        );
      }
    });
  });
  if (differences.length === 0) return '';
  return `the drawing has already changed in ${differences.length} attribute(s), e.g. ${differences.slice(0, 2).join('; ')}`;
};

/** Lets frames run until the press stops playing, then a little longer to see that it stays put. */
const runUntilStopped = (controller: VisualiserController, speed: number, frameMs: number) => {
  const limit = controller.duration / (speed * defaultSpeed) + 5_000;
  let waited = 0;
  while ((controller.stepping || controller.playback === 'playing') && waited < limit) {
    vi.advanceTimersByTime(frameMs);
    waited += frameMs;
  }
  const stoppedAt = controller.time;
  const stillPlaying = controller.stepping || controller.playback === 'playing';
  vi.advanceTimersByTime(SETTLE_MS);
  return { stoppedAt, stillPlaying, movedAfter: controller.time !== stoppedAt };
};

const ms = (time: number) => `${Math.round(time * 10) / 10} ms`;

const offset = (time: number, target: number) => {
  const by = time - target;
  return by >= 0 ? `${ms(by)} past` : `${ms(-by)} before`;
};

const listed = (problems: string[]) =>
  problems.length > LISTED
    ? [...problems.slice(0, LISTED), `...and ${problems.length - LISTED} more`]
    : problems;

const context = (speed: number, frameMs: number) =>
  `/visualiser/binary-search-trees [${TREE.join(', ')}], ${OPERATION} paused at the start, ${speed}× speed (controller.setSpeed(${speed * defaultSpeed})), one animation frame every ${ms(frameMs)}`;

const cases = [
  ...offeredSpeeds.map((speed) => ({ speed, frameMs: SIXTY_FPS, device: '60 frames a second' })),
  { speed: 5, frameMs: 100, device: 'a slow device drawing 10 frames a second' },
];

type Press = {
  stoppedAt: number;
  line: number | null;
  drawing: ElementSnapshot[];
  stillPlaying: boolean;
  movedAfter: boolean;
};

describe('VisualiserController Next step stops at the end of exactly one step', () => {
  it.each(cases)(
    'at $speed× on $device, every Next step stops at its own step end and never starts the next step',
    ({ speed, frameMs }) => {
      useFrameClock(frameMs);
      const controller = traversalPausedAtStart(speed);
      const { stepTimes } = controller;
      expect(
        stepTimes.length,
        `${context(speed, frameMs)}: controller.stepTimes should list the traversal's many steps`
      ).toBeGreaterThan(10);

      const presses: Press[] = [];
      while (presses.length < stepTimes.length && controller.playback !== 'complete') {
        controller.stepForwards();
        const { stoppedAt, stillPlaying, movedAfter } = runUntilStopped(controller, speed, frameMs);
        presses.push({
          stoppedAt,
          line: controller.currentLine,
          drawing: snapshotDrawing(),
          stillPlaying,
          movedAfter,
        });
      }

      controller.seekTime(0);
      const problems: string[] = [];
      presses.forEach((press, k) => {
        const stepEnd = stepTimes[k];
        controller.seekTime(stepEnd);
        const expectedLine = controller.currentLine;
        const drawing = describeDifferences(snapshotDrawing(), press.drawing);
        const issues = [
          Math.abs(press.stoppedAt - stepEnd) > 1
            ? `stopped at ${ms(press.stoppedAt)}, ${offset(press.stoppedAt, stepEnd)} the step end`
            : '',
          press.stillPlaying ? 'was still playing' : '',
          press.movedAfter ? 'kept moving after it stopped' : '',
          press.line !== expectedLine
            ? `highlights code line ${press.line} where the step end highlights line ${expectedLine}`
            : '',
          drawing ? `${drawing} (the following step has started drawing)` : '',
        ].filter(Boolean);
        if (issues.length === 0) return;
        problems.push(
          `Next step press ${k + 1} of ${stepTimes.length} (step ${k + 1} ends at ${ms(stepEnd)}, controller.stepTimes[${k}]): ${issues.join('; ')}`
        );
      });

      expect(
        listed(problems),
        `${context(speed, frameMs)}, then Next step pressed once per step: each press should stop with controller.time at that step's end (controller.stepTimes[k], within 1 ms), with the code line and the drawing exactly as at that step's end and nothing of the following step drawn. Presses that did not`
      ).toEqual([]);
      expect(
        presses.length,
        `${context(speed, frameMs)}: reaching the end should take one Next step press per entry in controller.stepTimes`
      ).toBe(stepTimes.length);
    }
  );
});

describe('VisualiserController Previous and Next step after a Next step', () => {
  it.each(offeredSpeeds.map((speed) => ({ speed })))(
    'at $speed×, Previous step after a Next step returns to the step before, and Next step comes back',
    ({ speed }) => {
      useFrameClock(SIXTY_FPS);
      const controller = traversalPausedAtStart(speed);
      const { stepTimes } = controller;
      const problems: string[] = [];
      for (let k = 0; k < stepTimes.length - 1; k += 1) {
        const previousEnd = k === 0 ? 0 : stepTimes[k - 1];
        const from = k === 0 ? 'the start (0 ms)' : `the end of step ${k} (${ms(previousEnd)})`;
        controller.seekTime(previousEnd);
        controller.stepForwards();
        const { stoppedAt } = runUntilStopped(controller, speed, SIXTY_FPS);
        controller.stepBackwards();
        const back = controller.time;
        controller.stepForwards();
        const { stoppedAt: again } = runUntilStopped(controller, speed, SIXTY_FPS);
        const issues = [
          Math.abs(back - previousEnd) > 1
            ? `Previous step went to ${ms(back)} instead of back to ${from}`
            : '',
          Math.abs(again - stepTimes[k]) > 1
            ? `Next step again stopped at ${ms(again)}, ${offset(again, stepTimes[k])} the end of step ${k + 1}`
            : '',
        ].filter(Boolean);
        if (issues.length > 0) {
          problems.push(
            `From ${from}, Next step stopped at ${ms(stoppedAt)} (step ${k + 1} ends at ${ms(stepTimes[k])}), then ${issues.join('; ')}`
          );
        }
      }
      expect(
        listed(problems),
        `${context(speed, SIXTY_FPS)}: after a Next step, Previous step should go back to the step boundary before it, and Next step should then stop at the same step end again (within 1 ms), as from any other step boundary. Presses where that failed`
      ).toEqual([]);
    }
  );
});
