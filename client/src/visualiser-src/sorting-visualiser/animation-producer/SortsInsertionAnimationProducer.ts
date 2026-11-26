import { palette } from '@/visualiser-src/common/palette';
import { insertionCodeSnippet } from '../util/codeSnippets';
import GraphicalSortsElement from '../data-structure/GraphicalSortsElement';
import SortsAnimationProducer from './SortsAnimationProducer';

export default class SortsInsertionAnimationProducer extends SortsAnimationProducer {
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
      from.boxTarget.animate(1).attr({ stroke: palette.highlight, fill: palette.highlight })
    );
    this.addSequenceAnimation(from.numberTarget.animate(1).attr({ fill: palette.highlight }));
  }
}
