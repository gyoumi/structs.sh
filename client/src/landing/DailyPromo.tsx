import { Link } from 'react-router-dom';
import { ArrowRightIcon } from '@/ui/icons';
import landing from './Landing.module.css';
import styles from './DailyPromo.module.css';

const DailyPromo = () => (
  <section aria-labelledby="daily-promo-title" className={styles.promo}>
    <div className={`${landing.wrap} ${styles.row}`}>
      <div className={styles.copy}>
        <h2 id="daily-promo-title" className={landing.sectionTitle}>
          Daily challenge
        </h2>
        <p className={styles.text}>
          One algorithm puzzle each day. Build an input and try to reach the goal in three tries.
        </p>
      </div>
      <Link to="/daily" className={`${landing.primary} ${styles.action}`}>
        Play today’s challenge
        <ArrowRightIcon size={18} />
      </Link>
    </div>
  </section>
);

export default DailyPromo;
