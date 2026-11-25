import { createContext, useContext, useSyncExternalStore } from 'react';
import type { VisualiserSnapshot } from './sessionSnapshot';
import { SessionContext } from './useVisualiser';

/** What the `Playback` toolbar shows. */
export type PlaybackSnapshot = Pick<
  VisualiserSnapshot,
  'playback' | 'progress' | 'step' | 'stepCount' | 'duration' | 'speed'
>;

/** What the `Playback` toolbar drives: one session, or several kept in step. */
export interface Playback {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => PlaybackSnapshot;
  togglePlay: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  rewind: () => void;
  finish: () => void;
  seekToPercent: (percent: number) => void;
  setSpeed: (speed: number) => void;
}

/** Overrides the session the toolbar drives, as when one toolbar drives two stages. */
export const PlaybackContext = createContext<Playback | null>(null);

export const usePlayback = (): Playback => {
  const playback = useContext(PlaybackContext);
  const session = useContext(SessionContext);
  const chosen = playback ?? session;
  if (!chosen) throw new Error('usePlayback must be used inside a session or playback provider');
  return chosen;
};

export function usePlaybackSnapshot<T>(selector: (snapshot: PlaybackSnapshot) => T): T {
  const playback = usePlayback();
  return useSyncExternalStore(playback.subscribe, () => selector(playback.getSnapshot()));
}
