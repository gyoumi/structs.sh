import { CanvasTheme } from '@/visualiser-src/common/canvasTheme';
import { Theme } from '@/ui/theme';

const shared: Partial<CanvasTheme> = {
  fontFamily: "'JetBrains Mono Variable', monospace",
  sortBarScale: 2.2,
  textPointerLabels: true,
};

export const canvasThemes: Record<Theme, Partial<CanvasTheme>> = {
  light: {
    ...shared,
    ink: '#23225E',
    nodeFill: '#FFFFFF',
    accent: '#8A5C12',
    onAccent: '#FFFFFF',
    danger: '#C53A3A',
    compare: '#6A4FC4',
    pointer: '#93641B',
    currFill: '#E9C98A',
    currStroke: '#8A5C12',
    pointerLabelColor: '#23225E',
    prevFill: '#C53A3A',
    prevStroke: '#C53A3A',
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
    pointerLabelColor: '#ECEEFF',
    prevFill: '#FF7A7A',
    prevStroke: '#FF7A7A',
  },
};
