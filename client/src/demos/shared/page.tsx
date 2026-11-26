import { useEffect, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { DemoSwitcher } from './DemoSwitcher';
import { cx } from './parts';
import { topicBySlug, topics, type TopicInfo } from './topics';
import './base.css';

export { DEBUGGER_PATH } from './topics';
export const REPO_URL = 'https://github.com/devsoc-unsw/structs.sh';

export const useTitle = (title: string): void => {
  useEffect(() => {
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
};

export const useTopicParam = (): TopicInfo | undefined => topicBySlug(useParams().topic);

interface DemoFrameProps {
  /** The demo's own class, which carries its tokens. */
  className: string;
  /** The topic on screen, for styles that change with it. */
  topic?: string;
  children: ReactNode;
}

export const DemoFrame = ({ className, topic, children }: DemoFrameProps) => (
  <div className={cx('sx', className)} data-topic={topic}>
    <a className="sx-skip" href="#main">
      Skip to content
    </a>
    {children}
    <DemoSwitcher />
  </div>
);

interface MissingTopicProps {
  base: string;
}

export const MissingTopic = ({ base }: MissingTopicProps) => (
  <main id="main" className="sx-missing">
    <h1>That topic doesn’t exist</h1>
    <p>Pick one of these instead.</p>
    <ul>
      {topics.map((topic) => (
        <li key={topic.slug}>
          <Link to={`${base}/visualiser/${topic.slug}`}>{topic.title}</Link>
        </li>
      ))}
    </ul>
  </main>
);
