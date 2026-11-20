import { CSSProperties } from 'react';
import { Link, useLocation } from 'react-router-dom';
import logo from '@/assets/img/structs.png';
import { ArrowRightIcon } from '@/ui/icons';
import { ThemeToggle, useTheme } from '@/ui/theme';
import landing from './Landing.module.css';
import hero from './HeroSection.module.css';
import styles from './NotFound.module.css';

const BARS = [34, 58, 22, 76];

const NotFound = () => {
  const theme = useTheme();
  const { pathname } = useLocation();

  return (
    <div className={`${landing.page} ${landing.hero}`} data-theme={theme}>
      <title>Page not found | structs.sh</title>
      <header className={hero.header}>
        <Link to="/" className={hero.brand}>
          <img src={logo} alt="" width={36} height={36} />
          <span>structs.sh</span>
        </Link>
        <ThemeToggle className={hero.themeToggle} />
      </header>
      <main className={hero.heroBody}>
        <div>
          <h1 className={hero.wordmark}>404</h1>
          <p className={hero.lede}>
            There’s no page at <code className={styles.path}>{pathname}</code>. Check the address,
            or pick a structure to visualise.
          </p>
          <div className={hero.actions}>
            <Link to="/" className={landing.primary}>
              Go to the home page
              <ArrowRightIcon size={18} />
            </Link>
            <a href="/#structures" className={landing.secondary}>
              Pick a structure
            </a>
          </div>
        </div>
        <ol className={styles.array} aria-hidden="true">
          {BARS.map((value, index) => (
            <li key={value} className={styles.cell}>
              <span className={styles.bar} style={{ '--h': value } as CSSProperties}>
                {value}
              </span>
              <span className={styles.index}>{index}</span>
            </li>
          ))}
          <li className={styles.cell}>
            <span className={`${styles.bar} ${styles.missing}`}>?</span>
            <span className={styles.index}>{BARS.length}</span>
          </li>
        </ol>
      </main>
    </div>
  );
};

export default NotFound;
