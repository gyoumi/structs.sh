import GraphicalSortsElement from '../data-structure/GraphicalSortsElement';
import SortsBubbleAnimationProducer from '../animation-producer/SortsBubbleAnimationProducer';

export function bubbleSort(elements: GraphicalSortsElement[]): SortsBubbleAnimationProducer {
  const producer = new SortsBubbleAnimationProducer();

  const len = elements.length;

  producer.renderBubbleCode();
  for (let i = 0; i < len - 1; i += 1) {
    producer.startPass();
    let swapsThisPass = 0;
    for (let j = 1; j < len - i; j += 1) {
      producer.doAnimationAndHighlightTimestamp(
        5,
        true,
        producer.compare,
        elements[j - 1],
        elements[j],
        j === len - i - 1
      );
      if (elements[j].data.value < elements[j - 1].data.value) {
        producer.countSwap();
        producer.doAnimationAndHighlightTimestamp(
          6,
          true,
          producer.bubbleSwap,
          elements[j - 1],
          j - 1,
          elements[j],
          j === len - i - 1,
          j
        );
        [elements[j], elements[j - 1]] = [elements[j - 1], elements[j]];
        swapsThisPass += 1;
      }
    }
    if (swapsThisPass === 0) break;
  }
  if (len > 0) producer.doAnimationAndHighlight(11, producer.finishSequence, false);

  return producer;
}
