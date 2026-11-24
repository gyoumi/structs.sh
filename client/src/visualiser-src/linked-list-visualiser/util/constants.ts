// SVG Attributes
import { nodeDiameter, strokeWidth, actualNodeDiameter } from '../../common/constants';
import { canvasTheme } from '../../common/canvasTheme';

export const pathLength = 50;
export const nodePathWidth = actualNodeDiameter + pathLength;
export const topOffset = 150;
export const insertedNodeTopOffset =
  topOffset + (actualNodeDiameter + pathLength) * Math.sin(Math.PI / 3);
export const CURVED_ARC_CONTROL_Y = 45;
export const LIST_ENVELOPE_TOP = 80;
export const LIST_ENVELOPE_BOTTOM = Math.ceil(insertedNodeTopOffset + actualNodeDiameter / 2) + 4;
export const CURRENT = '#current';
export const PREV = '#prev';
export const CANVAS = '#visualiser-canvas';
export const nodeAttributes = {
  class: 'node',
  get stroke() {
    return canvasTheme.ink;
  },
  opacity: 0,
};

export const shapeAttributes = {
  r: nodeDiameter / 2,
  'stroke-width': strokeWidth,
  get stroke() {
    return canvasTheme.ink;
  },
  get fill() {
    return canvasTheme.nodeFill;
  },
  opacity: 0,
};

export const textAttributes = {
  x: actualNodeDiameter / 2,
  y: topOffset,
  'dominant-baseline': 'middle',
  'text-anchor': 'middle',
  'stroke-width': 0,
  get 'font-family'() {
    return canvasTheme.fontFamily;
  },
  'font-size': '24',
  'font-weight': '600',
  get fill() {
    return canvasTheme.ink;
  },
  opacity: 0,
};

export const pathAttributes = {
  'stroke-width': strokeWidth,
  get stroke() {
    return canvasTheme.ink;
  },
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  class: 'path',
  opacity: 0,
};
