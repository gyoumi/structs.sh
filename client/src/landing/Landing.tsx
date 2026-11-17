import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/martian-mono';
import { CSSProperties, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Radio, RadioGroup } from '@ui-sdk/react/radio';
import logo from '@/assets/img/structs.png';
import { ArrowIcon, ChevronDownIcon } from '@/ui/icons';
import { ThemeToggle, useTheme } from '@/ui/theme';
import { debuggerDestination, topics } from '@/visualiser/topics';
import StructureArt, { artHost } from '@/ui/StructureArt';
import { DESCRIPTION, features, GITHUB, OPEN_SOURCE, tiers } from './content';
import Hero from './Hero';
import styles from './Landing.module.css';

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
        <Link to={choice.path} className={styles.primary}>
          Open {choice.name}
          <ArrowIcon size={18} />
        </Link>
      </div>
    </div>
  );
};

const Landing = () => {
  const theme = useTheme();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = choices.find((choice) => choice.key === selectedKey);

  return (
    <div className={styles.page} data-theme={theme}>
      <title>structs.sh</title>
      <section className={styles.hero} aria-labelledby="hero-title">
        <header className={styles.header}>
          <Link to="/" className={styles.brand}>
            <img src={logo} alt="" width={36} height={36} />
            <span>structs.sh</span>
          </Link>
          <nav aria-label="Main" className={styles.nav}>
            <a href="#structures">Visualiser</a>
            <Link to="/debugger">Debugger</Link>
            <a href={GITHUB} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <ThemeToggle className={styles.themeToggle} />
          </nav>
        </header>
        <div className={styles.heroBody}>
          <div>
            <h1 id="hero-title" className={styles.wordmark}>
              structs.sh
            </h1>
            <p className={styles.lede}>{DESCRIPTION}</p>
            <div className={styles.actions}>
              <a href="#structures" className={styles.primary}>
                Pick a structure
                <ChevronDownIcon size={18} />
              </a>
              <Link to="/debugger" className={styles.secondary}>
                Open the debugger
                <ArrowIcon size={18} />
              </Link>
            </div>
          </div>
          <div className={styles.heroArt}>
            <Hero />
          </div>
        </div>
      </section>

      <main>
        <section id="structures" className={styles.pick} aria-labelledby="structures-title">
          <div className={styles.wrap}>
            <h2 id="structures-title" className={styles.sectionTitle}>
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

        <section className={styles.about} aria-label="About structs.sh">
          <div className={`${styles.wrap} ${styles.aboutGrid}`}>
            <div>
              <h2 className={styles.sectionTitle}>Algorithm visualisation</h2>
              <ul className={styles.features}>
                {features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className={styles.sectionTitle}>Open source</h2>
              <p className={styles.aboutText}>{OPEN_SOURCE}</p>
              <a href={GITHUB} target="_blank" rel="noreferrer" className={styles.secondary}>
                View on GitHub
                <ArrowIcon size={18} />
              </a>
            </div>
          </div>
        </section>

        <section className={styles.sponsors} aria-labelledby="sponsors-title">
          <div className={styles.wrap}>
            <h2 id="sponsors-title" className={styles.sectionTitle}>
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
                        style={{ '--h': sponsor.height } as CSSProperties}
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
      </main>

      <footer className={styles.footer}>
        <div className={styles.wrap}>
          <span>© {new Date().getFullYear()} DevSoc UNSW</span>
          <nav aria-label="Project">
            <a href={GITHUB} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link to="/feedback">Feedback</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
