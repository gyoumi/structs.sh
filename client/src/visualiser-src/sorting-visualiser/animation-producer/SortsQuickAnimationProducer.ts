import { Polygon, Svg } from '@svgdotjs/svg.js';
import { quickCodeSnippet } from '../util/codeSnippets';
import { getX } from '../util/helpers';
import GraphicalSortsElement from '../data-structure/GraphicalSortsElement';
import SortsAnimationProducer from './SortsAnimationProducer';
import { boxWidth } from '../util/constants';
import { canvasTheme } from '../../common/canvasTheme';
import { StepComparison, StepTrace } from '../../common/AnimationProducer';

export default class SortsQuickAnimationProducer extends SortsAnimationProducer {
  private comparisonCount = 0;

  private currentTrace: StepTrace | null = null;

  /** Number of value comparisons made by the quicksort that built this producer. */
  public get comparisons(): number {
    return this.comparisonCount;
  }

  protected get counter(): number {
    return this.comparisonCount;
  }

  protected get stepTrace(): StepTrace | null {
    return this.currentTrace;
  }

  /** Sets the pivot of the partition in progress, or clears the trace when the sort is done. */
  public setPivot(pivot: number | null): void {
    this.currentTrace = pivot === null ? null : { pivot };
  }

  /**
   * Records one value comparison and passes its result through. Each comparison gets a timeline
   * step of its own that marks the compared element, so the count changes by one per step.
   */
  public countComparison(
    result: boolean,
    line: number,
    element: GraphicalSortsElement,
    colour: string,
    comparison?: StepComparison
  ): boolean {
    this.comparisonCount += 1;
    const prior = this.currentTrace;
    if (comparison && prior) {
      this.currentTrace = { pivot: prior.pivot, comparison };
    }
    this.doAnimationAndHighlightTimestamp(line, true, this.markCompared, element, colour);
    if (prior) this.currentTrace = { pivot: prior.pivot };
    return result;
  }

  public markCompared(element: GraphicalSortsElement, colour: string) {
    this.addSequenceAnimation(
      element.boxTarget.animate(150).attr({ stroke: colour, fill: colour })
    );
    this.addSequenceAnimation(element.numberTarget.animate(150).attr({ fill: colour }));
  }

  public renderQuickCode() {
    this.renderCode(quickCodeSnippet);
  }

  public highlightPointer(pointer: Svg, colour: string) {
    this.addSequenceAnimation(pointer.animate(300).attr({ fill: colour }));
    this.finishSequence(false);
  }

  public highlightPointers(pointer: Svg, colour: string, pointer2: Svg, colour2: string) {
    this.addSequenceAnimation(pointer.animate(300).attr({ fill: colour }));
    this.addSequenceAnimation(pointer2.animate(300).attr({ fill: colour2 }));
  }

  public initialisePointer(pointer: Svg, index: number, colour: string) {
    this.addSequenceAnimation(pointer.animate(300).x(getX(index) + +boxWidth / 2 - 5));
    this.addSequenceAnimation(pointer.animate(300).attr({ fill: colour }));
    this.addSequenceAnimation(pointer.animate(300).attr({ opacity: 1 }));
  }

  public initialisePointers(
    pointer: Polygon,
    index: number,
    colour: string,
    pointer2: Polygon,
    index2: number,
    colour2: string
  ) {
    if (pointer.opacity() === 0) {
      this.addSequenceAnimation(pointer.animate(300).attr({ opacity: 1 }));
    }
    this.addSequenceAnimation(pointer.animate(300).x(getX(index) + +boxWidth / 2 - 5));
    this.addSequenceAnimation(pointer.animate(300).attr({ fill: colour }));

    if (pointer2.opacity() === 0) {
      this.addSequenceAnimation(pointer2.animate(300).attr({ opacity: 1 }));
    }
    this.addSequenceAnimation(pointer2.animate(300).x(getX(index2) + +boxWidth / 2 - 5));
    this.addSequenceAnimation(pointer2.animate(300).attr({ fill: colour2 }));
  }

  public greyOut(array: GraphicalSortsElement[], lo: number, hi: number) {
    array.forEach((x, i) => {
      if (i < lo || i > hi) {
        // Keep dimmed labels in theme ink (WCAG AA) while the bar fades.
        this.addSequenceAnimation(x.boxTarget.animate(300).attr({ opacity: 0.28 }));
        this.addSequenceAnimation(
          x.numberTarget.animate(300).attr({ opacity: 0.72, fill: canvasTheme.ink })
        );
      } else {
        this.addSequenceAnimation(x.boxTarget.animate(300).attr({ opacity: 1 }));
        this.addSequenceAnimation(x.numberTarget.animate(300).attr({ opacity: 1 }));
      }
    });
  }

  public hidePointers(pointer: Polygon, pointer2: Polygon) {
    this.addSequenceAnimation(pointer.animate(300).attr({ opacity: 0 }));
    this.addSequenceAnimation(pointer2.animate(300).attr({ opacity: 0 }));
    this.finishSequence(false);
  }

  public movePointer(pointer: Svg, index: number) {
    this.addSequenceAnimation(pointer.animate(300).x(getX(index) + +boxWidth / 2 - 5));
    this.addSequenceAnimation(pointer.animate(300).attr({ opacity: 1 }));
  }

  public makeSolved(array: GraphicalSortsElement[]) {
    this.highlightBoxes(array, canvasTheme.accent);
    array.forEach((x) => {
      this.addSequenceAnimation(x.boxTarget.animate(300).attr({ opacity: 1 }));
      this.addSequenceAnimation(x.numberTarget.animate(300).attr({ opacity: 1 }));
    });
    this.finishSequence(false);

    this.highlightBoxes(array, canvasTheme.ink);
  }
}
