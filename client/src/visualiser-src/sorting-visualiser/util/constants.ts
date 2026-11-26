import { palette, onPaletteChange } from '@/visualiser-src/common/palette';
import { strokeWidth } from '../../common/constants';

export const whitespace = 10;
export const topOffset = 60;
export const boxWidth = 50;
export const textCy = 230;
export const leftOffset = 70;

// Live bindings: importers see the new colours when the palette changes.
/* eslint-disable import/no-mutable-exports */
export let defaultColour = palette.ink;
export let sortedColour = palette.highlight;
export let checkingColour = palette.comparing;
export let comparingColor = palette.comparing;
export let selectedColor = palette.selected;
export let redColour = palette.sortAlert;
/* eslint-enable import/no-mutable-exports */

onPaletteChange(() => {
  defaultColour = palette.ink;
  sortedColour = palette.highlight;
  checkingColour = palette.comparing;
  comparingColor = palette.comparing;
  selectedColor = palette.selected;
  redColour = palette.sortAlert;
});

export const CANVAS = '#canvas';

export const shapeAttributes = {
  'stroke-width': strokeWidth,
  get stroke() {
    return palette.ink;
  },
  get fill() {
    return palette.ink;
  },
  opacity: 0,
};

export const textAttributes = {
  x: boxWidth / 2,
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
  opacity: 0,
};
