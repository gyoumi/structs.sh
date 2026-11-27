import { Animator, Timeline, Runner } from '@svgdotjs/svg.js';
import GraphicalDataStructure from '@/visualiser-src/common/GraphicalDataStructure';
import GraphicalDataStructureFactory from '@/visualiser-src/common/GraphicalDataStructureFactory';
import { Documentation } from '@/visualiser-src/common/typedefs';
import { defaultSpeed } from '../common/constants';
import AnimationProducer, { DrawingBounds, StepTrace } from '../common/AnimationProducer';
import TimelineTrack from './TimelineTrack';
import { parseOperationArgs, validateOperationArgs } from './operationArgs';
import { distinctStepTimes, previousStepTime } from './stepTimes';

interface TimeEvent extends Event {
  detail?: number;
}

interface TimelineSegment {
  start: number;
  line: number | null;
}

export type PlaybackStage = 'paused' | 'playing' | 'complete';

type PlaybackMode = 'idle' | 'playing' | 'stepping' | 'paused';

class VisualiserController {
  private dataStructure?: GraphicalDataStructure;

  private topicTitle?: string;

  private currentTimeline: Timeline = new Timeline().persist(true);

  private timelineDuration: number = 0;

  private timestamps: number[] = [];

  /** What each step of the timeline records beside its animation, such as counts and focus. */
  public readonly track = new TimelineTrack();

  private speed: number = 1;

  private mode: PlaybackMode = 'idle';

  private segments: TimelineSegment[] = [];

  private operationCode: string = '';

  public constructor(topicTitle?: string) {
    this.setSpeed(defaultSpeed);
    if (topicTitle !== undefined) {
      this.applyTopicTitle(topicTitle);
    }
  }

  public get data(): number[] {
    return this.dataStructure?.data || [];
  }

  public get topic(): string | null {
    return this.topicTitle || null;
  }

  public loadData(data: number[]): void {
    this.resetDataStructure();
    this.dataStructure?.load(data);
  }

  public snapshotState(): unknown {
    return this.dataStructure?.snapshotState() ?? [];
  }

  public restoreState(state: unknown): void {
    this.resetDataStructure();
    this.dataStructure?.restoreState(state);
  }

  public constructTimeline(
    animationProducer: AnimationProducer,
    updateSlider: (val: number) => void
  ): void {
    this.resetTimeline(updateSlider);
    this.operationCode = animationProducer.code;

    if (animationProducer.allRunners.length === 0) return;

    animationProducer.allRunners.forEach((runnerInfo) => {
      if (runnerInfo.runners.length === 0) return;
      const stepStart = this.timelineDuration;
      const segmentStart = stepStart + 25;
      this.segments.push({ start: segmentStart, line: runnerInfo.line });
      runnerInfo.runners.forEach((runner) => {
        this.currentTimeline.schedule(runner, segmentStart, 'absolute');
      });
      const maxRunner = runnerInfo.runners.reduce(
        (prev: Runner, curr: Runner) => (prev.duration() < curr.duration() ? curr : prev),
        runnerInfo.runners[0]
      );
      this.timelineDuration += maxRunner.duration() + 25;
      this.track.recordStep(stepStart, segmentStart, this.timelineDuration, runnerInfo);
      if (runnerInfo.isTimestamped) {
        const stepEnd = this.timelineDuration + 1;
        const timeline = this.currentTimeline;
        maxRunner.after(() => {
          if (this.mode === 'stepping') {
            this.pause();
            // Seeking from inside the timeline's frame would re-enter its runner loop.
            Animator.immediate(() => timeline.time(stepEnd));
          }
        });
        this.timestamps.push(stepEnd);
      }
    });
    if (this.timelineDuration > 0) {
      this.timestamps.push(this.timelineDuration);
      this.play();
    }
  }

  public resetTimeline(updateSlider: (val: number) => void) {
    const timeline = new Timeline().persist(true);
    this.currentTimeline = timeline;
    timeline.on('time', (evt: TimeEvent) => {
      if (this.timelineDuration !== 0 && evt.detail) {
        updateSlider((Math.min(evt.detail, this.timelineDuration) / this.timelineDuration) * 100);
      }
    });
    timeline.on('finished', () => {
      if (this.currentTimeline === timeline) {
        this.mode = 'paused';
      }
    });
    this.mode = 'idle';
    timeline.speed(this.speed);
    this.clearRecording();
  }

  public play(): void {
    this.mode = 'playing';
    this.currentTimeline.play();
  }

  public pause(): void {
    this.mode = 'paused';
    this.currentTimeline.pause();
  }

  public seekTime(time: number): void {
    const clamped = Math.max(0, Math.min(time, this.timelineDuration));
    if (this.mode === 'stepping') {
      this.pause();
    }
    this.currentTimeline.time(clamped);
  }

  public seekPercent(position: number): void {
    this.seekTime((position * this.timelineDuration) / 100);
  }

  public setSpeed(speed: number): void {
    this.speed = speed;
    this.currentTimeline.speed(this.speed);
  }

  public finish(): void {
    this.mode = 'paused';
    this.currentTimeline.finish();
  }

  public stepBackwards(): void {
    this.currentTimeline.time(previousStepTime(this.timestamps, this.currentTime));
  }

  public stepForwards(): void {
    this.mode = 'stepping';
    this.currentTimeline.play();
  }

  public applyTopicTitle(topicTitle: string) {
    this.topicTitle = topicTitle;
    this.dataStructure = GraphicalDataStructureFactory.create(topicTitle);
    this.clearTimeline();
  }

  public doOperation(
    command: string,
    updateSlider: (val: number) => void,
    ...args: string[]
  ): string {
    if (!this.dataStructure) return 'Invalid data structure';
    const expectedArgs = this.dataStructure.documentation[command].args;
    const errMessage = validateOperationArgs(expectedArgs, args);
    if (errMessage !== '') return errMessage;

    this.finish();
    // @ts-ignore
    const animationProducer: AnimationProducer = this.dataStructure[command](
      ...parseOperationArgs(expectedArgs, args)
    );
    this.constructTimeline(animationProducer, updateSlider);
    return '';
  }

  public get documentation(): Documentation {
    return this.dataStructure?.documentation || {};
  }

  public resetDataStructure(): void {
    if (this.topicTitle) {
      this.dataStructure = GraphicalDataStructureFactory.create(this.topicTitle);
    }
    this.clearTimeline();
  }

  private clearTimeline(): void {
    this.mode = 'idle';
    this.currentTimeline.finish();
    this.currentTimeline.time(0);
    this.currentTimeline = new Timeline().persist(true);
    this.clearRecording();
  }

  public generateDataStructure(): void {
    this.resetDataStructure();
    this.dataStructure?.generate();
  }

  private get currentTime() {
    return Math.min(this.currentTimeline.time(), this.timelineDuration);
  }

  private clearRecording(): void {
    this.timestamps = [];
    this.track.clear();
    this.timelineDuration = 0;
    this.segments = [];
    this.operationCode = '';
  }

  public get duration(): number {
    return this.timelineDuration;
  }

  public get time(): number {
    return this.currentTime;
  }

  /** The producer's running count once the steps up to `time` are done. */
  public counterAt(time: number): number {
    return this.track.counterAt(time);
  }

  /** The producer's named running counts once the steps up to `time` are done. */
  public countersAt(time: number): Record<string, number> {
    return this.track.countersAt(time);
  }

  /** The sort's pivot and comparison for the step playing at `time`, or null outside a partition. */
  public traceAt(time: number): StepTrace | null {
    return this.track.traceAt(time);
  }

  /** Upcoming drawing bounds for the step at `time`, so the stage can zoom out before a node appears. */
  public boundsAt(time: number): DrawingBounds | null {
    return this.track.boundsAt(time);
  }

  public get playback(): PlaybackStage {
    if (this.timelineDuration === 0) return 'paused';
    if (this.currentTime >= this.timelineDuration - 1) return 'complete';
    return this.mode === 'playing' || this.mode === 'stepping' ? 'playing' : 'paused';
  }

  /** True while playing a single step from "Next step", which pauses when that step ends. */
  public get stepping(): boolean {
    return this.mode === 'stepping';
  }

  public get code(): string {
    return this.operationCode;
  }

  /** Times the timeline pauses at when stepping, ending with the full duration. */
  public get stepTimes(): number[] {
    return distinctStepTimes(this.timestamps);
  }

  public get currentLine(): number | null {
    const now = this.currentTimeline.time();
    let line: number | null = null;
    this.segments.forEach((segment) => {
      if (segment.start <= now && segment.line !== null) line = segment.line;
    });
    return line;
  }
}

export default VisualiserController;
