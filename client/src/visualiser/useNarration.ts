import { useSnapshot } from './useVisualiser';
import { operationLabel, Topic } from './topics';

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'done';

export interface Narration {
  state: PlaybackState;
  title: string;
}

const AT_INDEX = ' at index';

export const useNarration = (topic: Topic): Narration => {
  const lastRun = useSnapshot((s) => s.lastRun);
  const playback = useSnapshot((s) => s.playback);
  const documentation = useSnapshot((s) => s.documentation);

  if (!lastRun) {
    return { state: 'idle', title: `Pick an operation to run on the ${topic.noun}` };
  }

  const label = operationLabel(topic, lastRun.command);
  const argText = lastRun.args.filter(Boolean).join(', ');
  const names = documentation[lastRun.command]?.args ?? [];
  const value = lastRun.args[names.indexOf('value')];
  const index = lastRun.args[names.indexOf('index')];
  let title = argText ? `${label} ${argText}` : label;
  if (value && index && label.endsWith(AT_INDEX)) {
    title = `${label.slice(0, -AT_INDEX.length)} ${value}${AT_INDEX} ${index}`;
  }

  const state: PlaybackState = playback === 'complete' ? 'done' : playback;

  return { state, title };
};
