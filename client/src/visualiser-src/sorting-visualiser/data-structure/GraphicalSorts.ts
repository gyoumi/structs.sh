import { SVG } from '@svgdotjs/svg.js';
import AnimationProducer from '@/visualiser-src/common/AnimationProducer';
import { Documentation } from '@/visualiser-src/common/typedefs';
import GraphicalDataStructure from '@/visualiser-src/common/GraphicalDataStructure';
import { injectIds } from '@/visualiser-src/common/helpers';
import { getCanvasTarget } from '@/visualiser-src/common/canvasTarget';
import { generateNumbers } from '@/visualiser-src/common/RandomNumGenerator';
import GraphicalSortsElement from './GraphicalSortsElement';
import SortsCreateAnimationProducer from '../animation-producer/SortsCreateAnimationProducer';
import { bubbleSort } from '../algorithms/bubble';
import { insertionSort } from '../algorithms/insertion';
import { mergeSort } from '../algorithms/merge';
import { quickSort } from '../algorithms/quick';
import { selectionSort } from '../algorithms/selection';

export default class GraphicalSortList extends GraphicalDataStructure {
  public elementList: GraphicalSortsElement[] = [];

  private static documentation: Documentation = injectIds({
    append: {
      args: ['values'],
      description: 'Add element to list of elements to sort',
      noTimeline: true,
    },
    delete: {
      args: ['values'],
      description: 'Delete elements from list of elements to sort',
      noTimeline: true,
    },
    bubble: {
      args: [],
      description: 'Bubble Sort',
    },
    merge: {
      args: [],
      description: 'Merge Sort',
    },
    insertion: {
      args: [],
      description: 'Insertion Sort',
    },
    selection: {
      args: [],
      description: 'Selection sort',
    },
    quick: {
      args: [],
      description: 'Quick Sort',
    },
  });

  public get data(): number[] {
    const data: number[] = [];
    this.elementList.forEach((element) => {
      data.push(element.data.value);
    });
    return data;
  }

  public append(values: number[]): AnimationProducer {
    const producer = new SortsCreateAnimationProducer();
    values.forEach((value) => {
      const element = GraphicalSortsElement.from(value);
      producer.addBlock(value, this.elementList.length, element);
      this.elementList.push(element);
    });
    return producer;
  }

  public delete(values: number[]): AnimationProducer {
    const producer = new SortsCreateAnimationProducer();
    const listValues = this.elementList
      .map((element) => element.data.value)
      .filter((x) => !values.includes(x));

    // Clear the canvas, and re-insert the existing values in the list into the canvas
    SVG(getCanvasTarget().canvas).clear();
    this.elementList = [];
    this.append(listValues);

    return producer;
  }

  public bubble(): AnimationProducer {
    return bubbleSort(this.elementList);
  }

  public merge(): AnimationProducer {
    return mergeSort(this.elementList);
  }

  public insertion(): AnimationProducer {
    return insertionSort(this.elementList);
  }

  public quick(): AnimationProducer {
    return quickSort(this.elementList);
  }

  public selection(): AnimationProducer {
    return selectionSort(this.elementList);
  }

  public get documentation(): Documentation {
    return GraphicalSortList.documentation;
  }

  public generate(): void {
    const numbers = generateNumbers();
    this.append(numbers);
  }

  public load(data: number[]): void {
    this.append(data);
  }
}
