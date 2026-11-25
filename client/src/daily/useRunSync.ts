import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { Challenge } from './challenge';
import { loadHistory, sameTries, savedTriesForChallenge } from './history';
import type { PlayEvent, PlayInput, PlayState, TryScore } from './playMachine';
import { Rig, useStageSnapshot } from './rig';
import {
  applyChange,
  isTabMessage,
  moveTo,
  newRunKey,
  openTabChannel,
  type PlaybackChange,
  playbackAt,
  type RunMessage,
  sharedPlayback,
  type TabMessage,
} from './tabChannel';
import { scoreRun, tryScoreOf } from './templates';
import type { HeldTry } from './useHeldTry';
import { stageRunOf } from './useStageRun';

/** How long a newly opened tab waits for another tab to hand it the run it plays. */
const JOIN_WINDOW_MS = 750;

/** How long a tab playing another tab's run waits for that tab's save before reading storage. */
const RESULT_WAIT_MS = 3000;

/** The run this tab shows that other tabs may show too. */
type SharedRun = { key: string; input: PlayInput; scores: TryScore[]; result?: HeldTry };

type RunSyncOptions = {
  challenge: Challenge;
  rig: Rig;
  play: PlayState;
  dispatch: (event: PlayEvent) => void;
  /** Starts a run on the stages; null when a stage refused it. */
  start: (run: ReturnType<typeof stageRunOf>) => number | null;
  /** Draws values on the stages, dropping any run. */
  draw: (values: number[]) => void;
  /** Puts another tab's input in this tab's editor. */
  onRestoreInput: (input: PlayInput) => void;
  /** Shows the given try at the followed run's end, without saving it again. */
  follow: (result: Promise<HeldTry>) => void;
};

/** What another tab's try came to, read from storage when that tab never said. */
const resultFromStorage = async (challenge: Challenge, run: RunMessage): Promise<HeldTry> => {
  const score = tryScoreOf(challenge, await scoreRun(challenge, run.input));
  const history = loadHistory();
  const tries = savedTriesForChallenge(history, challenge);
  const recorded =
    tries.length === run.scores.length + 1 &&
    sameTries(tries.slice(-1), [{ input: run.input, score }]);
  return { score, tries, outcome: { status: recorded ? 'saved' : 'synced', history, tries } };
};

const sameScores = (a: TryScore[], b: TryScore[]) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Whether this tab shows the tries `run` follows: the same tries, or, for a tab joining it, those
 * and the run's own try, saved at Run. A tab whose tries differ catches up through storage instead.
 */
const showsTriesBefore = (shown: TryScore[], run: RunMessage) =>
  sameScores(shown, run.scores) ||
  (run.at !== undefined &&
    shown.length === run.scores.length + 1 &&
    sameScores(shown.slice(0, -1), run.scores));

/**
 * Plays one run in every tab open on the same day, over `BroadcastChannel`. `announce` sends
 * this tab's run at Run; other tabs play it, follow its playback changes, and show its try when
 * it ends without saving it again. A tab that opens while a run plays asks for it and joins it;
 * a tab that comes back after being hidden or frozen asks where the shared run is now.
 * `playback` is the toolbar's playback, sending each change; `draw` stops sharing the run.
 * Without `BroadcastChannel`, each tab plays alone.
 */
export const useRunSync = ({
  challenge,
  rig,
  play,
  dispatch,
  start,
  draw,
  onRestoreInput,
  follow,
}: RunSyncOptions) => {
  const day = challenge.date ?? '';
  const channel = useRef<BroadcastChannel | null>(null);
  const shared = useRef<SharedRun | null>(null);
  const awaitingResult = useRef<{ key: string; resolve: (result: HeldTry) => void } | null>(null);
  const joinUntil = useRef(0);
  /** Counts playback changes made here or applied from another tab, to spot a stale answer. */
  const changes = useRef(0);
  const changesWhenAsked = useRef(0);
  const following = useRef(false);
  const attached = useStageSnapshot(rig.stages[0], (snapshot) => snapshot.topicTitle !== null);
  const busy = play.stage === 'running' || play.stage === 'scoring';
  useEffect(() => {
    if (!busy) following.current = false;
  }, [busy]);

  const post = (message: TabMessage) => channel.current?.postMessage(message);

  const [playback] = useState(() =>
    sharedPlayback(rig.playback, (change: PlaybackChange) => {
      const run = shared.current;
      changes.current += 1;
      if (run) post({ type: 'playback', key: run.key, change, date: day });
    })
  );

  const resultOf = (run: RunMessage): Promise<HeldTry> => {
    if (run.result) return Promise.resolve(run.result);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        awaitingResult.current = null;
        resultFromStorage(challenge, run).then(resolve, reject);
      }, RESULT_WAIT_MS);
      awaitingResult.current = {
        key: run.key,
        resolve: (result) => {
          clearTimeout(timer);
          resolve(result);
        },
      };
    });
  };

  const followRun = (run: RunMessage) => {
    if (busy || following.current || shared.current?.key === run.key) return;
    if (run.at && Date.now() > joinUntil.current) return;
    if (!showsTriesBefore(play.scores, run)) return;
    onRestoreInput(run.input);
    rig.playback.setSpeed(run.speed);
    const runId = start(stageRunOf(challenge, run.input));
    if (runId === null) return;
    if (run.at) moveTo(rig.playback, run.at);
    following.current = true;
    shared.current = { key: run.key, input: run.input, scores: run.scores, result: run.result };
    follow(resultOf(run));
    dispatch({ type: 'follow', input: run.input, runId, scores: run.scores });
  };

  const receive = useEffectEvent((data: unknown) => {
    if (!isTabMessage(data) || data.date !== day) return;
    const run = shared.current;
    switch (data.type) {
      case 'run':
        if (data.at && run?.key === data.key) {
          // Another tab sharing this run says where it is now; the last to answer wins.
          // A change made since asking is newer than the answer, so it stands.
          if (Date.now() > joinUntil.current || changes.current !== changesWhenAsked.current) {
            return;
          }
          rig.playback.setSpeed(data.speed);
          moveTo(rig.playback, data.at);
          return;
        }
        followRun(data);
        return;
      case 'join':
        if (!run || (play.stage !== 'running' && data.key !== run.key)) return;
        post({
          type: 'run',
          key: run.key,
          input: run.input,
          scores: run.scores,
          speed: rig.playback.getSnapshot().speed,
          at: playbackAt(rig.playback),
          result: run.result,
          date: day,
        });
        return;
      case 'result':
        if (run?.key === data.key) run.result = data.result;
        if (awaitingResult.current?.key === data.key) awaitingResult.current.resolve(data.result);
        return;
      case 'playback':
        if (run?.key !== data.key) return;
        changes.current += 1;
        applyChange(rig.playback, data.change);
        return;
      default:
        data satisfies never;
    }
  });

  useEffect(() => {
    const opened = openTabChannel();
    if (!opened) return undefined;
    channel.current = opened;
    opened.onmessage = (event: MessageEvent) => receive(event.data);
    return () => {
      opened.close();
      channel.current = null;
    };
  }, []);

  /** Asks the other tabs for the run they play, or where the run this tab shares now is. */
  const askWhere = useEffectEvent(() => {
    if (!channel.current) return;
    joinUntil.current = Date.now() + JOIN_WINDOW_MS;
    changesWhenAsked.current = changes.current;
    post({ type: 'join', key: shared.current?.key, date: day });
  });

  useEffect(() => {
    if (attached) askWhere();
  }, [attached]);

  // A hidden or frozen tab's animation stops, so a tab coming back catches up with the others.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') askWhere();
    };
    const onResume = () => askWhere();
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('resume', onResume);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('resume', onResume);
    };
  }, []);

  /** Sends this tab's run to the other tabs, and later what its try came to. */
  const announce = (input: PlayInput, scores: TryScore[], held: Promise<HeldTry>) => {
    const key = newRunKey();
    const run: SharedRun = { key, input, scores };
    shared.current = run;
    const { speed } = rig.playback.getSnapshot();
    post({ type: 'run', key, input, scores, speed, date: day });
    held
      .then((result) => {
        run.result = result;
        post({ type: 'result', key, result, date: day });
      })
      .catch(() => {});
  };

  const drawAlone = (values: number[]) => {
    shared.current = null;
    draw(values);
  };

  return { playback, announce, draw: drawAlone };
};
