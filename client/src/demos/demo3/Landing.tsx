import { useEffect, useState } from 'react';
import { StructureArt } from '../shared/art';
import { LandingPage, type LandingConfig } from '../shared/Landing';
import { topics } from '../shared/topics';
import './demo3.css';

const TURN_MS = 2400;

/** The four structures in their four colours. Each plays its drawing in turn. */
const ColourStrip = () => {
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [turn, setTurn] = useState(-1);

  useEffect(() => {
    if (reduced) return undefined;
    const first = window.setTimeout(() => setTurn(0), 500);
    const timer = window.setInterval(() => setTurn((value) => value + 1), TURN_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [reduced]);

  return (
    <div className="d3-strip" aria-hidden="true">
      {topics.map((topic, index) => (
        <div
          key={topic.slug}
          className="d3-panel sx-art-host"
          data-topic={topic.slug}
          data-active={(turn >= 0 && turn % topics.length === index) || undefined}
        >
          <StructureArt id={topic.slug} />
        </div>
      ))}
    </div>
  );
};

const config: LandingConfig = {
  base: '/3',
  className: 'd3',
  heading: 'Structs.sh',
  art: <ColourStrip />,
};

const Landing = () => <LandingPage config={config} />;

export default Landing;
