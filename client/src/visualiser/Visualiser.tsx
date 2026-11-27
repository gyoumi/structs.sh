import '@fontsource-variable/fredoka';
import { ReactNode, useEffect } from 'react';
import { Theme, useTheme } from '@/ui/theme';
import Stage from './Stage';
import VisualiserHeader from './VisualiserHeader';
import Operations from './Operations';
import DataActions from './DataActions';
import ZoomControls from './ZoomControls';
import Transport from './Transport';
import CodePanel from './CodePanel';
import HashTablePhoneBanner from './HashTablePhoneBanner';
import { TopicRoute, VisualiserProvider } from './VisualiserProvider';
import { Topic } from './topics';
import { canvasThemes } from './canvasThemes';
import { useMediaQuery } from './useVisualiser';
import styles from './Visualiser.module.css';

const NARROW_STAGE = '(max-width: 560px)';
const PHONE_HASH_TABLE_MIN_SCALE = 0.72;

const Workspace = ({ topic }: { topic: Topic }) => {
  const narrow = useMediaQuery(NARROW_STAGE);
  const phoneHashTable = narrow && topic.slug === 'hash-tables';

  return (
    <div className={styles.main}>
      <Operations topic={topic} />
      <div className={styles.stageWrap}>
        <Stage
          label={`${topic.name} drawing`}
          className={styles.stage}
          minScale={phoneHashTable ? PHONE_HASH_TABLE_MIN_SCALE : undefined}
        >
          {(view) => (
            <>
              <DataActions topic={topic} />
              <ZoomControls view={view} />
              {phoneHashTable && <HashTablePhoneBanner />}
            </>
          )}
        </Stage>
        <Transport />
      </div>
      <CodePanel topic={topic} />
    </div>
  );
};

interface PageProps {
  topic: Topic;
  theme: Theme;
  children: ReactNode;
}

const Page = ({ topic, theme, children }: PageProps) => {
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
      {children}
    </div>
  );
};

const PHONE = '(max-width: 700px)';

const phoneCounts: Record<string, number> = { 'Linked Lists': 5, 'Sorting Algorithms': 7 };

const getPhoneInitialData = (topicTitle: string) => {
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
        <Page topic={topic} theme={theme}>
          <VisualiserProvider
            key={topic.slug}
            topic={topic}
            canvasTheme={canvasThemes[theme]}
            getInitialData={getPhoneInitialData}
          >
            <Workspace topic={topic} />
          </VisualiserProvider>
        </Page>
      )}
    </TopicRoute>
  );
};

export default Visualiser;
