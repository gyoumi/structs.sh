import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/martian-mono';
import { useEffect } from 'react';
import { Theme, useTheme } from '@/ui/theme';
import Stage from './Stage';
import VisualiserHeader from './VisualiserHeader';
import Operations from './Operations';
import DataActions from './DataActions';
import ZoomControls from './ZoomControls';
import Transport from './Transport';
import CodePanel from './CodePanel';
import { TopicRoute, VisualiserProvider } from './VisualiserProvider';
import { TopicInfo } from './topics';
import { canvasThemes } from './canvasThemes';
import styles from './Visualiser.module.css';

interface WorkspaceProps {
  topic: TopicInfo;
  theme: Theme;
}

const Workspace = ({ topic, theme }: WorkspaceProps) => {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.structsTheme = theme;
    return () => {
      delete root.dataset.structsTheme;
    };
  }, [theme]);

  return (
    <div className={styles.page} data-theme={theme}>
      <title>{`${topic.name} visualiser | structs.sh`}</title>
      <VisualiserHeader topic={topic} />

      <div className={styles.main}>
        <Operations topic={topic} />
        <div className={styles.stageWrap}>
          <Stage label={`${topic.name} drawing`} className={styles.stage}>
            {(view) => (
              <>
                <DataActions topic={topic} />
                <ZoomControls view={view} />
              </>
            )}
          </Stage>
          <Transport />
        </div>
        <CodePanel topic={topic} />
      </div>
    </div>
  );
};

const PHONE = '(max-width: 700px)';

const phoneCounts: Record<string, number> = { 'Linked Lists': 5, 'Sorting Algorithms': 7 };

const phoneFriendlyData = (topicTitle: string) => {
  const count = phoneCounts[topicTitle];
  if (!count || !window.matchMedia?.(PHONE).matches) return undefined;
  const values = new Set<number>();
  while (values.size < count) values.add(Math.ceil(Math.random() * 99));
  return [...values];
};

const Visualiser = () => {
  const theme = useTheme();
  return (
    <TopicRoute>
      {(topic) => (
        <VisualiserProvider
          key={topic.slug}
          topic={topic}
          theme={canvasThemes[theme]}
          makeData={phoneFriendlyData}
        >
          <Workspace topic={topic} theme={theme} />
        </VisualiserProvider>
      )}
    </TopicRoute>
  );
};

export default Visualiser;
