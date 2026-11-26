import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import VisualiserController from '@/visualiser-src/controller/VisualiserController';
import {
  palette as enginePalette,
  resetVisualiserPalette,
  setVisualiserPalette,
  type VisualiserPalette,
} from '@/visualiser-src/common/palette';
import { CODE_CANVAS } from '@/visualiser-src/common/constants';
import type { OperationInfo, TopicInfo } from './topics';

export interface Operation extends OperationInfo {
  command: string;
  args: string[];
  /** True when the engine changes the structure at once, with nothing to play back. */
  instant: boolean;
}

export interface CodeLine {
  text: string;
  indent: number;
}

export interface HistoryEntry {
  id: number;
  command: string;
  args: string[];
  error: string;
}

export type PlaybackStatus = 'idle' | 'playing' | 'paused' | 'done';

export const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

interface Store<T> {
  get: () => T;
  set: (value: T) => void;
  subscribe: (listener: () => void) => () => void;
}

const createStore = <T>(initial: T): Store<T> => {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return;
      value = next;
      listeners.forEach((listener) => listener());
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

// The engine's own messages, said the way the rest of the interface talks.
const explain = (error: string, argumentCount: number): string => {
  if (error === 'Argument(s) missing') {
    return argumentCount > 1 ? 'Fill in both fields with whole numbers.' : 'Enter a whole number.';
  }
  if (error === 'Argument(s) must be a positive integer') return 'Use whole numbers, 0 or above.';
  if (error === 'Values must be between 0 and 99') return 'Values go from 0 to 99.';
  return error;
};

const readCode = (background: string): { lines: CodeLine[]; active: number | null } => {
  const canvas = document.querySelector(CODE_CANVAS);
  if (!canvas) return { lines: [], active: null };
  const rects = [...canvas.querySelectorAll('rect')];
  const texts = [...canvas.querySelectorAll('text')];
  const base = background.toLowerCase();
  const active = rects.findIndex(
    (rect) => (rect.getAttribute('fill') ?? base).toLowerCase() !== base
  );
  return {
    lines: texts.map((text) => ({
      text: text.textContent ?? '',
      // The engine indents by 5 units per leading space.
      indent: Math.round(Number(text.getAttribute('x') ?? 0) / 5),
    })),
    active: active === -1 ? null : active,
  };
};

export interface Visualiser {
  topic: TopicInfo;
  operations: Operation[];
  /** Runs an operation. Returns an empty string, or what was wrong with the arguments. */
  run: (command: string, args: string[]) => string;
  status: PlaybackStatus;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  replay: () => void;
  stepForward: () => void;
  stepBack: () => void;
  toStart: () => void;
  toEnd: () => void;
  seek: (percent: number) => void;
  beginScrub: () => void;
  endScrub: () => void;
  speed: number;
  setSpeed: (speed: number) => void;
  /** Where each step ends on the timeline, 0 to 100. Empty when nothing has run. */
  stepMarks: number[];
  code: { lines: CodeLine[]; active: number | null };
  /** The operation on the timeline, if any. */
  current: HistoryEntry | null;
  history: HistoryEntry[];
  generate: () => void;
  clear: () => void;
  restoreSeed: () => void;
  /** Bumps whenever the drawing may have changed size, so the stage can refit. */
  revision: number;
  progress: Pick<Store<number>, 'get' | 'subscribe'>;
  step: Pick<Store<number>, 'get' | 'subscribe'>;
}

interface Options {
  palette?: Partial<VisualiserPalette>;
}

/**
 * Drives the visualiser engine for one topic. The engine draws into the two
 * SVGs that `<Stage>` renders, so a page mounts both together.
 */
export const useVisualiser = (topic: TopicInfo, { palette }: Options = {}): Visualiser => {
  const [controller] = useState(() => new VisualiserController());
  const [progress] = useState(() => createStore(0));
  const [step] = useState(() => createStore(0));
  const [status, setStatusState] = useState<PlaybackStatus>('idle');
  const [speed, setSpeedState] = useState(1);
  const [stepMarks, setStepMarks] = useState<number[]>([]);
  const [code, setCode] = useState<Visualiser['code']>({ lines: [], active: null });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [current, setCurrent] = useState<HistoryEntry | null>(null);
  const [revision, setRevision] = useState(0);
  const [operations, setOperations] = useState<Operation[]>([]);
  const resumeAfterScrub = useRef(false);
  const scrubbing = useRef(false);
  const statusRef = useRef(status);
  const nextId = useRef(1);

  // Timeline events arrive between renders, so they read the status from a ref.
  const setStatus = useCallback((next: PlaybackStatus) => {
    statusRef.current = next;
    setStatusState(next);
  }, []);

  const onTime = useCallback(
    (percent: number) => {
      progress.set(percent);
      step.set(controller.currentStep);
      const now = statusRef.current;
      if (percent >= 100 && (now === 'playing' || now === 'paused')) setStatus('done');
      else if (percent < 100 && now === 'done') setStatus('paused');
    },
    [controller, progress, step, setStatus]
  );

  const clearTimeline = useCallback(() => {
    controller.resetTimeline(onTime);
    progress.set(0);
    step.set(0);
    setStepMarks([]);
    setCurrent(null);
    setStatus('idle');
  }, [controller, onTime, progress, step, setStatus]);

  // The palette is read when shapes are drawn, so it has to be in place before the topic is built.
  const paletteKey = JSON.stringify(palette ?? {});
  useEffect(() => {
    setVisualiserPalette(JSON.parse(paletteKey));
    controller.applyTopicTitle(topic.title);
    controller.loadData(topic.seed);
    controller.setSpeed(0.5);
    setSpeedState(1);
    setOperations(
      Object.entries(controller.documentation).flatMap(([command, usage]) => {
        const info = topic.operations[command];
        return info ? [{ ...info, command, args: usage.args, instant: !!usage.noTimeline }] : [];
      })
    );
    setHistory([]);
    clearTimeline();
    setRevision((value) => value + 1);
    return () => {
      controller.pause();
      resetVisualiserPalette();
    };
  }, [controller, topic, paletteKey, clearTimeline]);

  useEffect(() => {
    const canvas = document.querySelector(CODE_CANVAS);
    if (!canvas) return undefined;
    let frame = 0;
    const sync = () => {
      frame = 0;
      const next = readCode(enginePalette.codeBackground);
      setCode((previous) =>
        previous.active === next.active &&
        previous.lines.length === next.lines.length &&
        previous.lines.every((line, index) => line.text === next.lines[index].text)
          ? previous
          : next
      );
    };
    const observer = new MutationObserver(() => {
      if (!frame) frame = requestAnimationFrame(sync);
    });
    observer.observe(canvas, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['fill'],
    });
    sync();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [topic]);

  const run = useCallback(
    (command: string, args: string[]) => {
      const error = explain(controller.doOperation(command, onTime, ...args), args.length);
      const entry = { id: nextId.current, command, args, error };
      nextId.current += 1;
      setHistory((entries) => [...entries.slice(-49), entry]);
      if (error) return error;
      if (controller.documentation[command]?.noTimeline) {
        clearTimeline();
      } else {
        progress.set(0);
        step.set(0);
        setStepMarks(controller.stepMarks);
        setCurrent(entry);
        setStatus('playing');
      }
      setRevision((value) => value + 1);
      return '';
    },
    [controller, onTime, clearTimeline, progress, step, setStatus]
  );

  const hasTimeline = stepMarks.length > 0;

  const play = useCallback(() => {
    if (!hasTimeline) return;
    controller.play();
    setStatus('playing');
  }, [controller, hasTimeline, setStatus]);

  const pause = useCallback(() => {
    if (!hasTimeline) return;
    controller.pause();
    if (statusRef.current === 'playing') setStatus('paused');
  }, [controller, hasTimeline, setStatus]);

  const replay = useCallback(() => {
    if (!hasTimeline) return;
    controller.seekPercent(0);
    controller.play();
    setStatus('playing');
  }, [controller, hasTimeline, setStatus]);

  const toggle = useCallback(() => {
    if (statusRef.current === 'playing') pause();
    else if (statusRef.current === 'done') replay();
    else play();
  }, [pause, play, replay]);

  const stepForward = useCallback(() => {
    if (!hasTimeline || statusRef.current === 'done') return;
    controller.stepForwards();
    setStatus('paused');
  }, [controller, hasTimeline, setStatus]);

  const stepBack = useCallback(() => {
    if (!hasTimeline) return;
    controller.pause();
    controller.stepBackwards();
    setStatus('paused');
  }, [controller, hasTimeline, setStatus]);

  const toStart = useCallback(() => {
    if (!hasTimeline) return;
    controller.pause();
    controller.seekPercent(0);
    setStatus('paused');
  }, [controller, hasTimeline, setStatus]);

  const toEnd = useCallback(() => {
    if (!hasTimeline) return;
    controller.seekPercent(100);
    controller.pause();
    setStatus('done');
  }, [controller, hasTimeline, setStatus]);

  const seek = useCallback(
    (percent: number) => {
      if (!hasTimeline) return;
      controller.seekPercent(percent);
      if (percent >= 100) setStatus('done');
      else if (statusRef.current === 'done') setStatus('paused');
    },
    [controller, hasTimeline, setStatus]
  );

  const beginScrub = useCallback(() => {
    if (scrubbing.current) return;
    scrubbing.current = true;
    resumeAfterScrub.current = statusRef.current === 'playing';
    controller.pause();
  }, [controller]);

  const endScrub = useCallback(() => {
    if (!scrubbing.current) return;
    scrubbing.current = false;
    if (resumeAfterScrub.current && progress.get() < 100) {
      controller.play();
      setStatus('playing');
    } else if (statusRef.current === 'playing') {
      setStatus('paused');
    }
  }, [controller, progress, setStatus]);

  const setSpeed = useCallback(
    (value: number) => {
      // The engine's own scale runs at half the number shown to people.
      controller.setSpeed(value / 2);
      setSpeedState(value);
    },
    [controller]
  );

  const generate = useCallback(() => {
    controller.generateDataStructure();
    clearTimeline();
    setRevision((value) => value + 1);
  }, [controller, clearTimeline]);

  const clear = useCallback(() => {
    controller.resetDataStructure();
    clearTimeline();
    setRevision((value) => value + 1);
  }, [controller, clearTimeline]);

  const restoreSeed = useCallback(() => {
    controller.loadData(topic.seed);
    clearTimeline();
    setRevision((value) => value + 1);
  }, [controller, topic, clearTimeline]);

  return useMemo(
    () => ({
      topic,
      operations,
      run,
      status,
      play,
      pause,
      toggle,
      replay,
      stepForward,
      stepBack,
      toStart,
      toEnd,
      seek,
      beginScrub,
      endScrub,
      speed,
      setSpeed,
      stepMarks,
      code,
      current,
      history,
      generate,
      clear,
      restoreSeed,
      revision,
      progress,
      step,
    }),
    [
      topic,
      operations,
      run,
      status,
      play,
      pause,
      toggle,
      replay,
      stepForward,
      stepBack,
      toStart,
      toEnd,
      seek,
      beginScrub,
      endScrub,
      speed,
      setSpeed,
      stepMarks,
      code,
      current,
      history,
      generate,
      clear,
      restoreSeed,
      revision,
      progress,
      step,
    ]
  );
};

/** Timeline position, 0 to 100. Re-renders on every frame while playing, so keep the caller small. */
export const useProgress = (visualiser: Visualiser): number =>
  useSyncExternalStore(visualiser.progress.subscribe, visualiser.progress.get);

/** How many steps have finished. Re-renders only when that count changes. */
export const useStep = (visualiser: Visualiser): number =>
  useSyncExternalStore(visualiser.step.subscribe, visualiser.step.get);
