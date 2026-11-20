import AnimationProducer from '@/visualiser-src/common/AnimationProducer';
import { canvasTheme } from '@/visualiser-src/common/canvasTheme';
import GraphicalSortsElement from '../data-structure/GraphicalSortsElement';
import SortsSelectionAnimationProducer from '../animation-producer/SortsSelectionAnimationProducer';

export function selectionSort(elements: GraphicalSortsElement[]): AnimationProducer {
  const producer = new SortsSelectionAnimationProducer();

  producer.renderSelectionCode();

  // Slowly move boundary between sorted and unsorted partitions of the array
  for (let i = 0; i < elements.length - 1; i += 1) {
    // Select the minimum element in the unsorted partition of the array
    producer.doAnimationAndHighlight(3, producer.highlightItem, elements[i], canvasTheme.pointer);
    let minIndex = i;

    for (let j = i + 1; j < elements.length; j += 1) {
      producer.doAnimationAndHighlight(5, producer.check, elements[j]);

      if (elements[j].data.value < elements[minIndex].data.value) {
        producer.doAnimationAndHighlight(6, producer.select, elements[j], elements[minIndex]);
        minIndex = j;
      } else {
        producer.bufferUnhighlight(elements[j]);
      }
    }

    // Swap the selected minimum element to place it in sorted position
    producer.doAnimationAndHighlight(
      8,
      producer.selectionSwap,
      elements[i],
      i,
      elements[minIndex],
      minIndex
    );
    [elements[i], elements[minIndex]] = [elements[minIndex], elements[i]];
    producer.doAnimationAndHighlight(
      2,
      producer.finishSelectionRound,
      elements[i],
      elements[minIndex],
      i !== minIndex
    );
  }

  producer.doAnimationAndHighlight(10, producer.highlightAll, elements, canvasTheme.accent);
  producer.doAnimation(producer.highlightAll, elements, canvasTheme.ink);

  return producer;
}
