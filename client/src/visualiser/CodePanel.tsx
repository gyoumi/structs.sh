import CodeListing from './CodeListing';
import { useNarration } from './useNarration';
import { TopicInfo } from './topics';
import styles from './CodePanel.module.css';

const CodePanel = ({ topic }: { topic: TopicInfo }) => {
  const narration = useNarration(topic);
  return (
    <aside className={styles.code} aria-labelledby="code-title">
      <h2 id="code-title" className={styles.codeTitle}>
        Code
      </h2>
      <div className={styles.live} aria-live="polite">
        {narration.state !== 'idle' && (
          <div className={styles.narration} data-state={narration.state}>
            <p className={styles.narrationHead}>{narration.title}</p>
            {narration.state === 'done' && (
              <p className={styles.narrationBody}>
                Finished. Replay it, step back through it, or run another.
              </p>
            )}
          </div>
        )}
      </div>
      <CodeListing
        className={styles.listing}
        lineClassName={styles.codeLine}
        numberClassName={styles.codeNumber}
        emptyClassName={styles.codeEmpty}
        emptyMessage="Run an operation to see its C code here."
      />
    </aside>
  );
};

export default CodePanel;
