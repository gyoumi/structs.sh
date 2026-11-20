import { useEffect, useState } from 'react';
import { Button } from '@ui-sdk/react/button';
import { CheckIcon, ClearIcon, LinkIcon, ShuffleIcon } from '@/ui/icons';
import { useSession } from './useVisualiser';
import { shareLink, TopicInfo } from './topics';
import styles from './DataActions.module.css';

type CopyState = 'idle' | 'copied' | 'failed';

const CopyLink = ({ topic }: { topic: TopicInfo }) => {
  const session = useSession();
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return undefined;
    const timer = setTimeout(() => setState('idle'), 2000);
    return () => clearTimeout(timer);
  }, [state]);

  const copy = () => {
    // Outside a secure context there is no clipboard, and touching it throws before any promise exists.
    Promise.resolve()
      .then(() =>
        navigator.clipboard.writeText(shareLink(topic.slug, session.data, window.location.origin))
      )
      .then(() => setState('copied'))
      .catch(() => setState('failed'));
  };

  return (
    <Button className={styles.utility} onClick={copy}>
      {state === 'copied' ? <CheckIcon size={16} /> : <LinkIcon size={16} />}
      <span aria-live="polite">
        {state === 'idle' && (
          <>
            Copy <span className={styles.utilityNoun}>link</span>
          </>
        )}
        {state === 'copied' && 'Link copied'}
        {state === 'failed' && 'Couldn’t copy'}
      </span>
    </Button>
  );
};

const DataActions = ({ topic }: { topic: TopicInfo }) => {
  const session = useSession();
  return (
    <div className={styles.utilities}>
      <Button className={styles.utility} onClick={session.generate}>
        <ShuffleIcon size={16} />
        New <span className={styles.utilityNoun}>{topic.noun}</span>
      </Button>
      <Button className={styles.utility} onClick={session.clear}>
        <ClearIcon size={16} />
        Clear
      </Button>
      <CopyLink topic={topic} />
    </div>
  );
};

export default DataActions;
