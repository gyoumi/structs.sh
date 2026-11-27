import { idleBanner } from '@/visualiser-src/hash-table-visualiser/util/bannerText';
import { useSnapshot } from './useVisualiser';
import styles from './HashTablePhoneBanner.module.css';

/** Screen-sized hash table status pill driven directly by the playback timeline on narrow screens. */
const HashTablePhoneBanner = () => {
  const status = useSnapshot((s) => s.status);
  return (
    <div className={styles.banner} data-hash-phone-banner="" aria-live="polite">
      {status ?? idleBanner()}
    </div>
  );
};

export default HashTablePhoneBanner;
