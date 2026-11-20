export interface CanvasTheme {
  ink: string;
  nodeFill: string;
  accent: string;
  onAccent: string;
  danger: string;
  compare: string;
  pointer: string;
  currFill: string;
  currStroke: string;
  pointerLabel: string;
  prevFill: string;
  prevStroke: string;
  codeBackground: string;
  codeText: string;
  fontFamily: string;
  sortBarScale: number;
  /** Labels the curr and prev pointers with text in `fontFamily` instead of the small built-in glyphs. */
  pointerText: boolean;
}

export const defaultCanvasTheme: Readonly<CanvasTheme> = {
  ink: '#000000',
  nodeFill: '#EBE8F4',
  accent: '#39AF8E',
  onAccent: '#FFFFFF',
  danger: '#E22B4F',
  compare: '#FFBC53',
  pointer: '#36CBCC',
  currFill: '#5EEEC3',
  currStroke: '#46B49B',
  pointerLabel: '#000000',
  prevFill: '#EE5E78',
  prevStroke: '#E85A84',
  codeBackground: '#14113C',
  codeText: '#FFFFFF',
  fontFamily: 'CodeText',
  sortBarScale: 1,
  pointerText: false,
};

export const canvasTheme: CanvasTheme = { ...defaultCanvasTheme };

export const setCanvasTheme = (theme: Partial<CanvasTheme> = {}): void => {
  Object.assign(canvasTheme, defaultCanvasTheme, theme);
};
