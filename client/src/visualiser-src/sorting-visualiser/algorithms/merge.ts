import GraphicalSortsElement from '../data-structure/GraphicalSortsElement';
import SortsMergeAnimationProducer from '../animation-producer/SortsMergeAnimationProducer';
import { getBarHeight } from '../util/helpers';

const MERGE_ROW_GAP = 42;

function mergeRange(
  elements: GraphicalSortsElement[],
  producer: SortsMergeAnimationProducer,
  low: number,
  high: number,
  tmpList: GraphicalSortsElement[]
) {
  if (high <= low) {
    return;
  }

  const mid = Math.floor((low + high) / 2);

  let p = low;

  mergeRange(elements, producer, low, mid, tmpList);
  mergeRange(elements, producer, mid + 1, high, tmpList);

  let pointerLeft = low;
  let pointerRight = mid + 1;

  producer.doAnimationAndHighlight(1, producer.highlightSorting, low, high, elements);

  while (pointerLeft <= mid && pointerRight <= high) {
    producer.countComparison();
    if (elements[pointerLeft].data.value <= elements[pointerRight].data.value) {
      producer.doAnimationAndHighlight(
        13,
        producer.compareElements,
        elements[pointerLeft],
        elements[pointerRight]
      );

      producer.doAnimationAndHighlight(14, producer.moveDown, elements[pointerLeft], p);
      tmpList[p] = elements[pointerLeft];
      p += 1;
      pointerLeft += 1;
    } else {
      producer.doAnimationAndHighlight(
        15,
        producer.compareElements,
        elements[pointerLeft],
        elements[pointerRight]
      );

      producer.doAnimationAndHighlight(16, producer.moveDown, elements[pointerRight], p);
      tmpList[p] = elements[pointerRight];
      p += 1;
      pointerRight += 1;
    }
  }

  if (pointerLeft === mid + 1) {
    while (pointerRight <= high) {
      producer.doAnimationAndHighlight(20, producer.moveDown, elements[pointerRight], p);
      tmpList[p] = elements[pointerRight];
      p += 1;
      pointerRight += 1;
    }
  } else {
    while (pointerLeft <= mid) {
      producer.doAnimationAndHighlight(19, producer.moveDown, elements[pointerLeft], p);
      tmpList[p] = elements[pointerLeft];
      p += 1;
      pointerLeft += 1;
    }
  }

  for (let i = low; i <= high; i += 1) {
    elements[i] = tmpList[i];
  }

  for (let i = low; i <= high; i += 1) {
    producer.doAnimationAndHighlightTimestamp(24, false, producer.moveUp, elements[i], i);
  }
}

export function mergeSort(elements: GraphicalSortsElement[]): SortsMergeAnimationProducer {
  const maxBarHeight = elements.reduce(
    (tallest, element) => Math.max(tallest, getBarHeight(element.data.value)),
    0
  );
  const producer = new SortsMergeAnimationProducer(Math.ceil(maxBarHeight + MERGE_ROW_GAP));

  producer.renderMergeCode();

  const tmpList = [...elements];

  mergeRange(elements, producer, 0, elements.length - 1, tmpList);

  return producer;
}
