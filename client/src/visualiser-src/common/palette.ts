/**
 * Every colour and font the visualiser engine draws with.
 *
 * The defaults are the colours the engine has always used, so nothing changes
 * unless a page calls `setVisualiserPalette` before it creates a data structure.
 */
export interface VisualiserPalette {
  /** Node outlines, pointers, arrowheads and labels. */
  ink: string;
  /** The inside of a resting node. */
  nodeFill: string;
  /** A label sitting on a node that is filled with `highlight`. */
  onHighlight: string;
  /** Visited, found and sorted. */
  highlight: string;
  /** A tree node that is about to be removed or failed a search. */
  danger: string;
  /** The node a linked-list operation is looking at. */
  listHighlight: string;
  /** A linked-list node that failed a search. */
  listAlert: string;
  /** Sorting: index pointers and the range being worked on. */
  pointer: string;
  /** Sorting: the pair being compared. */
  comparing: string;
  /** Sorting: the element picked out, such as a pivot or a minimum. */
  selected: string;
  /** Sorting: the second pointer and out-of-place elements. */
  sortAlert: string;
  currFill: string;
  currStroke: string;
  prevFill: string;
  prevStroke: string;
  codeBackground: string;
  codeText: string;
  codeHighlight: string;
  fontFamily: string;
}

export const defaultVisualiserPalette: Readonly<VisualiserPalette> = {
  ink: '#000000',
  nodeFill: '#EBE8F4',
  onHighlight: '#ffffff',
  highlight: '#39AF8E',
  danger: '#AF3939',
  listHighlight: '#46B493',
  listAlert: '#FF0000',
  pointer: '#36CBCC',
  comparing: '#FFBC53',
  selected: '#33cccc',
  sortAlert: '#E22B4F',
  currFill: '#5EEEC3',
  currStroke: '#46B49B',
  prevFill: '#EE5E78',
  prevStroke: '#E85A84',
  codeBackground: '#14113C',
  codeText: '#FFFFFF',
  codeHighlight: '#39AF8E',
  fontFamily: 'CodeText',
};

// One shared object, read at draw time. Mutated in place so every importer sees the change.
export const palette: VisualiserPalette = { ...defaultVisualiserPalette };

const listeners = new Set<() => void>();

/** For modules that keep a colour in a plain exported binding rather than reading `palette` each time. */
export const onPaletteChange = (listener: () => void): void => {
  listeners.add(listener);
};

export const setVisualiserPalette = (overrides: Partial<VisualiserPalette> = {}): void => {
  Object.assign(palette, defaultVisualiserPalette, overrides);
  listeners.forEach((listener) => listener());
};

export const resetVisualiserPalette = (): void => setVisualiserPalette();
