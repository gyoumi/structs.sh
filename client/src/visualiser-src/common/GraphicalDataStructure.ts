import { SVG } from '@svgdotjs/svg.js';
import { Documentation } from './typedefs';
import { getCanvasTarget } from './canvasTarget';

abstract class GraphicalDataStructure {
  public constructor() {
    const target = getCanvasTarget();
    SVG(target.canvas).clear();
    SVG(target.code).clear();
    // Set the code container height to 0 to prevent scrolling due to overflow
    const codeContainer = document.getElementById(target.codeContainer);
    if (codeContainer) {
      codeContainer.style.height = '0';
    }
  }

  public abstract get documentation(): Documentation;

  public abstract generate(): void;

  // Return data of the data structure in the form of an array
  public get data(): number[] {
    return [1, 2, 3];
  }

  // Loads data structure from given data
  // TODO: What's the progress with graph??
  public load(data: number[]): void {
    console.log('Loading data structure with data: ', data);
  }
}

export default GraphicalDataStructure;
