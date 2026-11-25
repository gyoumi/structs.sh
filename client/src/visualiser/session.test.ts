// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { CODE_CANVAS, CODE_CONTAINER, VISUALISER_CANVAS } from '@/visualiser-src/common/constants';
import { canvasThemes } from './canvasThemes';
import { VisualiserSession } from './session';
import { findTopic } from './topics';

const resetCanvases = () => {
  const visualiserId = VISUALISER_CANVAS.replace(/^#/, '');
  const codeId = CODE_CANVAS.replace(/^#/, '');
  document.body.innerHTML = `<svg id="${visualiserId}"></svg><svg id="${codeId}"></svg><div id="${CODE_CONTAINER}"></div>`;
};

beforeAll(() => {
  (SVGElement.prototype as unknown as SVGGraphicsElement).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
  (SVGElement.prototype as unknown as SVGGraphicsElement).getCTM = () => null;
});

describe('VisualiserSession explicit playback sync', () => {
  it('publishes exact progress on finish() even when already within 0.05% of the end', () => {
    resetCanvases();
    const sorting = findTopic('sorting-algorithms');
    if (!sorting) throw new Error('The sorting topic is missing.');
    const session = new VisualiserSession();
    session.attach(sorting.title, canvasThemes.light, [8, 1, 6, 3, 2, 7, 4, 5], undefined, true);
    const error = session.run('quick', []);
    expect(error, 'running quick on Sorting should succeed without error').toBe('');
    expect(
      session.getSnapshot().playback,
      'session.run() should synchronously report playing'
    ).toBe('playing');

    const { duration } = session.getSnapshot();
    const nearEndPercent = ((duration - 0.5) / duration) * 100;
    session.seekToPercent(nearEndPercent);
    expect(
      session.getSnapshot().progress,
      `seekToPercent(${nearEndPercent}) should stop below 100% before finish()`
    ).toBeLessThan(100);

    session.finish();
    expect(
      session.getSnapshot().progress,
      'finish() must publish exact progress 100 even within the 0.05% ticker deadband'
    ).toBe(100);
    expect(session.getSnapshot().playback, 'finish() must leave playback at complete').toBe(
      'complete'
    );

    session.dispose();
  });
});
