import { SVG, Path, Text, Circle, Svg, Marker } from '@svgdotjs/svg.js';
import {
  shapeAttributes,
  textAttributes,
  pathAttributes,
  topOffset,
  nodePathWidth,
  LIST_ENVELOPE_TOP,
  LIST_ENVELOPE_BOTTOM,
} from '../util/constants';
import { getPointerPath, listNodeFontSize } from '../util/util';
import { actualNodeDiameter, markerLength, pathD } from '../../common/constants';
import { canvasTheme } from '../../common/canvasTheme';
import { getCanvasTarget } from '../../common/canvasTarget';

function addMarker(this: Path, add: Marker) {
  add.path(pathD);
  add.fill(canvasTheme.ink);
  this.attr('markerUnits', 'userSpaceOnUse');
}
interface SVGData {
  pointerTarget: Path;
  boxTarget: Circle;
  numberTarget: Text;
}

interface GraphicalLinkedListNodeData {
  value: number;
  svgData: SVGData;
}
export default class GraphicalLinkedListNode {
  private _data: GraphicalLinkedListNodeData;

  private _next: GraphicalLinkedListNode | null;

  private _x = 0;

  private _y = 0;

  private constructor(data: GraphicalLinkedListNodeData) {
    this._data = data;
    this._next = null;
  }

  public static newHeadPointer() {
    const { canvas } = getCanvasTarget();
    SVG()
      .rect(1, LIST_ENVELOPE_BOTTOM - LIST_ENVELOPE_TOP)
      .move(actualNodeDiameter / 2, LIST_ENVELOPE_TOP)
      .fill('none')
      .stroke('none')
      .attr({ 'pointer-events': 'none' })
      .addTo(canvas);
    SVG()
      .text('head')
      .attr(textAttributes)
      .opacity(1)
      .attr({ 'font-size': 16, 'font-family': canvasTheme.fontFamily })
      .addTo(canvas);
    const headPointer = SVG()
      .path()
      .attr(pathAttributes)
      .opacity(0)
      .plot(
        getPointerPath(
          actualNodeDiameter / 2,
          topOffset,
          actualNodeDiameter / 2 + nodePathWidth,
          topOffset
        )
      )
      .addTo(canvas);

    headPointer.marker('end', markerLength, markerLength, addMarker);
    return headPointer;
  }

  public static from(input: number) {
    const canvas = SVG(getCanvasTarget().canvas) as Svg;
    const newPointer = canvas
      .path()
      .attr(pathAttributes)
      .plot(getPointerPath(0, topOffset, nodePathWidth, topOffset));
    const nodeShape = canvas.circle().attr(shapeAttributes);
    const nodeValue = canvas
      .text(String(input))
      .attr(textAttributes)
      .attr('font-size', listNodeFontSize(input));
    newPointer.marker('end', markerLength, markerLength, addMarker);
    return new GraphicalLinkedListNode({
      value: input,
      svgData: {
        numberTarget: nodeValue,
        boxTarget: nodeShape,
        pointerTarget: newPointer,
      },
    });
  }

  public get data() {
    return this._data;
  }

  public get next(): GraphicalLinkedListNode | null {
    return this._next;
  }

  public set next(next: GraphicalLinkedListNode | null) {
    this._next = next;
  }

  public get value() {
    return this._data.value;
  }

  public get pointerTarget() {
    return this._data.svgData.pointerTarget;
  }

  public get boxTarget() {
    return this._data.svgData.boxTarget;
  }

  public get numberTarget() {
    return this._data.svgData.numberTarget;
  }

  /** Where the node's centre is once every animation produced so far has played. */
  public get x(): number {
    return this._x;
  }

  public get y(): number {
    return this._y;
  }

  /** Records where the node's centre will be once the animation placing it has played. */
  public placeAt(x: number, y: number) {
    this._x = x;
    this._y = y;
  }
}
