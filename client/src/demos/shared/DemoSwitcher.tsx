import { Link, useLocation } from 'react-router-dom';

export const DEMO_COUNT = 5;

/**
 * Prototype-only: hops between the five demos while keeping the page you're on,
 * so the same topic can be compared across them.
 */
export const DemoSwitcher = () => {
  const { pathname } = useLocation();
  const [, current, ...rest] = pathname.split('/');
  return (
    <nav className="sx-switcher" aria-label="Design demos">
      <span className="sx-switcher-label">Demo</span>
      {Array.from({ length: DEMO_COUNT }, (_, index) => String(index + 1)).map((demo) => (
        <Link
          key={demo}
          to={`/${[demo, ...rest].join('/')}`}
          aria-current={demo === current ? 'page' : undefined}
        >
          {demo}
        </Link>
      ))}
    </nav>
  );
};
