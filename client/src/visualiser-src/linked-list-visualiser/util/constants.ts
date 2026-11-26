// SVG Attributes
import { palette } from '@/visualiser-src/common/palette';
import { nodeDiameter, strokeWidth, actualNodeDiameter } from '../../common/constants';

export const pathLength = 50;
export const nodePathWidth = actualNodeDiameter + pathLength;
export const topOffset = 150;
export const insertedNodeTopOffset =
  topOffset + (actualNodeDiameter + pathLength) * Math.sin(Math.PI / 3);
export const CURRENT = '#current';
export const PREV = '#prev';
export const CANVAS = '#visualiser-canvas';
export const nodeAttributes = {
  class: 'node',
  get stroke() {
    return palette.ink;
  },
  opacity: 0,
};

export const shapeAttributes = {
  r: nodeDiameter / 2,
  'stroke-width': strokeWidth,
  get stroke() {
    return palette.ink;
  },
  get fill() {
    return palette.nodeFill;
  },
  opacity: 0,
};

export const textAttributes = {
  x: actualNodeDiameter / 2,
  y: topOffset,
  'dominant-baseline': 'middle',
  'text-anchor': 'middle',
  'stroke-width': 0,
  get fill() {
    return palette.ink;
  },
  get 'font-family'() {
    return palette.fontFamily;
  },
  'font-size': '24',
  opacity: 0,
};

export const pathAttributes = {
  'stroke-width': strokeWidth,
  get stroke() {
    return palette.ink;
  },
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  class: 'path',
  opacity: 0,
};
