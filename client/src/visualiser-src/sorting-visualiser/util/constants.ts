import { strokeWidth } from '../../common/constants';
import { canvasTheme } from '../../common/canvasTheme';

export const whitespace = 10;
export const topOffset = 60;
export const boxWidth = 50;
export const textCy = 230;
export const leftOffset = 70;

export const CANVAS = '#canvas';

export const shapeAttributes = {
  'stroke-width': strokeWidth,
  get stroke() {
    return canvasTheme.ink;
  },
  get fill() {
    return canvasTheme.ink;
  },
  opacity: 0,
};

export const textAttributes = {
  x: boxWidth / 2,
  y: topOffset,
  'dominant-baseline': 'middle',
  'text-anchor': 'middle',
  'stroke-width': 0,
  get 'font-family'() {
    return canvasTheme.fontFamily;
  },
  get fill() {
    return canvasTheme.ink;
  },
  opacity: 0,
};
