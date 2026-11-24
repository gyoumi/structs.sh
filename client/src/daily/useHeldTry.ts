import { useCallback, useRef, type RefObject } from 'react';
import type { Challenge } from './challenge';
import type { PersistOutcome, SavedTry } from './history';
import type { PlayInput, TryScore } from './playMachine';
import { scoreRun, tryScoreOf } from './templates';

/** A try scored and saved when Run was pressed, waiting to be shown when its run ends. */
export type HeldTry = { score: TryScore; tries: SavedTry[]; outcome: PersistOutcome };

/**
 * Pressing Run uses the try: `hold` scores and saves it at once, so a reload mid-run can't
 * hand it back. `held` gives what the save did, for the page to show once the run ends; it
 * rejects when the try couldn't be scored, and then nothing was saved.
 */
export const useHeldTry = (
  challenge: Challenge,
  /** The tries this tab shows as saved; the held try is saved after them. */
  savedTries: RefObject<SavedTry[]>,
  onRecordTries: (tries: SavedTry[]) => Promise<PersistOutcome>
) => {
  const pending = useRef<Promise<HeldTry> | null>(null);

  const hold = (input: PlayInput) => {
    const before = savedTries.current;
    const next = scoreRun(challenge, input).then(async (evaluation) => {
      const score = tryScoreOf(challenge, evaluation);
      const tries = [...before, { input, score }];
      return { score, tries, outcome: await onRecordTries(tries) };
    });
    // Reported when the run ends; until then a failed score must not count as unhandled.
    next.catch(() => {});
    pending.current = next;
  };

  const held = useCallback(
    (): Promise<HeldTry> =>
      pending.current ?? Promise.reject(new Error('No try was held for this run.')),
    []
  );

  return { hold, held };
};
