import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import logo from '@/assets/img/structs.png';
import { ArrowRightIcon } from '@/ui/icons';
import { ThemeToggle, useTheme } from '@/ui/theme';
import hero from './Hero.module.css';
import heroSection from './HeroSection.module.css';
import landing from './Landing.module.css';
import styles from './NotFound.module.css';

const PAGES = ['/', '/visualiser', '/debugger'];

const CODE = [
  'page *find(page *p, char *path) {',
  '  while (p != NULL) {',
  '    if (strcmp(p->path, path) == 0) return p;',
  '    p = p->next;',
  '  }',
  '  return NULL;',
  '}',
];

const RETURN_LINE = 5;

const NotFound = () => {
  const theme = useTheme();
  const { pathname } = useLocation();

  return (
    <div className={landing.page} data-theme={theme}>
      <div className={landing.hero}>
        <title>Page not found | structs.sh</title>
        <header className={heroSection.header}>
          <Link to="/" className={heroSection.brand}>
            <img src={logo} alt="" width={36} height={36} />
            <span>structs.sh</span>
          </Link>
          <ThemeToggle className={heroSection.themeToggle} />
        </header>
        <main className={heroSection.heroBody}>
          <div>
            <h1 className={heroSection.wordmark}>404</h1>
            <p className={heroSection.lede}>
              There’s no page at <code className={styles.path}>{pathname}</code>. Check the address,
              or pick a structure to visualise.
            </p>
            <div className={heroSection.actions}>
              <Link to="/" className={landing.primary}>
                Go to the home page
                <ArrowRightIcon size={18} />
              </Link>
              <a href="/#structures" className={landing.secondary}>
                Pick a structure
              </a>
            </div>
          </div>
          <div className={hero.wrap} aria-hidden="true">
            <div className={hero.editor}>
              <div className={hero.editorBar}>
                <i />
                <i />
                <i />
                <span className={`${hero.editorTitle} ${styles.call}`}>find(head, path)</span>
                <span className={hero.editorStatus}>returned NULL</span>
              </div>
              <div className={styles.list}>
                {PAGES.map((page) => (
                  <Fragment key={page}>
                    <span className={styles.node}>{page}</span>
                    <span className={styles.arrow} />
                  </Fragment>
                ))}
                <span className={styles.end}>
                  NULL
                  <span className={styles.cursor}>p</span>
                </span>
              </div>
              <ol className={hero.listing}>
                {CODE.map((line, index) => (
                  <li key={line} data-active={index === RETURN_LINE || undefined}>
                    {line}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default NotFound;
