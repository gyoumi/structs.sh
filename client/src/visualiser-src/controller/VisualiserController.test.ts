// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import AnimationProducer from '@/visualiser-src/common/AnimationProducer';
import { CODE_CANVAS, CODE_CONTAINER, VISUALISER_CANVAS } from '@/visualiser-src/common/constants';
import GraphicalSortsElement from '@/visualiser-src/sorting-visualiser/data-structure/GraphicalSortsElement';
import { quickSort } from '@/visualiser-src/sorting-visualiser/algorithms/quick';
import VisualiserController from './VisualiserController';

const resetCanvases = () => {
  const visualiserId = VISUALISER_CANVAS.replace(/^#/, '');
  const codeId = CODE_CANVAS.replace(/^#/, '');
  document.body.innerHTML = `<svg id="${visualiserId}"></svg><svg id="${codeId}"></svg><div id="${CODE_CONTAINER}"></div>`;
};

const setupController = (values: number[]) => {
  resetCanvases();
  const elements = values.map((value) => GraphicalSortsElement.from(value));
  const producer = quickSort(elements);
  const controller = new VisualiserController();
  return { producer, controller };
};

beforeAll(() => {
  (SVGElement.prototype as unknown as SVGGraphicsElement).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
  (SVGElement.prototype as unknown as SVGGraphicsElement).getCTM = () => null;
});

class EmptyProducer extends AnimationProducer {}

describe('VisualiserController playback state', () => {
  it('starts paused, enters playing on constructTimeline, and transitions across pause, seek, step, and complete', () => {
    const { producer, controller } = setupController([3, 1, 2]);
    expect(controller.playback, 'fresh controller with no timeline should report paused').toBe(
      'paused'
    );

    controller.constructTimeline(producer, () => {});
    expect(controller.playback, 'constructTimeline with runners should enter playing').toBe(
      'playing'
    );

    controller.pause();
    expect(controller.playback, 'pause() should transition playback to paused').toBe('paused');

    controller.stepForwards();
    expect(controller.playback, 'stepForwards() should report playing while advancing a step').toBe(
      'playing'
    );

    controller.seekPercent(25);
    expect(
      controller.playback,
      'seekPercent() while stepping should cancel step mode and pause'
    ).toBe('paused');

    controller.play();
    expect(controller.playback, 'play() from paused at 25% should resume playing').toBe('playing');

    controller.seekPercent(100);
    controller.pause();
    expect(controller.playback, 'seeking to 100% should report complete').toBe('complete');

    controller.seekPercent(0);
    expect(controller.playback, 'rewinding to 0% while paused should return to paused').toBe(
      'paused'
    );
  });

  it('stays paused when constructTimeline receives a producer with no runners', () => {
    resetCanvases();
    const controller = new VisualiserController();
    const empty = new EmptyProducer();

    controller.constructTimeline(empty, () => {});
    expect(
      controller.playback,
      'constructTimeline with 0 runners must remain paused with 0 duration'
    ).toBe('paused');
    expect(controller.duration, 'empty producer should leave controller duration at 0').toBe(0);
  });
});
