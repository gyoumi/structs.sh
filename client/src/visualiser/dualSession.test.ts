/** @vitest-environment jsdom */
import { beforeAll, describe, expect, it } from 'vitest';
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

    expect(left.run('insertion', []), 'insertion on [42] should start without error').toBe('');
    expect(right.run('merge', []), 'merge on [42] should start without error').toBe('');
    expect(right.getSnapshot().duration, 'merge on [42] has 0 duration').toBe(0);

    dual.finish();
    expect(
      dual.getSnapshot().playback,
      'singleton insertion-vs-merge must reach complete once insertion finishes even when merge has 0 duration'
    ).toBe('complete');

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
    left.run('insertion', []);
    right.run('merge', []);
    dual.rewind();

    dual.stepForward();
    const afterStep1Left = stageTime(left);
    const afterStep1Right = stageTime(right);
    expect(
      Math.abs(afterStep1Left - afterStep1Right),
      `after 1 stepForward, left (${afterStep1Left}ms) and right (${afterStep1Right}ms) must sit at the same playhead time`
    ).toBeLessThan(2);

    dual.stepForward();
    const afterStep2Left = stageTime(left);
    const afterStep2Right = stageTime(right);
    const displayedProgress = dual.getSnapshot().progress;
    expect(
      Math.abs(afterStep2Left - afterStep2Right),
      `after 2 stepForwards, left (${afterStep2Left}ms) and right (${afterStep2Right}ms) must stay aligned`
    ).toBeLessThan(2);

    dual.seekToPercent(displayedProgress);
    expect(
      Math.abs(stageTime(left) - afterStep2Left),
      'seeking to the displayed progress must not jump the left stage'
    ).toBeLessThan(2);
    expect(
      Math.abs(stageTime(right) - afterStep2Right),
      'seeking to the displayed progress must not jump the right stage'
    ).toBeLessThan(2);

    dual.stepBackward();
    expect(
      Math.abs(stageTime(left) - stageTime(right)),
      'stepBackward must keep both stages at the same playhead time'
    ).toBeLessThan(2);

    left.dispose();
    right.dispose();
  });
});
