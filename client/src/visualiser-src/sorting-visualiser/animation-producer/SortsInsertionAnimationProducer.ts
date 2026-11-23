import { insertionCodeSnippet } from '../util/codeSnippets';
import GraphicalSortsElement from '../data-structure/GraphicalSortsElement';
import SortsAnimationProducer from './SortsAnimationProducer';
import { canvasTheme } from '../../common/canvasTheme';

export default class SortsInsertionAnimationProducer extends SortsAnimationProducer {
  private comparisonCount = 0;

  /** Evaluations of `val >= a[j - 1]` so far. */
  public get comparisons(): number {
    return this.comparisonCount;
  }

  protected get counter(): number {
    return this.comparisonCount;
  }

  public countComparison(): void {
    this.comparisonCount += 1;
  }

  public renderInsertionCode() {
    this.renderCode(insertionCodeSnippet);
  }

  public insertionSwap(
    from: GraphicalSortsElement,
    fromIndex: number,
    to: GraphicalSortsElement,
    toIndex: number
  ) {
    this.swap(from, fromIndex, to, toIndex);

    this.addSequenceAnimation(
      from.boxTarget.animate(1).attr({ stroke: canvasTheme.accent, fill: canvasTheme.accent })
    );
    this.addSequenceAnimation(from.numberTarget.animate(1).attr({ fill: canvasTheme.accent }));
  }
}
