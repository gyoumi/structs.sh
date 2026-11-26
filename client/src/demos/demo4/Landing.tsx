import { useEffect, useRef } from 'react';
import { Button } from '@ui-sdk/react/button';
import { LandingPage, type LandingConfig } from '../shared/Landing';
import { Scrubber, StepCount, Transport } from '../shared/parts';
import { Stage, useStage } from '../shared/Stage';
import { formatCall, topicBySlug } from '../shared/topics';
import { useVisualiser } from '../shared/useVisualiser';
import { PALETTE } from './palette';
import './demo4.css';

const tryThese: [string, string[]][] = [
  ['insert', ['65']],
  ['insert', ['45']],
  ['delete', ['30']],
  ['inorderTraversal', []],
];

const liveTopic = topicBySlug('binary-search-trees')!;

/** The real visualiser, running on the landing page. */
const LiveDemo = () => {
  const visualiser = useVisualiser(liveTopic, { palette: PALETTE });
  const stage = useStage(visualiser, { top: 28, right: 28, bottom: 28, left: 28 });
  const latest = useRef(visualiser);
  latest.current = visualiser;
  const host = useRef<HTMLDivElement | null>(null);
  const ready = visualiser.operations.length > 0;

  // Plays an insert each time the demo comes into view, starting from the same tree.
  useEffect(() => {
    const node = host.current;
    if (!ready || !node) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    let timer = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        window.clearTimeout(timer);
        if (!entry.isIntersecting) return;
        timer = window.setTimeout(() => {
          latest.current.restoreSeed();
          latest.current.run('insert', ['65']);
        }, 700);
      },
      { threshold: 0.5 }
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      window.clearTimeout(timer);
    };
  }, [ready]);

  const { lines, active } = visualiser.code;
  const running = active === null ? null : lines[active]?.text;

  return (
    <div ref={host} className="d4-live">
      <div className="d4-live-bar">
        <span>{liveTopic.title}</span>
        {visualiser.current ? (
          <code>{formatCall(visualiser.current.command, visualiser.current.args)}</code>
        ) : null}
        <StepCount visualiser={visualiser} />
      </div>
      <Stage
        stage={stage}
        kind={liveTopic.kind}
        label="A binary search tree"
        className="d4-live-stage"
      />
      <p className="d4-live-line" aria-live="off">
        {running ? <code>{running}</code> : null}
      </p>
      <div className="d4-live-try">
        {tryThese.map(([command, args]) => (
          <Button
            key={formatCall(command, args)}
            className="d4-ghost"
            onClick={() => visualiser.run(command, args)}
          >
            {formatCall(command.replace('Traversal', ''), args)}
          </Button>
        ))}
      </div>
      <div className="d4-live-dock">
        <Transport visualiser={visualiser} compact />
        <Scrubber visualiser={visualiser} />
      </div>
    </div>
  );
};

const config: LandingConfig = {
  base: '/4',
  className: 'd4',
  heading: 'Welcome to Structs.sh',
  art: <LiveDemo />,
  replayArt: false,
};

const Landing = () => <LandingPage config={config} />;

export default Landing;
