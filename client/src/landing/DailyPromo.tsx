import { Link } from 'react-router-dom';
import { ArrowRightIcon, LockIcon } from '@/ui/icons';
import landing from './Landing.module.css';
import styles from './DailyPromo.module.css';

const highlights = [
  {
    title: '7 challenge modes:',
    text: 'Quicksort, bubble, merge, insertion, BST, AVL, and linked lists.',
  },
  {
    title: '3 tries a day:',
    text: 'Watch each run animate, adjust your input, and chase the goal.',
  },
  {
    title: 'Streaks & sharing:',
    text: 'Keep your streak in your browser and copy a spoiler-free scorecard.',
  },
];

const previewTiles = [
  { value: 7, locked: false },
  { value: 2, locked: true },
  { value: 9, locked: false },
  { value: 4, locked: false },
  { value: 1, locked: true },
  { value: 6, locked: false },
];

const previewTries = [
  { score: 30, reached: false },
  { score: 34, reached: true },
  { score: 36, reached: true },
];

/** A decorative taste of a finished daily challenge. */
const Preview = () => (
  <div className={styles.preview} aria-hidden="true">
    <div className={styles.previewHeader}>
      <span className={styles.previewTitle}>Daily #12 · Quicksort</span>
      <span className={styles.badge}>3 days 🔥</span>
    </div>
    <div className={styles.tiles}>
      {previewTiles.map((tile) => (
        <span key={tile.value} className={styles.tile} data-locked={tile.locked ? '' : undefined}>
          {tile.locked && <LockIcon size={12} className={styles.lock} />}
          {tile.value}
        </span>
      ))}
    </div>
    <div className={styles.scoreRow}>
      <span className={styles.score}>
        <strong>36</strong> / goal 34
      </span>
      <span className={styles.reached}>Goal reached ⭐</span>
    </div>
    <div className={styles.tries}>
      {previewTries.map((attempt) => (
        <span
          key={attempt.score}
          className={styles.try}
          data-reached={attempt.reached ? '' : undefined}
        >
          {attempt.score}
          {attempt.reached && ' ⭐'}
        </span>
      ))}
    </div>
  </div>
);

const DailyPromo = () => (
  <section aria-label="Daily challenge" className={styles.promo}>
    <div className={`${landing.wrap} ${styles.grid}`}>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>Daily challenge</span>
        <h2 className={landing.sectionTitle}>Push an algorithm to its limit</h2>
        <p className={styles.lede}>
          A new challenge drops every midnight in Sydney. Design an input, run the visualiser, and
          beat the goal.
        </p>
        <ul className={styles.highlights}>
          {highlights.map((item) => (
            <li key={item.title}>
              <strong>{item.title}</strong> {item.text}
            </li>
          ))}
        </ul>
        <Link to="/daily" className={landing.primary}>
          Play today’s challenge
          <ArrowRightIcon size={18} />
        </Link>
      </div>
      <Preview />
    </div>
  </section>
);

export default DailyPromo;
