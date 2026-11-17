import { Fragment } from 'react';
import { Link, useLocation } from 'react-router-dom';
import logo from '@/assets/img/structs.png';
import { ArrowIcon } from '@/ui/icons';
import { ThemeToggle, useTheme } from '@/ui/theme';
import hero from './Hero.module.css';
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
    <div className={`${landing.page} ${landing.hero}`} data-theme={theme}>
      <title>Page not found | structs.sh</title>
      <header className={landing.header}>
        <Link to="/" className={landing.brand}>
          <img src={logo} alt="" width={36} height={36} />
          <span>structs.sh</span>
        </Link>
        <ThemeToggle className={landing.themeToggle} />
      </header>
      <main className={landing.heroBody}>
        <div>
          <h1 className={landing.wordmark}>404</h1>
          <p className={landing.lede}>
            There’s no page at <code className={styles.path}>{pathname}</code>. Check the address,
            or pick a structure to visualise.
          </p>
          <div className={landing.actions}>
            <Link to="/" className={landing.primary}>
              Go to the home page
              <ArrowIcon size={18} />
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
  );
};

export default NotFound;
