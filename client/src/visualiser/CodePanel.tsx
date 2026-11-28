import CodeListing from './CodeListing';
import { useNarration } from './useNarration';
import { useSnapshot } from './useVisualiser';
import { Topic } from './topics';
import styles from './CodePanel.module.css';

const CodePanel = ({ topic }: { topic: Topic }) => {
  const narration = useNarration(topic);
  const status = useSnapshot((s) => s.status);
  const body =
    status ??
    (narration.state === 'done'
      ? 'Finished. Replay it, step back through it, or run another.'
      : null);
  return (
    <aside className={styles.code} aria-labelledby="code-title">
      <h2 id="code-title" className={styles.codeTitle}>
        Code
      </h2>
      <div className={styles.live} aria-live="polite">
        {narration.state !== 'idle' && (
          <div className={styles.narration} data-state={narration.state}>
            <p className={styles.narrationTitle}>{narration.title}</p>
            {body && (
              <p className={styles.narrationBody} data-step-status="">
                {body}
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
