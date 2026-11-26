import { palette } from '@/visualiser-src/common/palette';
import { strokeWidth } from './constants';

export const nodeStyle = {
  get fill() {
    return palette.nodeFill;
  },
  get stroke() {
    return palette.ink;
  },
  'stroke-width': strokeWidth,
  opacity: 0,
};

export const nodeWidth = 50;

export const textStyle = {
  'dominant-baseline': 'middle',
  'text-anchor': 'middle',
  get fill() {
    return palette.ink;
  },
  get 'font-family'() {
    return palette.fontFamily;
  },
  'font-size': '24',
  opacity: 0,
};

export const lineStyle = {
  'stroke-width': 3,
  'stroke-linecap': 'round',
  opacity: 0,
  get stroke() {
    return palette.ink;
  },
};

// we need this so that all svg elements have some padding
export const canvasPadding = 40;
export const lineDiffY = 75;
