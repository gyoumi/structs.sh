import { ReactNode, useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { isChallengesLoaded, loadChallenges } from '@/Services/challenges/challenges';
import { CanvasTheme } from '@/visualiser-src/common/canvasTheme';
import type { InitialDataSource } from './session';
import { findTopic, parseSharedInitial, Topic } from './topics';
import { SessionContext, useCreateSession, usePlaybackShortcuts } from './useVisualiser';
import styles from './VisualiserProvider.module.css';

interface VisualiserProviderProps {
  topic: Topic;
  canvasTheme: Partial<CanvasTheme>;
  getInitialData?: InitialDataSource;
  children: ReactNode;
}

type WasmStage = 'ready' | 'loading' | 'error';

interface WasmLoad {
  stage: WasmStage;
  attempt: number;
}

const SessionProvider = ({
  topic,
  canvasTheme,
  getInitialData,
  children,
}: VisualiserProviderProps) => {
  const { data } = useParams();
  const session = useCreateSession(
    topic,
    canvasTheme,
    parseSharedInitial(topic.slug, data),
    getInitialData
  );
  usePlaybackShortcuts(session);
  return <SessionContext value={session}>{children}</SessionContext>;
};

const useWasmStage = (topic: Topic): { stage: WasmStage; retry: () => void } => {
  const [load, setLoad] = useState<WasmLoad>(() => ({
    stage: topic.requiresWasm && !isChallengesLoaded() ? 'loading' : 'ready',
    attempt: 0,
  }));

  useEffect(() => {
    if (load.stage !== 'loading') return undefined;
    let cancelled = false;
    loadChallenges().then(
      () => {
        if (!cancelled) setLoad((current) => ({ ...current, stage: 'ready' }));
      },
      () => {
        if (!cancelled) setLoad((current) => ({ ...current, stage: 'error' }));
      }
    );
    return () => {
      cancelled = true;
    };
  }, [load.stage, load.attempt]);

  const retry = () => setLoad((current) => ({ stage: 'loading', attempt: current.attempt + 1 }));
  return { stage: load.stage, retry };
};

export const VisualiserProvider = (props: VisualiserProviderProps) => {
  const { topic } = props;
  const { stage, retry } = useWasmStage(topic);

  if (stage === 'loading') {
    return (
      <div className={styles.notice} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        <p className={styles.message}>{`Loading ${topic.noun}…`}</p>
      </div>
    );
  }

  if (stage === 'error') {
    return (
      <div className={styles.notice} role="alert">
        <p className={styles.message}>{`Couldn’t load the ${topic.noun} visualiser.`}</p>
        <button type="button" className={styles.retry} onClick={retry}>
          Retry
        </button>
      </div>
    );
  }

  return <SessionProvider {...props} />;
};

interface TopicRouteProps {
  children: (topic: Topic) => ReactNode;
}

export const TopicRoute = ({ children }: TopicRouteProps) => {
  const { topic: slug } = useParams();
  const topic = findTopic(slug);
  if (!topic) return <Navigate to="/" replace />;
  return <>{children(topic)}</>;
};
