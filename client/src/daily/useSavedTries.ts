import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Challenge } from './challenge';
import { extendsExisting, sameTries, type PersistOutcome, type SavedTry } from './history';
import { MAX_TRIES, PlayEvent, PlayInput, PlayState } from './playMachine';
import { valuesForInput } from './templates';
import { HeldTry, useHeldTry } from './useHeldTry';

/** What the page gives `Play` to resume, save, and sync today's tries. */
export type SavedTriesProps = {
  /** Tries saved from an earlier visit today, resumed on load. */
  initialTries: SavedTry[];
  /** Bumps when another tab updates saved history via the storage event. */
  storageRevision: number;
  /** Saves every try so far under a cross-tab lock and reports the persistence outcome. */
  onRecordTries: (tries: SavedTry[]) => Promise<PersistOutcome>;
  /** Called when a try saved at Run is shown at its run's end, so the page catches up. */
  onTriesShown: () => void;
  /** Restores the editor input when another tab's completion freezes this challenge. */
  onRestoreInput: (input: PlayInput) => void;
};

type SavedTriesOptions = SavedTriesProps & {
  challenge: Challenge;
  play: PlayState;
  dispatch: (event: PlayEvent) => void;
  /** Draws values on the stages, as for the last try another tab finished the challenge with. */
  draw: (values: number[]) => void;
};

/**
 * Keeps the tries `Play` shows in step with what is saved. `hold` saves a try when Run is
 * pressed; its run's end shows what the save did. Tries another tab saved are shown once no
 * run is playing. `saveFailed` is set while the latest try couldn't be saved.
 */
export const useSavedTries = ({
  challenge,
  play,
  dispatch,
  draw,
  initialTries,
  storageRevision,
  onRecordTries,
  onTriesShown,
  onRestoreInput,
}: SavedTriesOptions) => {
  const [saveFailed, setSaveFailed] = useState(false);
  const savedTries = useRef(initialTries);
  const appliedRevision = useRef(storageRevision);

  const applySynced = useEffectEvent((tries: SavedTry[]) => {
    savedTries.current = tries;
    setSaveFailed(false);
    if (tries.length >= MAX_TRIES) {
      const finalInput = tries.at(-1)?.input;
      if (finalInput) {
        onRestoreInput(finalInput);
        draw(valuesForInput(challenge, finalInput));
      }
    }
    dispatch({ type: 'synced', scores: tries.map((saved) => saved.score) });
  });

  const { hold, follow, held } = useHeldTry(challenge, savedTries, onRecordTries);
  const showHeld = useEffectEvent(({ score, tries, outcome }: HeldTry) => {
    if (outcome.status === 'synced') {
      applySynced(outcome.tries);
    } else {
      setSaveFailed(outcome.status === 'failed');
      savedTries.current = outcome.status === 'saved' ? outcome.tries : tries;
      dispatch({ type: 'scored', score });
    }
    onTriesShown();
  });

  useEffect(() => {
    if (storageRevision === appliedRevision.current) return;
    if (play.stage === 'running' || play.stage === 'scoring') return;
    appliedRevision.current = storageRevision;
    if (sameTries(initialTries, savedTries.current)) {
      setSaveFailed(false);
      return;
    }
    if (initialTries.length > 0 && extendsExisting(initialTries, savedTries.current)) return;
    applySynced(initialTries);
  }, [initialTries, play.stage, storageRevision]);

  useEffect(() => {
    if (play.stage !== 'scoring') return undefined;
    let cancelled = false;
    held()
      .then((result) => {
        if (!cancelled) showHeld(result);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) dispatch({ type: 'score-failed' });
      });
    return () => {
      cancelled = true;
    };
  }, [play, held, dispatch]);

  return { saveFailed, hold, follow };
};
