import { SVG, Svg, Circle, Line, Marker, Text } from '@svgdotjs/svg.js';
import { markerLength, nodeDiameter, pathD } from '@/visualiser-src/common/constants';
import { canvasTheme } from './canvasTheme';
import { getCanvasTarget } from './canvasTarget';
import { lineStyle, nodeStyle, textStyle } from './settings';

const BASE_FONT_SIZE = Number(textStyle['font-size']);
const INNER_LABEL_WIDTH = nodeDiameter - 10;
const CHAR_WIDTH_RATIO = 0.65;

/** Scales tree-node labels above two characters so any signed 32-bit key fits inside the 50px node circle. */
export const treeNodeFontSize = (value: number): string => {
  const chars = String(value).length;
  if (chars <= 2) return textStyle['font-size'];
  return String(
    Math.min(BASE_FONT_SIZE, Number((INNER_LABEL_WIDTH / (chars * CHAR_WIDTH_RATIO)).toFixed(1)))
  );
};

interface SVGData {
  nodeTarget: Circle;
  textTarget: Text;
  leftLineTarget: Line;
  rightLineTarget: Line;
  leftArrowTarget: Marker;
  rightArrowTarget: Marker;
}

export interface GenericGraphicalTreeNodeData {
  svgData: SVGData;
  value: number;
  x: number;
  y: number;
}

export default class GenericGraphicalTreeNode {
  private _data: GenericGraphicalTreeNodeData;

  protected _left: GenericGraphicalTreeNode | null;

  protected _right: GenericGraphicalTreeNode | null;

  protected constructor(data: GenericGraphicalTreeNodeData) {
    this._data = data;
    this._left = null;
    this._right = null;
  }

  public static from(input: number): GenericGraphicalTreeNode {
    return new GenericGraphicalTreeNode(GenericGraphicalTreeNode.createData(input));
  }

  public get nodeTarget() {
    return this._data.svgData.nodeTarget;
  }

  public get textTarget() {
    return this._data.svgData.textTarget;
  }

  public get leftLineTarget() {
    return this._data.svgData.leftLineTarget;
  }

  public get rightLineTarget() {
    return this._data.svgData.rightLineTarget;
  }

  public get leftArrowTarget() {
    return this._data.svgData.leftArrowTarget;
  }

  public get rightArrowTarget() {
    return this._data.svgData.rightArrowTarget;
  }

  public get value() {
    return this._data.value;
  }

  public set value(value: number) {
    this._data.value = value;
  }

  public get x() {
    return this._data.x;
  }

  public set x(x: number) {
    this._data.x = x;
  }

  public get y() {
    return this._data.y;
  }

  public set y(y: number) {
    this._data.y = y;
  }

  public get left(): GenericGraphicalTreeNode | null {
    return this._left;
  }

  public set left(left: GenericGraphicalTreeNode | null) {
    this._left = left;
  }

  public get right(): GenericGraphicalTreeNode | null {
    return this._right;
  }

  public set right(right: GenericGraphicalTreeNode | null) {
    this._right = right;
  }

  protected static createData(input: number) {
    const canvas = SVG(getCanvasTarget().canvas) as Svg;
    const leftArrowTarget = canvas
      .marker(markerLength, markerLength, (add: Marker) => {
        add.path(pathD);
      })
      .attr({ markerUnits: 'userSpaceOnUse', fill: canvasTheme.ink });
    const rightArrowTarget = canvas
      .marker(markerLength, markerLength, (add: Marker) => {
        add.path(pathD);
      })
      .attr({ markerUnits: 'userSpaceOnUse', fill: canvasTheme.ink });
    const leftLineTarget = canvas.line().attr(lineStyle);
    leftLineTarget.marker('end', leftArrowTarget);
    const rightLineTarget = canvas.line().attr(lineStyle);
    rightLineTarget.marker('end', rightArrowTarget);
    const nodeTarget = canvas.circle(nodeDiameter).attr(nodeStyle);
    const textTarget = canvas
      .text(String(input))
      .attr(textStyle)
      .attr('font-size', treeNodeFontSize(input));
    return {
      svgData: {
        nodeTarget,
        textTarget,
        leftLineTarget,
        rightLineTarget,
        leftArrowTarget,
        rightArrowTarget,
      },
      value: input,
      x: 0,
      y: 0,
    };
  }
}
