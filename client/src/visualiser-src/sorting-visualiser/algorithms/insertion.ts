import AnimationProducer from '@/visualiser-src/common/AnimationProducer';
import { canvasTheme } from '@/visualiser-src/common/canvasTheme';
import GraphicalSortsElement from '../data-structure/GraphicalSortsElement';
import SortsInsertionAnimationProducer from '../animation-producer/SortsInsertionAnimationProducer';

export function insertionSort(elements: GraphicalSortsElement[]): AnimationProducer {
  const producer = new SortsInsertionAnimationProducer();

  producer.renderInsertionCode();

  const len = elements.length;

  let j = 0;
  // Make first node Sorted
  producer.doAnimationAndHighlightTimestamp(
    3,
    true,
    producer.highlightBoxes,
    [elements[0]],
    canvasTheme.accent
  );

  for (let i = 1; i < len; i += 1) {
    const val = elements[i];
    // Select current
    producer.doAnimationAndHighlightTimestamp(
      4,
      true,
      producer.highlightBoxes,
      [elements[i]],
      canvasTheme.compare
    );

    for (j = i; j > 0; j -= 1) {
      // Select comparison
      producer.doAnimationAndHighlightTimestamp(
        5,
        true,
        producer.highlightBoxes,
        [elements[j - 1]],
        canvasTheme.compare
      );
      // Do Comparison
      producer.doAnimationAndHighlightTimestamp(
        6,
        true,
        producer.highlightBoxes,
        [elements[j - 1]],
        canvasTheme.compare
      );
      if (val.data.value >= elements[j - 1].data.value) {
        // No swapping needed so turn j green
        producer.doAnimationAndHighlightTimestamp(
          7,
          true,
          producer.highlightBoxes,
          [elements[j - 1]],
          canvasTheme.accent
        );
        break;
      }
      // swap boxes
      producer.doAnimationAndHighlightTimestamp(
        8,
        true,
        producer.insertionSwap,
        elements[j - 1],
        j - 1,
        elements[j],
        j
      );
      [elements[j], elements[j - 1]] = [elements[j - 1], elements[j]];
    }

    producer.doAnimationAndHighlightTimestamp(
      3,
      true,
      producer.highlightBoxes,
      [elements[j]],
      canvasTheme.accent
    );
  }
  producer.highlightCode(11);
  producer.highlightBoxes(elements, canvasTheme.ink);
  producer.finishSequence();
  return producer;
}
