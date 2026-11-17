import { strokeWidth } from './constants';
import { canvasTheme } from './canvasTheme';

export const nodeStyle = {
  get fill() {
    return canvasTheme.nodeFill;
  },
  get stroke() {
    return canvasTheme.ink;
  },
  'stroke-width': strokeWidth,
  opacity: 0,
};

export const nodeWidth = 50;

export const textStyle = {
  'dominant-baseline': 'middle',
  'text-anchor': 'middle',
  get 'font-family'() {
    return canvasTheme.fontFamily;
  },
  'font-size': '24',
  get fill() {
    return canvasTheme.ink;
  },
  opacity: 0,
};

export const lineStyle = {
  'stroke-width': 3,
  'stroke-linecap': 'round',
  opacity: 0,
  get stroke() {
    return canvasTheme.ink;
  },
};

// we need this so that all svg elements have some padding
export const canvasPadding = 40;
export const lineDiffY = 75;
