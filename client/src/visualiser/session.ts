import VisualiserController from '@/visualiser-src/controller/VisualiserController';
import { Documentation } from '@/visualiser-src/common/typedefs';
import { defaultSpeed } from '@/visualiser-src/common/constants';
import { CanvasTheme, setCanvasTheme } from '@/visualiser-src/common/canvasTheme';

export interface LastRun {
  id: number;
  command: string;
  args: string[];
}

export interface VisualiserSnapshot {
  topicTitle: string | null;
  documentation: Documentation;
  playing: boolean;
  complete: boolean;
  progress: number;
  step: number;
  stepCount: number;
  stepTimes: number[];
  duration: number;
  line: number | null;
  code: string[];
  lastRun: LastRun | null;
  speed: number;
  layoutVersion: number;
  /** How many values the drawing holds. During a run it stays at the count from before the run. */
  size: number;
}

const initialSnapshot: VisualiserSnapshot = {
  topicTitle: null,
  documentation: {},
  playing: false,
  complete: false,
  progress: 0,
  step: 0,
  stepCount: 0,
  stepTimes: [],
  duration: 0,
  line: null,
  code: [],
  size: 0,
  lastRun: null,
  speed: 1,
  layoutVersion: 0,
};

/** Picks the random data a topic starts with, or returns undefined to use the engine's own. */
export type StarterData = (topicTitle: string) => number[] | undefined;

const IDLE_FRAMES_BEFORE_SLEEP = 20;

export class VisualiserSession {
  private controller = new VisualiserController();

  private snapshot: VisualiserSnapshot = initialSnapshot;

  private listeners = new Set<() => void>();

  private frame: number | null = null;

  private idleFrames = 0;

  private runCounter = 0;

  private makeData?: StarterData;

  constructor() {
    this.controller.setSpeed(defaultSpeed);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.sleep();
    };
  };

  getSnapshot = (): VisualiserSnapshot => this.snapshot;

  /** The values in the structure now, including the result of a run still animating. */
  get data(): number[] {
    return this.controller.data;
  }

  attach(
    topicTitle: string,
    theme: Partial<CanvasTheme>,
    data?: number[],
    makeData?: StarterData
  ): void {
    setCanvasTheme(theme);
    this.makeData = makeData;
    this.controller.applyTopicTitle(topicTitle);
    if (data && data.length > 0) {
      this.controller.loadData(data);
    } else {
      this.fill(topicTitle);
    }
    this.update({
      ...initialSnapshot,
      speed: this.snapshot.speed,
      topicTitle,
      documentation: this.controller.documentation,
      layoutVersion: this.snapshot.layoutVersion + 1,
      size: this.controller.data.length,
    });
  }

  /** Redraws the current values in another theme. Colours are fixed when drawn, so the last run's playback is dropped. */
  retheme(theme: Partial<CanvasTheme>): void {
    const { data } = this;
    setCanvasTheme(theme);
    this.controller.loadData(data);
    this.resetTrace();
  }

  run(command: string, args: string[]): string {
    const error = this.controller.doOperation(command, () => {}, ...args);
    if (error) return error;
    this.runCounter += 1;
    const { stepTimes } = this.controller;
    const noTimeline = this.snapshot.documentation[command]?.noTimeline ?? false;
    this.update({
      lastRun: { id: this.runCounter, command, args },
      stepTimes,
      stepCount: stepTimes.length,
      duration: this.controller.duration,
      code: this.controller.code ? this.controller.code.split('\n') : [],
      layoutVersion: noTimeline ? this.snapshot.layoutVersion + 1 : this.snapshot.layoutVersion,
      size: this.controller.duration > 0 ? this.snapshot.size : this.controller.data.length,
    });
    this.wake();
    return '';
  }

  play = (): void => {
    if (this.snapshot.complete) this.controller.seekPercent(0);
    this.controller.play();
    this.wake();
  };

  pause = (): void => {
    this.controller.pause();
    this.wake();
  };

  togglePlay = (): void => {
    if (this.snapshot.playing) this.pause();
    else this.play();
  };

  stepForward = (): void => {
    if (this.snapshot.complete) return;
    this.controller.stepForwards();
    this.wake();
  };

  stepBackward = (): void => {
    this.controller.pause();
    this.controller.stepBackwards();
    this.wake();
  };

  rewind = (): void => {
    this.controller.pause();
    this.controller.seekPercent(0);
    this.wake();
  };

  finish = (): void => {
    this.controller.seekPercent(100);
    this.controller.pause();
    this.wake();
  };

  seek = (percent: number): void => {
    this.controller.pause();
    this.controller.seekPercent(percent);
    this.wake();
  };

  seekToStep = (step: number): void => {
    const { stepTimes, duration } = this.snapshot;
    if (duration === 0) return;
    const target = step <= 0 ? 0 : stepTimes[Math.min(step, stepTimes.length) - 1];
    this.seek((Math.min(target, duration) / duration) * 100);
  };

  setSpeed = (speed: number): void => {
    this.controller.setSpeed(speed * defaultSpeed);
    this.update({ speed });
  };

  generate = (): void => {
    this.fill(this.snapshot.topicTitle);
    this.resetTrace();
  };

  /** Random starting data, from `makeData` when it has an opinion and the engine otherwise. */
  private fill(topicTitle: string | null): void {
    const data = topicTitle ? this.makeData?.(topicTitle) : undefined;
    if (data) this.controller.loadData(data);
    else this.controller.generateDataStructure();
  }

  clear = (): void => {
    this.controller.resetDataStructure();
    this.resetTrace();
  };

  dispose(): void {
    this.sleep();
    this.controller.finish();
  }

  private resetTrace(): void {
    this.update({
      ...initialSnapshot,
      speed: this.snapshot.speed,
      topicTitle: this.snapshot.topicTitle,
      documentation: this.snapshot.documentation,
      layoutVersion: this.snapshot.layoutVersion + 1,
      size: this.controller.data.length,
    });
  }

  private update(patch: Partial<VisualiserSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private wake(): void {
    this.idleFrames = 0;
    if (this.frame === null) this.frame = requestAnimationFrame(this.tick);
  }

  private sleep(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
  }

  private tick = (): void => {
    const { controller, snapshot } = this;
    const { duration } = snapshot;
    const { time } = controller;
    const complete = duration > 0 && time >= duration - 1;
    const playing = duration > 0 && !controller.isPaused && !complete;
    const progress = duration > 0 ? Math.min(100, (time / duration) * 100) : 0;
    const step = snapshot.stepTimes.filter((t) => t <= time + 1).length;
    const line = duration > 0 ? controller.currentLine : null;
    // The engine changes the data as soon as a run starts, but the drawing only catches up at the end.
    const size = complete ? controller.data.length : snapshot.size;

    const changed =
      playing !== snapshot.playing ||
      complete !== snapshot.complete ||
      Math.abs(progress - snapshot.progress) > 0.05 ||
      step !== snapshot.step ||
      line !== snapshot.line ||
      size !== snapshot.size;

    if (changed) {
      this.idleFrames = 0;
      this.update({ playing, complete, progress, step, line, size });
    } else {
      this.idleFrames += 1;
    }

    this.frame =
      playing || this.idleFrames < IDLE_FRAMES_BEFORE_SLEEP
        ? requestAnimationFrame(this.tick)
        : null;
  };
}
