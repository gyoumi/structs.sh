import { G, SVG, Svg } from '@svgdotjs/svg.js';
import { canvasTheme } from '@/visualiser-src/common/canvasTheme';
import { getCanvasTarget } from '@/visualiser-src/common/canvasTarget';
import currTextPath from '../assets/currTextPath';
import prevTextPath from '../assets/prevTextPath';

const addPointerLabel = (group: G, text: string, glyphPath: string) => {
  if (!canvasTheme.textPointerLabels) {
    group.path(glyphPath).fill(canvasTheme.pointerLabelColor);
    return;
  }
  group
    .plain(text)
    .font({ family: canvasTheme.fontFamily, size: 18, weight: 600, anchor: 'middle' })
    .attr({ x: 25, y: 48 })
    .fill(canvasTheme.pointerLabelColor);
};

export const drawPointerMarkers = (): void => {
  const canvas = SVG(getCanvasTarget().canvas) as Svg;
  const currGroup = canvas.group().opacity(0).id('current');
  currGroup
    .path('M18 27L25 1L32 27L25 23L18 27Z')
    .fill(canvasTheme.currFill)
    .stroke({ color: canvasTheme.currStroke, width: 2, linejoin: 'round' });
  addPointerLabel(currGroup, 'curr', currTextPath);
  const prevGroup = canvas.group().opacity(0).id('prev');
  prevGroup
    .path('M18 27L25 1L32 27L25 23L18 27Z')
    .fill({ color: canvasTheme.prevFill, opacity: 0.65 })
    .stroke({ color: canvasTheme.prevStroke, width: 2, linejoin: 'round' });
  addPointerLabel(prevGroup, 'prev', prevTextPath);
};
