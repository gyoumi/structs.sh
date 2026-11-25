import { SVG } from '@svgdotjs/svg.js';
import type { CanvasTarget } from '@/visualiser-src/common/canvasTarget';
import type VisualiserController from '@/visualiser-src/controller/VisualiserController';
import type { PlaybackStage } from '@/visualiser-src/controller/VisualiserController';

/** Ends every animation drawing into `target`, so what was just drawn shows at once. */
export const finishDrawing = (target: CanvasTarget): void => {
  SVG(target.canvas)
    .find('*')
    .forEach((element) => element.timeline().finish());
};

/** Where a run's playback is: its time, and whether it plays on, plays one step, is paused or ended. */
export type RunPosition = { time: number; playback: PlaybackStage; stepping: boolean };

export const positionOf = ({ time, playback, stepping }: VisualiserController): RunPosition => ({
  time,
  playback,
  stepping,
});

/** Puts a run that was just built again back at `position`. */
export const returnTo = (controller: VisualiserController, position: RunPosition): void => {
  controller.pause();
  if (position.playback === 'complete') controller.seekPercent(100);
  else controller.seekTime(position.time);
  if (position.playback !== 'playing') return;
  if (position.stepping) controller.stepForwards();
  else controller.play();
};
