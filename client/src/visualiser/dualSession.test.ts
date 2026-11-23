/** @vitest-environment jsdom */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { namedCanvasTarget } from '@/visualiser-src/common/canvasTarget';
import { canvasThemes } from './canvasThemes';
import { DualSession } from './dualSession';
import { VisualiserSession } from './session';
import { findTopic } from './topics';

const mountTargets = (ids: string[]) => {
  document.body.innerHTML = ids
    .map(
      (id) =>
        `<div id="${id}-container"><svg id="${id}-canvas"></svg></div><div id="${id}-code-container"><svg id="${id}-code-canvas"></svg></div>`
    )
    .join('');
  return ids.map((id) => namedCanvasTarget(id));
};

const stageTime = (session: VisualiserSession) => {
  const { progress, duration } = session.getSnapshot();
  return (progress / 100) * duration;
};

beforeAll(() => {
  (SVGElement.prototype as unknown as SVGGraphicsElement).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
  (SVGElement.prototype as unknown as SVGGraphicsElement).getCTM = () => null;
});

describe('DualSession shared timeline', () => {
  const sorting = findTopic('sorting-algorithms');
  if (!sorting) throw new Error('The sorting topic is missing.');

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('completes a singleton insertion-vs-merge run where merge schedules no timeline', () => {
    const [leftTarget, rightTarget] = mountTargets(['left-single', 'right-single']);
    const left = new VisualiserSession(leftTarget);
    const right = new VisualiserSession(rightTarget);
    const dual = new DualSession(left, right);

    left.attach(sorting.title, canvasThemes.light, [42], undefined, true);
    right.attach(sorting.title, canvasThemes.light, [42], undefined, true);
    expect(dual.getSnapshot().playback, 'idle dual stages before Run must stay paused').toBe(
      'paused'
    );

    expect(dual.run('insertion', 'merge'), 'singleton dual run should start without error').toBe(
      ''
    );
    expect(right.getSnapshot().duration, 'merge on [42] has 0 duration').toBe(0);
    expect(dual.getSnapshot().playback, 'singleton dual run starts playing insertion').toBe(
      'playing'
    );

    vi.advanceTimersByTime(5000);
    expect(
      dual.getSnapshot().playback,
      'singleton insertion-vs-merge must complete naturally once insertion finishes'
    ).toBe('complete');

    dual.rewind();
    dual.finish();
    expect(
      dual.getSnapshot().playback,
      'singleton insertion-vs-merge must also reach complete via Skip/finish'
    ).toBe('complete');

    dual.dispose();
    left.dispose();
    right.dispose();
  });

  it('drives both stages from one shared clock through Run, Pause, and Resume with zero jump', () => {
    const [leftTarget, rightTarget] = mountTargets(['left-clock', 'right-clock']);
    const left = new VisualiserSession(leftTarget);
    const right = new VisualiserSession(rightTarget);
    const dual = new DualSession(left, right);
    const data = [5, 3, 8, 1, 7, 2, 6, 4];

    left.attach(sorting.title, canvasThemes.light, data, undefined, true);
    right.attach(sorting.title, canvasThemes.light, data, undefined, true);
    dual.setSpeed(2);

    expect(dual.run('insertion', 'merge')).toBe('');
    expect(stageTime(left), 'left starts at 0ms on Run').toBe(0);
    expect(stageTime(right), 'right starts at 0ms on Run').toBe(0);

    for (let i = 0; i < 10; i += 1) {
      vi.advanceTimersByTime(16);
      const leftMs = stageTime(left);
      const rightMs = stageTime(right);
      expect(
        Math.abs(leftMs - rightMs),
        `frame ${i + 1}: left (${leftMs}ms) and right (${rightMs}ms) must share one clock`
      ).toBeLessThan(0.01);
    }

    const beforePauseLeft = stageTime(left);
    const beforePauseRight = stageTime(right);
    expect(beforePauseLeft, 'clock should have advanced during Run').toBeGreaterThan(100);

    dual.pause();
    expect(dual.getSnapshot().playback).toBe('paused');
    expect(
      Math.abs(stageTime(left) - beforePauseLeft),
      'Pause must not jump the left stage'
    ).toBeLessThan(0.01);
    expect(
      Math.abs(stageTime(right) - beforePauseRight),
      'Pause must not jump the right stage'
    ).toBeLessThan(0.01);

    vi.advanceTimersByTime(500);
    expect(stageTime(left), 'paused left stage must stay frozen').toBe(beforePauseLeft);
    expect(stageTime(right), 'paused right stage must stay frozen').toBe(beforePauseRight);

    dual.play();
    expect(dual.getSnapshot().playback).toBe('playing');
    for (let i = 0; i < 10; i += 1) {
      vi.advanceTimersByTime(16);
      const leftMs = stageTime(left);
      const rightMs = stageTime(right);
      expect(
        Math.abs(leftMs - rightMs),
        `resumed frame ${i + 1}: left (${leftMs}ms) and right (${rightMs}ms) must stay aligned`
      ).toBeLessThan(0.01);
    }
    expect(stageTime(left), 'Resume must advance past the paused time').toBeGreaterThan(
      beforePauseLeft + 100
    );

    dual.dispose();
    left.dispose();
    right.dispose();
  });

  it('round-trips scrubbing near the end without jumping backward', () => {
    const [leftTarget, rightTarget] = mountTargets(['left-end', 'right-end']);
    const left = new VisualiserSession(leftTarget);
    const right = new VisualiserSession(rightTarget);
    const dual = new DualSession(left, right);
    const data = [5, 3, 8, 1, 7, 2, 6, 4];

    left.attach(sorting.title, canvasThemes.light, data, undefined, true);
    right.attach(sorting.title, canvasThemes.light, data, undefined, true);
    dual.run('insertion', 'merge');

    dual.seekToPercent(99.98);
    const snap = dual.getSnapshot();
    const beforeLeft = stageTime(left);
    const beforeRight = stageTime(right);

    dual.seekToPercent(snap.progress);
    expect(
      Math.abs(stageTime(left) - beforeLeft),
      'seeking to the reported progress near 100% must not move left'
    ).toBeLessThan(0.01);
    expect(
      Math.abs(stageTime(right) - beforeRight),
      'seeking to the reported progress near 100% must not move right'
    ).toBeLessThan(0.01);

    dual.dispose();
    left.dispose();
    right.dispose();
  });

  it('keeps both stages aligned to one shared playhead across stepForward, stepBackward, and seekToPercent', () => {
    const [leftTarget, rightTarget] = mountTargets(['left-sync', 'right-sync']);
    const left = new VisualiserSession(leftTarget);
    const right = new VisualiserSession(rightTarget);
    const dual = new DualSession(left, right);

    const data = [4, 2, 3, 1];
    left.attach(sorting.title, canvasThemes.light, data, undefined, true);
    right.attach(sorting.title, canvasThemes.light, data, undefined, true);
    dual.run('insertion', 'merge');
    dual.rewind();

    dual.stepForward();
    const afterStep1Left = stageTime(left);
    const afterStep1Right = stageTime(right);
    expect(
      Math.abs(afterStep1Left - afterStep1Right),
      `after 1 stepForward, left (${afterStep1Left}ms) and right (${afterStep1Right}ms) must sit at the same playhead time`
    ).toBeLessThan(0.01);

    dual.stepForward();
    const afterStep2Left = stageTime(left);
    const afterStep2Right = stageTime(right);
    const displayedProgress = dual.getSnapshot().progress;
    expect(
      Math.abs(afterStep2Left - afterStep2Right),
      `after 2 stepForwards, left (${afterStep2Left}ms) and right (${afterStep2Right}ms) must stay aligned`
    ).toBeLessThan(0.01);

    dual.seekToPercent(displayedProgress);
    expect(
      Math.abs(stageTime(left) - afterStep2Left),
      'seeking to the displayed progress must not jump the left stage'
    ).toBeLessThan(0.01);
    expect(
      Math.abs(stageTime(right) - afterStep2Right),
      'seeking to the displayed progress must not jump the right stage'
    ).toBeLessThan(0.01);

    dual.stepBackward();
    expect(
      Math.abs(stageTime(left) - stageTime(right)),
      'stepBackward must keep both stages at the same playhead time'
    ).toBeLessThan(0.01);

    dual.dispose();
    left.dispose();
    right.dispose();
  });
});
