import type { Documentation } from '@/visualiser-src/common/typedefs';
import type { VisualiserSession, VisualiserSnapshot } from '@/visualiser/session';

export const linkedListDocs: Documentation = {
  append: { args: ['value'], description: 'Append a node' },
  prepend: { args: ['value'], description: 'Prepend a node' },
  insert: { args: ['value', 'index'], description: 'Insert at an index' },
  search: { args: ['value'], description: 'Search for a value' },
  delete: { args: ['index'], description: 'Delete at an index' },
};

export interface Call {
  method: string;
  args: unknown[];
}

export const calls: Call[] = [];

const initial: VisualiserSnapshot = {
  topicTitle: null,
  documentation: {},
  playback: 'paused',
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
  trace: null,
  bounds: null,
  focus: null,
};

/** Stands in for the engine-backed session, which needs a real SVG layout. */
type SessionApi = Pick<
  VisualiserSession,
  | 'subscribe'
  | 'getSnapshot'
  | 'data'
  | 'attach'
  | 'run'
  | 'play'
  | 'pause'
  | 'togglePlay'
  | 'stepForward'
  | 'stepBackward'
  | 'rewind'
  | 'finish'
  | 'seekToPercent'
  | 'seekToStep'
  | 'generate'
  | 'clear'
  | 'retheme'
  | 'setSpeed'
  | 'dispose'
>;

export class FakeSession implements SessionApi {
  private snapshot = initial;

  private listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  data = [10, 20, 30];

  attach(topicTitle: string, _canvasTheme: unknown, data?: number[]) {
    if (data) this.data = data;
    this.update({ topicTitle, documentation: linkedListDocs });
  }

  run(command: string, args: string[]): string {
    calls.push({ method: 'run', args: [command, args] });
    if (args.some((arg) => arg === '')) return 'Argument(s) missing';
    this.update({
      lastRun: { id: calls.length, command, args },
      stepTimes: [100, 200],
      stepCount: 2,
      duration: 300,
      code: ['void append(int value) {', '}'],
    });
    return '';
  }

  private record =
    (method: string) =>
    (...args: unknown[]) => {
      calls.push({ method, args });
    };

  play = this.record('play');

  pause = this.record('pause');

  togglePlay = this.record('togglePlay');

  stepForward = this.record('stepForward');

  stepBackward = this.record('stepBackward');

  rewind = this.record('rewind');

  finish = this.record('finish');

  seekToPercent = this.record('seekToPercent');

  seekToStep = this.record('seekToStep');

  generate = this.record('generate');

  clear = this.record('clear');

  retheme = this.record('retheme');

  setSpeed = (speed: number) => {
    calls.push({ method: 'setSpeed', args: [speed] });
    this.update({ speed });
  };

  dispose() {}

  private update(patch: Partial<VisualiserSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }
}
