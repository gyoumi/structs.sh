import { useSnapshot } from './useVisualiser';
import { operationLabel, TopicInfo } from './topics';

export type PlaybackState = 'idle' | 'playing' | 'paused' | 'done';

export interface Narration {
  state: PlaybackState;
  /** What ran, as a sentence, e.g. "Insert 42 at index 3" rather than "Insert at index 42, 3". */
  title: string;
}

const AT_INDEX = ' at index';

export const useNarration = (topic: TopicInfo): Narration => {
  const lastRun = useSnapshot((s) => s.lastRun);
  const playing = useSnapshot((s) => s.playing);
  const complete = useSnapshot((s) => s.complete);
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

  let state: PlaybackState = 'paused';
  if (complete) state = 'done';
  else if (playing) state = 'playing';

  return { state, title };
};
