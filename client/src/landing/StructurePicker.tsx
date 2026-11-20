import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio, RadioGroup } from '@ui-sdk/react/radio';
import { ArrowIcon } from '@/ui/icons';
import { debuggerDestination, topics } from '@/visualiser/topics';
import StructureArt, { artHost } from '@/ui/StructureArt';
import landing from './Landing.module.css';
import styles from './StructurePicker.module.css';

interface Choice {
  key: string;
  name: string;
  description: string;
  path: string;
}

const choices: Choice[] = [
  ...topics.map((topic) => ({
    key: topic.slug,
    name: topic.title,
    description: topic.description,
    path: `/visualiser/${topic.slug}`,
  })),
  debuggerDestination,
];

const Detail = ({ choice }: { choice: Choice }) => {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className={`${styles.detailBody} ${artHost}`} data-active={active ? '' : undefined}>
      <StructureArt id={choice.key} className={styles.detailArt} />
      <div>
        <h3 className={styles.detailName}>{choice.name}</h3>
        <p className={styles.detailText}>{choice.description}</p>
        <Link to={choice.path} className={landing.primary}>
          Open {choice.name}
          <ArrowIcon size={18} />
        </Link>
      </div>
    </div>
  );
};

const StructurePicker = () => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = choices.find((choice) => choice.key === selectedKey);

  return (
    <section id="structures" className={styles.pick} aria-labelledby="structures-title">
      <div className={landing.wrap}>
        <h2 id="structures-title" className={landing.sectionTitle}>
          Pick a structure
        </h2>
        <RadioGroup
          aria-labelledby="structures-title"
          className={styles.tiles}
          value={selectedKey}
          onValueChange={(value: string | null) => setSelectedKey(value)}
        >
          {choices.map((choice) => (
            <Radio key={choice.key} value={choice.key} className={`${styles.tile} ${artHost}`}>
              <StructureArt id={choice.key} className={styles.tileArt} />
              <span className={styles.tileName}>{choice.name}</span>
            </Radio>
          ))}
        </RadioGroup>
        <div className={styles.detail} aria-live="polite">
          {selected ? (
            <Detail key={selected.key} choice={selected} />
          ) : (
            <p className={styles.empty}>Select a structure above to see what it does.</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default StructurePicker;
