import { CSSProperties } from 'react';
import { tiers } from './content';
import landing from './Landing.module.css';
import styles from './Sponsors.module.css';

const Sponsors = () => (
  <section className={styles.sponsors} aria-labelledby="sponsors-title">
    <div className={landing.wrap}>
      <h2 id="sponsors-title" className={landing.sectionTitle}>
        Our sponsors
      </h2>
      {tiers.map((tier) => (
        <div key={tier.name} className={styles.tier}>
          <h3>{tier.name}</h3>
          <ul>
            {tier.sponsors.map((sponsor) => (
              <li key={sponsor.name}>
                <a
                  href={sponsor.href}
                  target="_blank"
                  rel="noreferrer"
                  data-sponsor={sponsor.name.toLowerCase()}
                  style={{ '--logo-height': sponsor.logoHeight } as CSSProperties}
                >
                  <img src={sponsor.logo} alt={sponsor.name} />
                </a>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  </section>
);

export default Sponsors;
