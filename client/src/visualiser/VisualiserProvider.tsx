import { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { CanvasTheme } from '@/visualiser-src/common/canvasTheme';
import type { InitialDataSource } from './session';
import { findTopic, parseSharedData, Topic } from './topics';
import { SessionContext, useCreateSession, usePlaybackShortcuts } from './useVisualiser';

interface VisualiserProviderProps {
  topic: Topic;
  canvasTheme: Partial<CanvasTheme>;
  getInitialData?: InitialDataSource;
  children: ReactNode;
}

export const VisualiserProvider = ({
  topic,
  canvasTheme,
  getInitialData,
  children,
}: VisualiserProviderProps) => {
  const { data } = useParams();
  const session = useCreateSession(topic, canvasTheme, parseSharedData(data), getInitialData);
  usePlaybackShortcuts(session);
  return <SessionContext value={session}>{children}</SessionContext>;
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
