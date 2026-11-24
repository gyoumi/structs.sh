import { Link } from 'react-router-dom';
import logo from '@/assets/img/structs.png';
import { ArrowRightIcon, ChevronDownIcon } from '@/ui/icons';
import { ThemeToggle } from '@/ui/theme';
import { DESCRIPTION, GITHUB_URL } from './content';
import Hero from './Hero';
import landing from './Landing.module.css';
import styles from './HeroSection.module.css';

const HeroSection = () => (
  <section className={landing.hero} aria-labelledby="hero-title">
    <header className={styles.header}>
      <Link to="/" className={styles.brand}>
        <img src={logo} alt="" width={36} height={36} />
        <span>structs.sh</span>
      </Link>
      <nav aria-label="Main" className={`${styles.nav} ${styles.landingNav}`}>
        <a href="#structures">Visualiser</a>
        <Link to="/daily">Daily puzzle</Link>
        <Link to="/debugger">Debugger</Link>
        <a href={GITHUB_URL} target="_blank" rel="noreferrer">
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
          <a href="#structures" className={landing.primary}>
            Pick a structure
            <ChevronDownIcon size={18} />
          </a>
          <Link to="/debugger" className={landing.secondary}>
            Open the debugger
            <ArrowRightIcon size={18} />
          </Link>
          <Link to="/daily" className={landing.secondary}>
            Play today’s puzzle
            <ArrowRightIcon size={18} />
          </Link>
        </div>
      </div>
      <div className={styles.heroArt}>
        <Hero />
      </div>
    </div>
  </section>
);

export default HeroSection;
