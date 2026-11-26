import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@ui-sdk/react/menu';
import { PlusIcon } from './icons';
import { cx } from './parts';
import { topics, type TopicInfo } from './topics';

interface StructureTabsProps {
  /** `/1`, `/2` and so on. */
  base: string;
  current: TopicInfo;
  className?: string;
  /** What goes inside a tab. Defaults to the topic's title. */
  renderTab?: (topic: TopicInfo) => ReactNode;
}

const defaultTab = (topic: TopicInfo): ReactNode => topic.title;

/** The first `count` topics, swapping the last one for the current topic if it would be hidden. */
const shownTopics = (count: number, current: TopicInfo): TopicInfo[] => {
  const shown = topics.slice(0, count);
  if (count === 0 || shown.includes(current)) return shown;
  return [...shown.slice(0, -1), current];
};

/**
 * One tab per structure. When there are more than fit, the rest go behind a
 * "More" menu, and the structure on screen always keeps its tab.
 */
export const StructureTabs = ({
  base,
  current,
  className,
  renderTab = defaultTab,
}: StructureTabsProps) => {
  const root = useRef<HTMLElement | null>(null);
  const ruler = useRef<HTMLDivElement | null>(null);
  const [count, setCount] = useState(topics.length);

  useLayoutEffect(() => {
    const nav = root.current;
    const row = ruler.current;
    if (!nav || !row) return undefined;

    const update = () => {
      const widths = [...row.querySelectorAll<HTMLElement>('[data-ruler="tab"]')].map(
        (tab) => tab.getBoundingClientRect().width
      );
      const more = row.querySelector<HTMLElement>('[data-ruler="more"]');
      const moreWidth = more?.getBoundingClientRect().width ?? 0;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const room = nav.clientWidth;
      const fits = (tabs: number, withMore: boolean) =>
        widths.slice(0, tabs).reduce((sum, width) => sum + width, 0) +
          gap * Math.max(0, tabs - 1) +
          (withMore ? gap + moreWidth : 0) <=
        room + 0.5;

      if (fits(widths.length, false)) {
        setCount(widths.length);
        return;
      }
      let tabs = widths.length - 1;
      while (tabs > 1 && !fits(tabs, true)) tabs -= 1;
      setCount(tabs);
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    // Tab widths change once the demo's font arrives.
    document.fonts?.ready.then(update);
    return () => observer.disconnect();
  }, []);

  const shown = shownTopics(count, current);
  const hidden = topics.filter((topic) => !shown.includes(topic));

  return (
    <nav ref={root} className={cx('sx-tabs', className)} aria-label="Data structures">
      <div className="sx-tabs-list">
        {shown.map((topic) => (
          <Link
            key={topic.slug}
            to={`${base}/visualiser/${topic.slug}`}
            className="sx-tab"
            data-topic={topic.slug}
            aria-current={topic === current ? 'page' : undefined}
          >
            {renderTab(topic)}
          </Link>
        ))}
        {hidden.length > 0 ? (
          <Menu>
            <MenuTrigger className="sx-tab sx-tab-more" aria-label={`${hidden.length} more`}>
              <PlusIcon />
              More
            </MenuTrigger>
            <MenuContent className="sx-menu" align="end" sideOffset={6}>
              {hidden.map((topic) => (
                <MenuItem
                  key={topic.slug}
                  value={topic.slug}
                  className="sx-menu-item"
                  render={<Link to={`${base}/visualiser/${topic.slug}`} />}
                >
                  {topic.title}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        ) : null}
      </div>

      {/* A copy nobody sees, used to measure how many tabs fit. */}
      <div className="sx-tabs-ruler" aria-hidden="true">
        <div ref={ruler} className="sx-tabs-list">
          {topics.map((topic) => (
            <span key={topic.slug} className="sx-tab" data-ruler="tab" data-topic={topic.slug}>
              {renderTab(topic)}
            </span>
          ))}
          <span className="sx-tab sx-tab-more" data-ruler="more">
            <PlusIcon />
            More
          </span>
        </div>
      </div>
    </nav>
  );
};
