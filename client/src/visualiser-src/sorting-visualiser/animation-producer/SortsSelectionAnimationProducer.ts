import { selectionCodeSnippet } from '../util/codeSnippets';
import GraphicalSortsElement from '../data-structure/GraphicalSortsElement';
import SortsAnimationProducer from './SortsAnimationProducer';
import { canvasTheme } from '../../common/canvasTheme';

export default class SortsSelectionAnimationProducer extends SortsAnimationProducer {
  public renderSelectionCode() {
    this.renderCode(selectionCodeSnippet);
  }

  public check(currItem: GraphicalSortsElement) {
    this.addSequenceAnimation(currItem.boxTarget.animate(1).attr({ stroke: canvasTheme.compare }));
    this.addSequenceAnimation(currItem.boxTarget.animate(1).attr({ fill: canvasTheme.compare }));
    this.addSequenceAnimation(currItem.numberTarget.animate(1).attr({ fill: canvasTheme.compare }));
    this.addSequenceAnimation(currItem.numberTarget.animate());
    this.finishSequence();
  }

  public select(newMinItem: GraphicalSortsElement, previousMinItem: GraphicalSortsElement) {
    this.addSequenceAnimation(
      previousMinItem.boxTarget.animate(1).attr({ stroke: canvasTheme.ink })
    );
    this.addSequenceAnimation(previousMinItem.boxTarget.animate(1).attr({ fill: canvasTheme.ink }));
    this.addSequenceAnimation(
      previousMinItem.numberTarget.animate(1).attr({ fill: canvasTheme.ink })
    );
    this.addSequenceAnimation(
      newMinItem.boxTarget.animate(1).attr({ stroke: canvasTheme.pointer })
    );
    this.addSequenceAnimation(newMinItem.boxTarget.animate(1).attr({ fill: canvasTheme.pointer }));
    this.addSequenceAnimation(
      newMinItem.numberTarget.animate(1).attr({ fill: canvasTheme.pointer })
    );
    // Empty animation so that there's a pause
    this.addSequenceAnimation(newMinItem.numberTarget.animate());
    this.finishSequence();
  }

  public selectionSwap(
    iItem: GraphicalSortsElement,
    iIndex: number,
    minItem: GraphicalSortsElement,
    minIndex: number
  ) {
    if (iIndex !== minIndex) {
      this.addSequenceAnimation(iItem.boxTarget.animate(1).attr({ stroke: canvasTheme.pointer }));
      this.addSequenceAnimation(iItem.boxTarget.animate(1).attr({ fill: canvasTheme.pointer }));
      this.addSequenceAnimation(iItem.numberTarget.animate(1).attr({ fill: canvasTheme.pointer }));
      // Empty animation so that there's a pause
      this.addSequenceAnimation(iItem.numberTarget.animate());
    }
    this.swap(iItem, iIndex, minItem, minIndex);
  }

  public finishSelectionRound(
    newIthItem: GraphicalSortsElement,
    prevIthItem: GraphicalSortsElement,
    ithItemChanged: boolean
  ) {
    this.addSequenceAnimation(newIthItem.boxTarget.animate(1).attr({ stroke: canvasTheme.accent }));
    this.addSequenceAnimation(newIthItem.boxTarget.animate(1).attr({ fill: canvasTheme.accent }));
    this.addSequenceAnimation(
      newIthItem.numberTarget.animate(1).attr({ fill: canvasTheme.accent })
    );
    this.addSequenceAnimation(newIthItem.numberTarget.animate());
    if (ithItemChanged) {
      this.addSequenceAnimation(prevIthItem.boxTarget.animate(1).attr({ stroke: canvasTheme.ink }));
      this.addSequenceAnimation(prevIthItem.boxTarget.animate(1).attr({ fill: canvasTheme.ink }));
      this.addSequenceAnimation(
        prevIthItem.numberTarget.animate(1).attr({ fill: canvasTheme.ink })
      );
    }
  }

  public bufferUnhighlight(prevMin: GraphicalSortsElement) {
    this.addSequenceAnimation(prevMin.boxTarget.animate(1).attr({ stroke: canvasTheme.ink }));
    this.addSequenceAnimation(prevMin.boxTarget.animate(1).attr({ fill: canvasTheme.ink }));
    this.addSequenceAnimation(prevMin.numberTarget.animate(1).attr({ fill: canvasTheme.ink }));
  }

  public highlightAll(array: GraphicalSortsElement[], color: string) {
    array.forEach((item) => {
      this.addSequenceAnimation(item.boxTarget.animate(1).attr({ stroke: color }));
      this.addSequenceAnimation(item.boxTarget.animate(1).attr({ fill: color }));
      this.addSequenceAnimation(item.numberTarget.animate(1).attr({ fill: color }));
      // Empty animation so that there's a pause
      this.addSequenceAnimation(item.numberTarget.animate());
    });
    this.finishSequence();
  }
}
