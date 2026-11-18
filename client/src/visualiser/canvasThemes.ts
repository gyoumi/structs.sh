import { CanvasTheme } from '@/visualiser-src/common/canvasTheme';
import { Theme } from '@/ui/theme';

const shared: Partial<CanvasTheme> = {
  fontFamily: "'Fredoka Variable', sans-serif",
  sortBarScale: 2.2,
  pointerText: true,
};

export const canvasThemes: Record<Theme, Partial<CanvasTheme>> = {
  light: {
    ...shared,
    ink: '#23225E',
    nodeFill: '#FFFFFF',
    /* Drawings are thin-lined, so a mid blue reads as faint beside the navy ink. */
    accent: '#2B65A6',
    onAccent: '#FFFFFF',
    danger: '#C53A3A',
    compare: '#946629',
    pointer: '#127A9C',
    currFill: '#3E7CB1',
    currStroke: '#3E7CB1',
    pointerLabel: '#23225E',
    prevFill: '#C53A3A',
    prevStroke: '#C53A3A',
  },
  dark: {
    ...shared,
    ink: '#ECEEFF',
    nodeFill: '#1B1B42',
    accent: '#5B8DB8',
    onAccent: '#1B1B42',
    danger: '#FF7A7A',
    compare: '#DDBB8A',
    pointer: '#8FC1DE',
    currFill: '#5B8DB8',
    currStroke: '#8FC1DE',
    pointerLabel: '#ECEEFF',
    prevFill: '#FF7A7A',
    prevStroke: '#FF7A7A',
  },
};
