import type { Playback, PlaybackSnapshot } from '@/visualiser/playback';
import type { PlayInput, TryScore } from './playMachine';
import type { HeldTry } from './useHeldTry';

/** Where a run's playback is: playing, paused or complete, and how far through. */
export type PlaybackAt = Pick<PlaybackSnapshot, 'playback' | 'progress'>;

/** A playback change made in one tab, for the tabs showing the same run to make too. */
export type PlaybackChange =
  | { action: 'play' | 'step-forward' | 'step-backward'; from: PlaybackAt }
  | { action: 'pause'; to: PlaybackAt }
  | { action: 'rewind' | 'finish' }
  | { action: 'seek'; percent: number }
  | { action: 'speed'; speed: number };

/** A run one tab plays: announced at Run, or sent (`at` set) to a tab that asked to join it. */
export type RunMessage = {
  type: 'run';
  key: string;
  input: PlayInput;
  /** The tries before this one. */
  scores: TryScore[];
  speed: number;
  at?: PlaybackAt;
  result?: HeldTry;
};

type TabMessageBody =
  | RunMessage
  /** A tab just opened, asking for the run another tab plays. */
  | { type: 'join' }
  /** What the tab that ran `key` scored and saved. */
  | { type: 'result'; key: string; result: HeldTry }
  | { type: 'playback'; key: string; change: PlaybackChange };

/** Every message carries the challenge's day, so another day's tabs ignore it. */
export type TabMessage = TabMessageBody & { date: string };

const CHANNEL_NAME = 'structs-daily';

/** The channel the daily page's tabs talk on, or null where `BroadcastChannel` is missing. */
export const openTabChannel = (): BroadcastChannel | null =>
  typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);

export const isTabMessage = (data: unknown): data is TabMessage =>
  typeof data === 'object' &&
  data !== null &&
  typeof (data as { type?: unknown }).type === 'string' &&
  typeof (data as { date?: unknown }).date === 'string';

export const playbackAt = (playback: Playback): PlaybackAt => {
  const { playback: state, progress } = playback.getSnapshot();
  return { playback: state, progress };
};

/** A fresh id for a run, shared by every tab that plays it. */
export const newRunKey = (): string =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

/** Moves `playback` to `at`, paused (or complete). */
const seekTo = (playback: Playback, at: PlaybackAt) => {
  if (at.playback === 'complete') playback.finish();
  else playback.seekToPercent(at.progress);
};

/** Moves `playback` to `at`, playing if it plays there. */
export const moveTo = (playback: Playback, at: PlaybackAt) => {
  seekTo(playback, at);
  if (at.playback === 'playing') playback.togglePlay();
};

/** Makes `change` on `playback`, from where the tab that made it was. */
export const applyChange = (playback: Playback, change: PlaybackChange) => {
  switch (change.action) {
    case 'play':
      seekTo(playback, change.from);
      playback.togglePlay();
      return;
    case 'step-forward':
      seekTo(playback, change.from);
      playback.stepForward();
      return;
    case 'step-backward':
      seekTo(playback, change.from);
      playback.stepBackward();
      return;
    case 'pause':
      seekTo(playback, change.to);
      return;
    case 'rewind':
      playback.rewind();
      return;
    case 'finish':
      playback.finish();
      return;
    case 'seek':
      playback.seekToPercent(change.percent);
      return;
    case 'speed':
      playback.setSpeed(change.speed);
      return;
    default:
      change satisfies never;
  }
};

/**
 * `playback` for this tab's toolbar: each change is made here, then handed to `share` for the
 * tabs showing the same run. Changes another tab sent are made on `playback` itself, so they
 * aren't sent back.
 */
export const sharedPlayback = (
  playback: Playback,
  share: (change: PlaybackChange) => void
): Playback => ({
  subscribe: playback.subscribe,
  getSnapshot: playback.getSnapshot,
  togglePlay: () => {
    const from = playbackAt(playback);
    playback.togglePlay();
    share(
      from.playback === 'playing'
        ? { action: 'pause', to: playbackAt(playback) }
        : { action: 'play', from }
    );
  },
  stepForward: () => {
    const from = playbackAt(playback);
    playback.stepForward();
    share({ action: 'step-forward', from });
  },
  stepBackward: () => {
    const from = playbackAt(playback);
    playback.stepBackward();
    share({ action: 'step-backward', from });
  },
  rewind: () => {
    playback.rewind();
    share({ action: 'rewind' });
  },
  finish: () => {
    playback.finish();
    share({ action: 'finish' });
  },
  seekToPercent: (percent) => {
    playback.seekToPercent(percent);
    share({ action: 'seek', percent });
  },
  setSpeed: (speed) => {
    playback.setSpeed(speed);
    share({ action: 'speed', speed });
  },
});
