import { CODE_CANVAS, CODE_CONTAINER, VISUALISER_CANVAS } from './constants';

/** The elements one visualiser stage draws into. */
export interface CanvasTarget {
  /** The id of the element the engine measures and scrolls into view. */
  container: string;
  /** The selector of the `<svg>` the structure is drawn in. */
  canvas: string;
  /** The selector of the `<svg>` the code listing is drawn in. */
  code: string;
  /** The id of the element that holds the code listing. */
  codeContainer: string;
}

export const DEFAULT_CANVAS_TARGET: CanvasTarget = {
  container: 'visualiser-container',
  canvas: VISUALISER_CANVAS,
  code: CODE_CANVAS,
  codeContainer: CODE_CONTAINER,
};

/** A target whose element ids all start with `prefix`, for a page with more than one stage. */
export const namedCanvasTarget = (prefix: string): CanvasTarget => ({
  container: `${prefix}-container`,
  canvas: `#${prefix}-canvas`,
  code: `#${prefix}-code-canvas`,
  codeContainer: `${prefix}-code-container`,
});

let currentTarget = DEFAULT_CANVAS_TARGET;

/** The stage the engine draws into now. */
export const getCanvasTarget = (): CanvasTarget => currentTarget;

/** Runs `draw` with the engine drawing into `target`, then restores the previous target. */
export const withCanvasTarget = <T>(target: CanvasTarget, draw: () => T): T => {
  const previous = currentTarget;
  currentTarget = target;
  try {
    return draw();
  } finally {
    currentTarget = previous;
  }
};
