import { useEffect, useState } from 'react';
import { Challenge, parseChallenge } from './challenge';

const CHALLENGE_URL = '/api/daily';

type ChallengeState =
  | { status: 'loading' }
  | { status: 'unreachable' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; challenge: Challenge };

/** What a failed response means: no challenge for today yet, a gateway or server outage, or another error. */
const failedStatus = (status: number): ChallengeState => {
  if (status === 404) return { status: 'unavailable' };
  if (status === 502 || status === 503 || status === 504) return { status: 'unreachable' };
  return { status: 'error' };
};

/** Today's challenge from the server, and `retry` to ask again after a failure. */
export const useChallenge = (): { state: ChallengeState; retry: () => void } => {
  const [state, setState] = useState<ChallengeState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const settle = (next: ChallengeState) => {
      if (!controller.signal.aborted) setState(next);
    };
    fetch(CHALLENGE_URL, { signal: controller.signal })
      .then(
        async (response) => {
          if (!response.ok) {
            settle(failedStatus(response.status));
            return;
          }
          try {
            settle({ status: 'ready', challenge: parseChallenge(await response.json()) });
          } catch (error) {
            console.error(error);
            settle({ status: 'error' });
          }
        },
        (error) => {
          if (controller.signal.aborted) return;
          console.error(error);
          settle({ status: 'unreachable' });
        }
      )
      .catch(() => {});
    return () => controller.abort();
  }, [attempt]);

  const retry = () => {
    setState({ status: 'loading' });
    setAttempt((n) => n + 1);
  };

  return { state, retry };
};
