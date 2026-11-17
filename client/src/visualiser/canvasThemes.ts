import { CanvasTheme } from '@/visualiser-src/common/canvasTheme';
import { Theme } from '@/ui/theme';

const shared: Partial<CanvasTheme> = {
  fontFamily: "'JetBrains Mono Variable', monospace",
  sortBarScale: 2.2,
  pointerText: true,
};

/** Whatever is current is marked in the logo's sand, in the drawing as in the code. */
export const canvasThemes: Record<Theme, Partial<CanvasTheme>> = {
  light: {
    ...shared,
    ink: '#23225E',
    nodeFill: '#FFFFFF',
    accent: '#A8741F',
    onAccent: '#FFFFFF',
    danger: '#D64545',
    compare: '#6A4FC4',
    pointer: '#A8741F',
    currFill: '#E9C98A',
    currStroke: '#A8741F',
    pointerLabel: '#23225E',
    prevFill: '#D64545',
    prevStroke: '#D64545',
  },
  dark: {
    ...shared,
    ink: '#ECEEFF',
    nodeFill: '#1B1B42',
    accent: '#E9C98A',
    onAccent: '#1A1638',
    danger: '#FF7A7A',
    compare: '#C8B6FF',
    pointer: '#E9C98A',
    currFill: '#E9C98A',
    currStroke: '#C9A15E',
    pointerLabel: '#ECEEFF',
    prevFill: '#FF7A7A',
    prevStroke: '#FF7A7A',
  },
};
