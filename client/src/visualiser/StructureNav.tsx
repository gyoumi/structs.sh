import { ReactNode, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '@ui-sdk/react/menu';
import { topics, TopicInfo, TopicSlug } from './topics';

export interface StructureNavClasses {
  root?: string;
  list?: string;
  link?: string;
  more?: string;
  menu?: string;
  menuItem?: string;
  menuSeparator?: string;
}

interface StructureNavProps {
  current: TopicSlug;
  classes: StructureNavClasses;
  renderLink?: (topic: TopicInfo) => ReactNode;
  moreLabel?: ReactNode;
  /** Extra rows at the end of the More menu. The menu always shows while there are any. */
  menuExtra?: ReactNode;
}

const visibleTopics = (count: number, current: TopicSlug): TopicInfo[] => {
  const shown = topics.slice(0, count);
  if (count === 0 || shown.some((topic) => topic.slug === current)) return shown;
  const active = topics.find((topic) => topic.slug === current);
  return active ? [...shown.slice(0, -1), active] : shown;
};

const StructureNav = ({
  current,
  classes,
  renderLink = (topic) => topic.name,
  moreLabel = 'More',
  menuExtra,
}: StructureNavProps) => {
  const rootRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(topics.length);
  const alwaysMore = Boolean(menuExtra);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const measure = measureRef.current;
    if (!root || !measure) return undefined;

    const update = () => {
      const widths = new Map(
        [...measure.querySelectorAll<HTMLElement>('[data-measure="item"]')].map((item) => [
          item.dataset.slug,
          item.getBoundingClientRect().width,
        ])
      );
      const more = measure.querySelector<HTMLElement>('[data-measure="more"]');
      const moreWidth = more?.getBoundingClientRect().width ?? 0;
      const gap = parseFloat(getComputedStyle(measure).columnGap) || 0;
      const available = root.clientWidth;
      const fits = (n: number, withMore: boolean) => {
        const shown = visibleTopics(n, current);
        return (
          shown.reduce((sum, topic) => sum + (widths.get(topic.slug) ?? 0), 0) +
            gap * Math.max(0, shown.length - 1) +
            (withMore ? gap + moreWidth : 0) <=
          available
        );
      };

      if (fits(topics.length, alwaysMore)) {
        setCount(topics.length);
        return;
      }
      let n = topics.length - 1;
      while (n > 1 && !fits(n, true)) n -= 1;
      setCount(n);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    return () => observer.disconnect();
  }, [current, alwaysMore]);

  const shown = visibleTopics(count, current);
  const hidden = topics.filter((topic) => !shown.includes(topic));

  return (
    <nav
      ref={rootRef}
      className={classes.root}
      aria-label="Data structures"
      style={{ position: 'relative', minWidth: 0 }}
    >
      <div className={classes.list}>
        {shown.map((topic) => (
          <Link
            key={topic.slug}
            to={`/visualiser/${topic.slug}`}
            className={classes.link}
            aria-current={topic.slug === current ? 'page' : undefined}
          >
            {renderLink(topic)}
          </Link>
        ))}
        {(hidden.length > 0 || menuExtra) && (
          <Menu>
            <MenuTrigger
              className={classes.more}
              aria-label={
                hidden.length > 0
                  ? `${hidden.length} more structures${menuExtra ? ' and settings' : ''}`
                  : 'Settings'
              }
            >
              {moreLabel}
            </MenuTrigger>
            <MenuContent className={classes.menu} sideOffset={6} align="end">
              {hidden.map((topic) => (
                <MenuItem
                  key={topic.slug}
                  className={classes.menuItem}
                  render={<Link to={`/visualiser/${topic.slug}`} />}
                >
                  {renderLink(topic)}
                </MenuItem>
              ))}
              {menuExtra && hidden.length > 0 && (
                <MenuSeparator className={classes.menuSeparator} />
              )}
              {menuExtra}
            </MenuContent>
          </Menu>
        )}
      </div>

      {/* Hidden copy used only to measure how many links fit. */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          overflow: 'hidden',
          visibility: 'hidden',
          pointerEvents: 'none',
        }}
      >
        <div ref={measureRef} className={classes.list} style={{ width: 'max-content' }}>
          {topics.map((topic) => (
            <span
              key={topic.slug}
              className={classes.link}
              data-measure="item"
              data-slug={topic.slug}
            >
              {renderLink(topic)}
            </span>
          ))}
          <span className={classes.more} data-measure="more">
            {moreLabel}
          </span>
        </div>
      </div>
    </nav>
  );
};

export default StructureNav;
