import AnimationProducer from '@/visualiser-src/common/AnimationProducer';
import GraphicalSortsElement from '../data-structure/GraphicalSortsElement';
import SortsBubbleAnimationProducer from '../animation-producer/SortsBubbleAnimationProducer';

export function bubbleSort(elements: GraphicalSortsElement[]): AnimationProducer {
  const producer = new SortsBubbleAnimationProducer();

  const len = elements.length;

  producer.renderBubbleCode();
  let numSwaps = 0;
  for (let i = 0; i < len; i += 1) {
    for (let j = 1; j < len - i; j += 1) {
      producer.doAnimationAndHighlightTimestamp(
        5,
        false,
        producer.compare,
        elements[j - 1],
        elements[j],
        j === len - i - 1
      );
      if (elements[j].data.value < elements[j - 1].data.value) {
        producer.doAnimationAndHighlightTimestamp(
          6,
          false,
          producer.bubbleSwap,
          elements[j - 1],
          j - 1,
          elements[j],
          j === len - i - 1,
          j
        );
        [elements[j], elements[j - 1]] = [elements[j - 1], elements[j]];
        numSwaps += 1;
      }
    }
    if (numSwaps === 0) {
      producer.doAnimationAndHighlight(11, producer.finishSequence, false);
      return producer;
    }
    numSwaps = 0;
  }

  return producer;
}
