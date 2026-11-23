import { mergeCodeSnippet } from '../util/codeSnippets';
import { getX, getCx, getY } from '../util/helpers';
import GraphicalSortsElement from '../data-structure/GraphicalSortsElement';
import SortsAnimationProducer from './SortsAnimationProducer';
import { textCy } from '../util/constants';
import { canvasTheme } from '../../common/canvasTheme';

export default class SortsMergeAnimationProducer extends SortsAnimationProducer {
  private comparisonCount = 0;

  private readonly drop: number;

  public constructor(drop = 120 * canvasTheme.sortBarScale) {
    super();
    this.drop = drop;
  }

  /** Comparisons of the two halves' values so far. */
  public get comparisons(): number {
    return this.comparisonCount;
  }

  protected get counter(): number {
    return this.comparisonCount;
  }

  public countComparison(): void {
    this.comparisonCount += 1;
  }

  public renderMergeCode() {
    this.renderCode(mergeCodeSnippet);
  }

  public highlightSorting(low: number, high: number, elementList: GraphicalSortsElement[]) {
    this.highlightBoxes(elementList.slice(low, high + 1), canvasTheme.compare);
  }

  public compareElements(first: GraphicalSortsElement, second: GraphicalSortsElement) {
    this.highlightItem(first, canvasTheme.pointer);
    this.highlightItem(second, canvasTheme.pointer);
  }

  public moveDown(element: GraphicalSortsElement, index: number) {
    const xTo = getX(index);
    const cxTo = getCx(index);
    const yTo = getY(element.data.value) + this.drop;
    const cyTo = textCy + this.drop;

    this.addSequenceAnimation(element.boxTarget.animate().x(xTo).y(yTo));
    this.addSequenceAnimation(element.numberTarget.animate().cx(cxTo).cy(cyTo));
    this.addSequenceAnimation(element.boxTarget.animate().attr({ opacity: 1 }));

    this.addSequenceAnimation(element.boxTarget.animate(1).attr({ stroke: canvasTheme.accent }));
    this.addSequenceAnimation(element.boxTarget.animate(1).attr({ fill: canvasTheme.accent }));
    this.addSequenceAnimation(element.numberTarget.animate(1).attr({ fill: canvasTheme.accent }));
  }

  public moveUp(element: GraphicalSortsElement, index: number) {
    const xTo = getX(index);
    const cxTo = getCx(index);
    const yTo = getY(element.data.value);

    this.addSequenceAnimation(element.boxTarget.animate(1).attr({ stroke: canvasTheme.ink }));
    this.addSequenceAnimation(element.boxTarget.animate(1).attr({ fill: canvasTheme.ink }));
    this.addSequenceAnimation(element.numberTarget.animate(1).attr({ fill: canvasTheme.ink }));

    this.addSequenceAnimation(element.boxTarget.animate().x(xTo).y(yTo));
    this.addSequenceAnimation(element.numberTarget.animate().cx(cxTo).cy(textCy));
  }
}
