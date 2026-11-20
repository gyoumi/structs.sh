import { ArrowRightIcon } from '@/ui/icons';
import { features, GITHUB_URL, OPEN_SOURCE } from './content';
import landing from './Landing.module.css';
import styles from './About.module.css';

const About = () => (
  <section className={styles.about} aria-label="About structs.sh">
    <div className={`${landing.wrap} ${styles.aboutGrid}`}>
      <div>
        <h2 className={landing.sectionTitle}>Algorithm visualisation</h2>
        <ul className={styles.features}>
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </div>
      <div>
        <h2 className={landing.sectionTitle}>Open source</h2>
        <p className={styles.aboutText}>{OPEN_SOURCE}</p>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer" className={landing.secondary}>
          View on GitHub
          <ArrowRightIcon size={18} />
        </a>
      </div>
    </div>
  </section>
);

export default About;
