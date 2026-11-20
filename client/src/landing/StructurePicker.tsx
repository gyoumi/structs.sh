import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio, RadioGroup } from '@ui-sdk/react/radio';
import { ArrowRightIcon } from '@/ui/icons';
import { debuggerDestination, Destination, topics } from '@/visualiser/topics';
import StructureArt, { artHostClass } from '@/ui/StructureArt';
import landing from './Landing.module.css';
import styles from './StructurePicker.module.css';

const destinations: Destination[] = [
  ...topics.map((topic) => ({
    key: topic.slug,
    name: topic.title,
    description: topic.description,
    path: `/visualiser/${topic.slug}`,
  })),
  debuggerDestination,
];

const Detail = ({ destination }: { destination: Destination }) => {
  const [active, setActive] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className={`${styles.detailBody} ${artHostClass}`} data-active={active ? '' : undefined}>
      <StructureArt id={destination.key} className={styles.detailArt} />
      <div>
        <h3 className={styles.detailName}>{destination.name}</h3>
        <p className={styles.detailText}>{destination.description}</p>
        <Link to={destination.path} className={landing.primary}>
          Open {destination.name}
          <ArrowRightIcon size={18} />
        </Link>
      </div>
    </div>
  );
};

const StructurePicker = () => {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = destinations.find((destination) => destination.key === selectedKey);

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
          {destinations.map((destination) => (
            <Radio
              key={destination.key}
              value={destination.key}
              className={`${styles.tile} ${artHostClass}`}
            >
              <StructureArt id={destination.key} className={styles.tileArt} />
              <span className={styles.tileName}>{destination.name}</span>
            </Radio>
          ))}
        </RadioGroup>
        <div className={styles.detail} aria-live="polite">
          {selected ? (
            <Detail key={selected.key} destination={selected} />
          ) : (
            <p className={styles.empty}>Select a structure above to see what it does.</p>
          )}
        </div>
      </div>
    </section>
  );
};

export default StructurePicker;
