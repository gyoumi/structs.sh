// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { CODE_CANVAS, CODE_CONTAINER, VISUALISER_CANVAS } from '@/visualiser-src/common/constants';
import VisualiserController from '@/visualiser-src/controller/VisualiserController';
import GraphicalSortsElement from '../data-structure/GraphicalSortsElement';
import { quickSort } from './quick';

const resetCanvases = () => {
  const visualiserId = VISUALISER_CANVAS.replace(/^#/, '');
  const codeId = CODE_CANVAS.replace(/^#/, '');
  document.body.innerHTML = `<svg id="${visualiserId}"></svg><svg id="${codeId}"></svg><div id="${CODE_CONTAINER}"></div>`;
};

const runController = (values: number[]) => {
  resetCanvases();
  const elements = values.map((value) => GraphicalSortsElement.from(value));
  const producer = quickSort(elements);
  const controller = new VisualiserController();
  controller.constructTimeline(producer, () => {});
  controller.pause();
  return { producer, controller };
};

beforeAll(() => {
  (SVGElement.prototype as unknown as SVGGraphicsElement).getBBox = () =>
    ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
  (SVGElement.prototype as unknown as SVGGraphicsElement).getCTM = () => null;
});

describe('quicksort step trace metadata', () => {
  it('returns null before the first step and after the sort finishes', () => {
    const { controller } = runController([3, 1, 2]);
    expect(
      controller.traceAt(0),
      'quickSort([3, 1, 2]) at time 0: expected traceAt(0) to be null before playback starts'
    ).toBeNull();
    expect(
      controller.traceAt(controller.duration),
      `quickSort([3, 1, 2]) at duration ${controller.duration}: expected traceAt(duration) to clear to null once solved`
    ).toBeNull();
  });

  it('records the pivot and every value comparison in exact operand order and tone for [3, 1, 2]', () => {
    // Hand trace for [3, 1, 2]:
    // partition(0, 2): pivot v = 3, i = 1 (val 1), j = 2 (val 2)
    //   1. i-scan: 1 <= 3 (true, pointer) -> i = 2
    //   2. i-scan: 2 <= 3 (true, pointer), i < j is false so loop stops
    //   3. j-scan: 3 < 2 (false, danger)
    //   4. i === j -> break
    //   5. placement: 2 < 3 (true, compare) -> swap 3 and 2 -> [2, 1, 3]
    // partition(0, 1): pivot v = 2, i = 1 (val 1), j = 1
    //   6. i-scan: 1 <= 2 (true, pointer), i < j is false
    //   7. j-scan: 2 < 1 (false, danger)
    //   8. i === j -> break
    //   9. placement: 1 < 2 (true, compare) -> swap 2 and 1 -> [1, 2, 3]
    const { producer, controller } = runController([3, 1, 2]);
    const counterRunners = producer.allRunners.filter((r) => r.counter !== undefined);
    const comparisons = counterRunners.reduce<
      Array<{
        pivot: number;
        left: number;
        op: string;
        right: number;
        result: boolean;
        tone: string;
      }>
    >((acc, runner, idx) => {
      const prev = idx > 0 ? counterRunners[idx - 1].counter : 0;
      if (runner.counter !== prev && runner.trace?.comparison) {
        acc.push({ pivot: runner.trace.pivot, ...runner.trace.comparison });
      }
      return acc;
    }, []);

    expect(
      comparisons,
      'quickSort([3, 1, 2]): expected 7 comparison traces matching a[i] <= v, v < a[j], and a[i] < v in order'
    ).toEqual([
      { pivot: 3, left: 1, op: '<=', right: 3, result: true, tone: 'pointer' },
      { pivot: 3, left: 2, op: '<=', right: 3, result: true, tone: 'pointer' },
      { pivot: 3, left: 3, op: '<', right: 2, result: false, tone: 'danger' },
      { pivot: 3, left: 2, op: '<', right: 3, result: true, tone: 'compare' },
      { pivot: 2, left: 1, op: '<=', right: 2, result: true, tone: 'pointer' },
      { pivot: 2, left: 2, op: '<', right: 1, result: false, tone: 'danger' },
      { pivot: 2, left: 1, op: '<', right: 2, result: true, tone: 'compare' },
    ]);

    // Stepping through timestamps visits both pivot 3 and pivot 2 and restores earlier traces when scrubbing back.
    const pivots = controller.stepTimes.map((t) => controller.traceAt(t)?.pivot ?? null);
    const firstPivot3 = controller.stepTimes.find((t) => controller.traceAt(t)?.pivot === 3);
    const firstPivot2 = controller.stepTimes.find((t) => controller.traceAt(t)?.pivot === 2);
    expect(
      firstPivot3,
      `quickSort([3, 1, 2]): expected a timeline step with pivot 3, saw pivots ${JSON.stringify(pivots)}`
    ).toBeDefined();
    expect(
      firstPivot2,
      `quickSort([3, 1, 2]): expected a later timeline step with pivot 2, saw pivots ${JSON.stringify(pivots)}`
    ).toBeDefined();
    expect(
      firstPivot2!,
      `quickSort([3, 1, 2]): expected pivot 2 step (${firstPivot2}) to come after pivot 3 step (${firstPivot3})`
    ).toBeGreaterThan(firstPivot3!);
    expect(
      controller.traceAt(firstPivot3!)?.pivot,
      `quickSort([3, 1, 2]): querying earlier timestamp ${firstPivot3} after ${firstPivot2} should still return pivot 3`
    ).toBe(3);
  });

  it('matches comparison count parity: every comparison step carries a comparison trace on DAILY_12', () => {
    const { producer } = runController([8, 1, 6, 3, 2, 7, 4, 5]);
    let prevCounter = 0;
    let tracedComparisons = 0;
    producer.allRunners.forEach((runner) => {
      const nextCounter = runner.counter ?? prevCounter;
      if (nextCounter > prevCounter) {
        expect(
          runner.trace?.comparison,
          `DAILY_12 comparison #${nextCounter}: expected runner.trace.comparison to be populated when counter increments`
        ).toBeDefined();
        tracedComparisons += 1;
        prevCounter = nextCounter;
      }
    });
    expect(
      tracedComparisons,
      `DAILY_12: expected ${producer.comparisons} traced comparisons, got ${tracedComparisons}`
    ).toBe(producer.comparisons);
  });
});
