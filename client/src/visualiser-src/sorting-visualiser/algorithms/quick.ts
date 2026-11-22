import { Polygon } from '@svgdotjs/svg.js';
import { canvasTheme } from '@/visualiser-src/common/canvasTheme';
import GraphicalSortsElement from '../data-structure/GraphicalSortsElement';
import SortsQuickAnimationProducer from '../animation-producer/SortsQuickAnimationProducer';

function partition(
  elements: GraphicalSortsElement[],
  lo: number,
  hi: number,
  producer: SortsQuickAnimationProducer,
  ipointer: Polygon,
  jpointer: Polygon
) {
  const v = elements[lo].data.value; // pivot
  // Highligh pivot
  producer.doAnimationAndHighlightTimestamp(
    11,
    true,
    producer.highlightBoxes,
    [elements[lo]],
    canvasTheme.compare
  );

  let i = lo + 1;
  // Set i pointer
  producer.doAnimationAndHighlightTimestamp(
    12,
    true,
    producer.initialisePointer,
    ipointer,
    i,
    canvasTheme.pointer
  );
  let j = hi;

  for (;;) {
    // Shift i pointer
    while (
      producer.countComparison(elements[i].data.value <= v, 14, elements[i], canvasTheme.pointer) &&
      i < j
    ) {
      i += 1;
      producer.doAnimationAndHighlightTimestamp(14, true, producer.movePointer, ipointer, i);
    }
    // Shift j pointer
    while (
      producer.countComparison(v < elements[j].data.value, 15, elements[j], canvasTheme.danger) &&
      j > i
    ) {
      j -= 1;
      producer.doAnimationAndHighlightTimestamp(15, true, producer.movePointer, jpointer, j);
    }

    if (i === j) {
      // Calculate center of partition
      let end = j;
      if (elements[j].data.value > v) {
        end = j;
      } else {
        end = j + 1;
      }

      // Highlight partition
      producer.highlightBoxes(elements.slice(lo + 1, end), canvasTheme.pointer);
      producer.doAnimationAndHighlightTimestamp(
        16,
        true,
        producer.highlightBoxes,
        elements.slice(end, hi + 1),
        canvasTheme.danger
      );
      break;
    }
    // Swap blocks at i and j
    producer.doAnimationAndHighlightTimestamp(
      17,
      true,
      producer.swap,
      elements[i],
      i,
      elements[j],
      j
    );
    [elements[i], elements[j]] = [elements[j], elements[i]];
  }

  // Swap Pivot with number at the center of partition that is less than it
  j = producer.countComparison(elements[i].data.value < v, 19, elements[i], canvasTheme.compare)
    ? i
    : i - 1;
  producer.doAnimationAndHighlightTimestamp(19, true, producer.movePointer, jpointer, j);
  producer.doAnimationAndHighlightTimestamp(
    20,
    true,
    producer.swap,
    elements[lo],
    lo,
    elements[j],
    j
  );
  [elements[lo], elements[j]] = [elements[j], elements[lo]];

  // Unhighlight partition
  producer.doAnimationAndHighlightTimestamp(
    21,
    true,
    producer.highlightBoxes,
    elements.slice(lo, hi + 1),
    canvasTheme.ink
  );

  return j;
}

function quickSortRange(
  elements: GraphicalSortsElement[],
  lo: number,
  hi: number,
  producer: SortsQuickAnimationProducer,
  ipointer: Polygon,
  jpointer: Polygon
) {
  // Base Case
  if (hi <= lo) {
    producer.doAnimationAndHighlightTimestamp(
      4,
      true,
      producer.highlightPointers,
      ipointer,
      canvasTheme.compare,
      jpointer,
      canvasTheme.compare
    );
    return;
  }

  // Start Partition
  producer.doAnimationAndHighlightTimestamp(
    5,
    true,
    producer.initialisePointers,
    ipointer,
    lo,
    canvasTheme.pointer,
    jpointer,
    hi,
    canvasTheme.danger
  );
  const i = partition(elements, lo, hi, producer, ipointer, jpointer);

  // Focus in on recursed section of array
  producer.greyOut(elements, lo, i - 1);
  producer.doAnimationAndHighlightTimestamp(
    6,
    true,
    producer.initialisePointers,
    ipointer,
    lo,
    canvasTheme.pointer,
    jpointer,
    i - 1,
    canvasTheme.danger
  );
  quickSortRange(elements, lo, i - 1, producer, ipointer, jpointer);

  producer.greyOut(elements, i + 1, hi);
  producer.initialisePointers(
    ipointer,
    i + 1,
    canvasTheme.pointer,
    jpointer,
    hi,
    canvasTheme.danger
  );
  // Make everything left of recursing array solved
  producer.doAnimationAndHighlightTimestamp(
    7,
    true,
    producer.highlightBoxes,
    elements.slice(0, i + 1),
    canvasTheme.accent
  );
  quickSortRange(elements, i + 1, hi, producer, ipointer, jpointer);
}

export function quickSort(elements: GraphicalSortsElement[]): SortsQuickAnimationProducer {
  const ipointer = GraphicalSortsElement.pointer(0, canvasTheme.pointer);
  const jpointer = GraphicalSortsElement.pointer(0, canvasTheme.danger);

  const producer = new SortsQuickAnimationProducer();
  producer.renderQuickCode();

  const len = elements.length;

  // Start quicksort
  quickSortRange(elements, 0, len - 1, producer, ipointer, jpointer);

  // End quicksort
  producer.hidePointers(ipointer, jpointer);
  producer.doAnimationAndHighlight(4, producer.makeSolved, elements);
  return producer;
}
