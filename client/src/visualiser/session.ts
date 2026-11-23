import { SVG } from '@svgdotjs/svg.js';
import VisualiserController from '@/visualiser-src/controller/VisualiserController';
import { defaultSpeed, VISUALISER_CANVAS } from '@/visualiser-src/common/constants';
import { CanvasTheme, setCanvasTheme } from '@/visualiser-src/common/canvasTheme';
import {
  initialSnapshot,
  type InitialDataSource,
  type VisualiserSnapshot,
} from './sessionSnapshot';

export type { PlaybackStage } from '@/visualiser-src/controller/VisualiserController';
export type { StepComparison, StepTrace } from '@/visualiser-src/common/AnimationProducer';
export type { InitialDataSource, LastRun, VisualiserSnapshot } from './sessionSnapshot';

const IDLE_FRAMES_BEFORE_SLEEP = 20;

const finishDrawing = (): void => {
  SVG(VISUALISER_CANVAS)
    .find('*')
    .forEach((element) => element.timeline().finish());
};

type TickerState =
  | { status: 'sleeping' }
  | { status: 'running'; frame: number; idleFrames: number };

export class VisualiserSession {
  private controller = new VisualiserController();

  private snapshot: VisualiserSnapshot = initialSnapshot;

  private listeners = new Set<() => void>();

  private ticker: TickerState = { status: 'sleeping' };

  private runCounter = 0;

  private getInitialData?: InitialDataSource;

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
    canvasTheme: Partial<CanvasTheme>,
    data?: number[],
    getInitialData?: InitialDataSource,
    immediate = false
  ): void {
    setCanvasTheme(canvasTheme);
    this.getInitialData = getInitialData;
    this.controller.applyTopicTitle(topicTitle);
    if (data) this.controller.loadData(data);
    else this.loadInitialValues(topicTitle);
    if (immediate) finishDrawing();
    this.resetPlayback({ topicTitle, documentation: this.controller.documentation });
  }

  /** Redraws the current values in another theme, at once. Colours are fixed when drawn, so the last run's playback is dropped. */
  retheme(canvasTheme: Partial<CanvasTheme>): void {
    const { data } = this;
    setCanvasTheme(canvasTheme);
    this.controller.loadData(data);
    finishDrawing();
    this.resetPlayback();
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
      ...this.sampleController(this.controller.duration, stepTimes),
    });
    this.wake();
    return '';
  }

  play = (): void => {
    if (this.snapshot.playback === 'complete') this.controller.seekPercent(0);
    this.controller.play();
    this.syncFromController(true);
    this.wake();
  };

  pause = (): void => {
    this.controller.pause();
    this.syncFromController(true);
    this.wake();
  };

  togglePlay = (): void => {
    if (this.snapshot.playback === 'playing') this.pause();
    else this.play();
  };

  stepForward = (): void => {
    if (this.snapshot.playback === 'complete') return;
    this.controller.stepForwards();
    this.syncFromController(true);
    this.wake();
  };

  stepBackward = (): void => {
    this.controller.pause();
    this.controller.stepBackwards();
    this.syncFromController(true);
    this.wake();
  };

  rewind = (): void => {
    this.controller.pause();
    this.controller.seekPercent(0);
    this.syncFromController(true);
    this.wake();
  };

  finish = (): void => {
    this.controller.seekPercent(100);
    this.controller.pause();
    this.syncFromController(true);
    this.wake();
  };

  seekToPercent = (percent: number): void => {
    this.controller.pause();
    this.controller.seekPercent(percent);
    this.syncFromController(true);
    this.wake();
  };

  seekToStep = (step: number): void => {
    const { stepTimes, duration } = this.snapshot;
    if (duration === 0) return;
    const target = step <= 0 ? 0 : stepTimes[Math.min(step, stepTimes.length) - 1];
    this.seekToPercent((Math.min(target, duration) / duration) * 100);
  };

  setSpeed = (speed: number): void => {
    this.controller.setSpeed(speed * defaultSpeed);
    this.update({ speed });
  };

  /** Draws `data` as the structure's values, dropping any run. Given a theme, draws in it. */
  loadData = (data: number[], canvasTheme?: Partial<CanvasTheme>, immediate = false): void => {
    if (canvasTheme) setCanvasTheme(canvasTheme);
    this.controller.loadData(data);
    if (immediate) finishDrawing();
    this.resetPlayback();
  };

  generate = (): void => {
    this.loadInitialValues(this.snapshot.topicTitle);
    this.resetPlayback();
  };

  private loadInitialValues(topicTitle: string | null): void {
    const data = topicTitle ? this.getInitialData?.(topicTitle) : undefined;
    if (data) this.controller.loadData(data);
    else this.controller.generateDataStructure();
  }

  clear = (): void => {
    this.controller.resetDataStructure();
    this.resetPlayback();
  };

  dispose(): void {
    this.sleep();
    this.controller.finish();
  }

  private resetPlayback(patch?: Partial<VisualiserSnapshot>): void {
    this.update({
      ...initialSnapshot,
      speed: this.snapshot.speed,
      topicTitle: this.snapshot.topicTitle,
      documentation: this.snapshot.documentation,
      layoutVersion: this.snapshot.layoutVersion + 1,
      size: this.controller.data.length,
      ...patch,
    });
  }

  private update(patch: Partial<VisualiserSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private wake(): void {
    if (this.ticker.status === 'sleeping') {
      this.ticker = { status: 'running', frame: requestAnimationFrame(this.tick), idleFrames: 0 };
    } else {
      this.ticker.idleFrames = 0;
    }
  }

  private sleep(): void {
    if (this.ticker.status === 'running') {
      cancelAnimationFrame(this.ticker.frame);
      this.ticker = { status: 'sleeping' };
    }
  }

  private sampleController(duration: number, stepTimes: number[]) {
    const { controller } = this;
    const { time } = controller;
    return {
      playback: controller.playback,
      progress: duration > 0 ? Math.min(100, (time / duration) * 100) : 0,
      step: stepTimes.filter((t) => t <= time + 1).length,
      line: duration > 0 ? controller.currentLine : null,
      size: controller.data.length,
      comparisons: controller.counterAt(time),
      trace: duration > 0 ? controller.traceAt(time) : null,
    };
  }

  private syncFromController(exact = false): boolean {
    const { snapshot } = this;
    const sample = this.sampleController(snapshot.duration, snapshot.stepTimes);
    const progressChanged = exact
      ? sample.progress !== snapshot.progress
      : Math.abs(sample.progress - snapshot.progress) > 0.05;
    const changed =
      sample.playback !== snapshot.playback ||
      progressChanged ||
      sample.step !== snapshot.step ||
      sample.line !== snapshot.line ||
      sample.size !== snapshot.size ||
      sample.comparisons !== (snapshot.comparisons ?? 0) ||
      sample.trace !== snapshot.trace;

    if (changed) this.update(sample);
    return changed;
  }

  private tick = (): void => {
    const changed = this.syncFromController();
    const prevIdle = this.ticker.status === 'running' ? this.ticker.idleFrames : 0;
    const idleFrames = changed ? 0 : prevIdle + 1;

    if (this.snapshot.playback === 'playing' || idleFrames < IDLE_FRAMES_BEFORE_SLEEP) {
      this.ticker = { status: 'running', frame: requestAnimationFrame(this.tick), idleFrames };
    } else {
      this.ticker = { status: 'sleeping' };
    }
  };
}
