import { ReactNode } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { CanvasTheme } from '@/visualiser-src/common/canvasTheme';
import type { StarterData } from './session';
import { findTopic, TopicInfo } from './topics';
import { SessionContext, useCreateSession, usePlaybackShortcuts } from './useVisualiser';

interface VisualiserProviderProps {
  topic: TopicInfo;
  theme: Partial<CanvasTheme>;
  makeData?: StarterData;
  children: ReactNode;
}

const parseData = (data: string | undefined): number[] | undefined => {
  if (!data) return undefined;
  return (data.match(/.{2}/g) ?? []).map((chunk) => parseInt(chunk, 10)).filter(Number.isFinite);
};

export const VisualiserProvider = ({
  topic,
  theme,
  makeData,
  children,
}: VisualiserProviderProps) => {
  const { data } = useParams();
  const session = useCreateSession(topic, theme, parseData(data), makeData);
  usePlaybackShortcuts(session);
  return <SessionContext value={session}>{children}</SessionContext>;
};

interface TopicRouteProps {
  children: (topic: TopicInfo) => ReactNode;
}

export const TopicRoute = ({ children }: TopicRouteProps) => {
  const { topic: slug } = useParams();
  const topic = findTopic(slug);
  if (!topic) return <Navigate to="/" replace />;
  return <>{children(topic)}</>;
};
