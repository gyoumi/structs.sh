import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { Link } from 'react-router-dom';
import { Radio, RadioGroup } from '@ui-sdk/react/radio';
import logo from '@/assets/img/structs.png';
import airwallexLogo from '@/assets/img/sponsors/airwallex.avif';
import aristaLogo from '@/assets/img/sponsors/arista.png';
import atlassianLogo from '@/assets/img/sponsors/atlassian.png';
import hrtLogo from '@/assets/img/sponsors/hrt.png';
import janeStreetLogo from '@/assets/img/sponsors/jane_street.svg';
import lyraLogo from '@/assets/img/sponsors/lyra.svg';
import qrtLogo from '@/assets/img/sponsors/qrt.svg';
import theTradeDeskLogo from '@/assets/img/sponsors/thetradedesk.png';
import { StructureArt } from './art';
import { ArrowIcon, ChevronIcon } from './icons';
import { DEBUGGER_PATH, DemoFrame, REPO_URL, useTitle } from './page';
import { cx } from './parts';
import { destinations, type Destination } from './topics';
import './landing.css';

/* The words on this page are the ones on the current site, not new ones. */
const DESCRIPTION =
  'An interactive learning platform for computer science, tailored to UNSW CSE students.';

const FEATURES = [
  'Visualise algorithms for fundamental operations on classic data structures such as linked lists, binary search trees and graphs.',
  'Granular animation control with play/pause, stepping, slider and speed control',
  'Control the visualiser through a simple menu',
];

const OPEN_SOURCE = 'Developed and maintained by passionate CS and engineering students at UNSW.';

interface Sponsor {
  name: string;
  logo: string;
  href: string;
  /** Logo height in pixels, set per logo so the wordmarks look a similar size. */
  height: number;
}

const tiers: { name: string; sponsors: Sponsor[] }[] = [
  {
    name: 'Platinum',
    sponsors: [
      {
        name: 'Hudson River Trading',
        logo: hrtLogo,
        href: 'https://www.hudsonrivertrading.com/',
        height: 44,
      },
      {
        name: 'Jane Street',
        logo: janeStreetLogo,
        href: 'https://www.janestreet.com/',
        height: 38,
      },
      {
        name: 'Lyra Technologies',
        logo: lyraLogo,
        href: 'https://www.lyratechnologies.com.au/',
        height: 46,
      },
      {
        name: 'The Trade Desk',
        logo: theTradeDeskLogo,
        href: 'https://careers.thetradedesk.com/',
        height: 30,
      },
    ],
  },
  {
    name: 'Gold',
    sponsors: [
      { name: 'Airwallex', logo: airwallexLogo, href: 'https://www.airwallex.com/au', height: 36 },
      { name: 'Arista', logo: aristaLogo, href: 'https://www.arista.com/en/', height: 26 },
      { name: 'Atlassian', logo: atlassianLogo, href: 'https://www.atlassian.com/', height: 24 },
      { name: 'QRT', logo: qrtLogo, href: 'https://www.qube-rt.com/', height: 34 },
    ],
  },
];

interface ReplayProps {
  className?: string;
  children: ReactNode;
}

/**
 * Plays its children's entrance again whenever they scroll back into view or a
 * mouse moves onto them, by mounting them afresh.
 */
export const Replay = ({ className, children }: ReplayProps) => {
  const host = useRef<HTMLDivElement | null>(null);
  const [run, setRun] = useState(0);

  useEffect(() => {
    const node = host.current;
    if (!node) return undefined;
    let wasOut = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) wasOut = true;
        else if (wasOut) {
          wasOut = false;
          setRun((value) => value + 1);
        }
      },
      { threshold: [0, 0.4] }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType === 'mouse') setRun((value) => value + 1);
  };

  return (
    <div ref={host} className={className} onPointerEnter={onPointerEnter}>
      <Fragment key={run}>{children}</Fragment>
    </div>
  );
};

const Detail = ({ choice }: { choice: Destination }) => {
  // Turned on a frame late, so the drawing plays instead of starting finished.
  const [active, setActive] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="sx-detail-body sx-art-host" data-active={active || undefined}>
      <StructureArt id={choice.key} className="sx-detail-art" />
      <div className="sx-detail-text">
        <h3>{choice.title}</h3>
        <p>{choice.description}</p>
        <Link to={choice.to} className="sx-cta" data-kind="primary">
          Open {choice.title}
          <ArrowIcon />
        </Link>
      </div>
    </div>
  );
};

const Chooser = ({ base }: { base: string }) => {
  const choices = destinations(base);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = choices.find((choice) => choice.key === selectedKey);

  return (
    <section id="structures" className="sx-pick" aria-labelledby="sx-pick-title">
      <div className="sx-wrap">
        <h2 id="sx-pick-title" className="sx-section-title">
          Pick a structure
        </h2>
        <RadioGroup
          className="sx-tiles"
          aria-labelledby="sx-pick-title"
          value={selectedKey}
          onValueChange={(value) => setSelectedKey(value)}
        >
          {choices.map((choice) => (
            <Radio
              key={choice.key}
              value={choice.key}
              className="sx-tile sx-art-host"
              data-topic={choice.key}
            >
              <StructureArt id={choice.key} className="sx-tile-art" />
              <span className="sx-tile-name">{choice.title}</span>
            </Radio>
          ))}
        </RadioGroup>
        <div className="sx-detail" aria-live="polite" data-topic={selected?.key}>
          {selected ? (
            <Detail key={selected.key} choice={selected} />
          ) : (
            <p className="sx-detail-empty">Select a structure above to see what it does.</p>
          )}
        </div>
      </div>
    </section>
  );
};

export interface LandingConfig {
  /** `/1`, `/2` and so on. */
  base: string;
  /** The demo's class, which carries its tokens. */
  className: string;
  /** The page's main heading. */
  heading: ReactNode;
  /** A line under the heading, only where one has been agreed. */
  tagline?: string;
  /** The drawing in the hero. */
  art: ReactNode;
  /** False for a hero drawing that people operate themselves. */
  replayArt?: boolean;
}

/** The landing page. Every demo shares this structure and dresses it with its own stylesheet. */
export const LandingPage = ({ config }: { config: LandingConfig }) => {
  useTitle('Structs.sh');
  const { base, replayArt = true } = config;

  return (
    <DemoFrame className={cx(config.className, 'sx-landing')}>
      <section className="sx-hero" aria-labelledby="sx-hero-title">
        <header className="sx-nav">
          <Link to={base} className="sx-brand">
            <img src={logo} alt="" width={36} height={36} />
            <span>Structs.sh</span>
          </Link>
          <nav aria-label="Main" className="sx-nav-links">
            <a href="#structures">Visualiser</a>
            <Link to={DEBUGGER_PATH}>Debugger</Link>
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </nav>
        </header>
        <div className="sx-hero-body sx-wrap">
          <div className="sx-hero-copy">
            <h1 id="sx-hero-title">{config.heading}</h1>
            {config.tagline ? <p className="sx-hero-tagline">{config.tagline}</p> : null}
            <p className="sx-hero-lede">{DESCRIPTION}</p>
            <div className="sx-hero-actions">
              <a href="#structures" className="sx-cta" data-kind="primary">
                Pick a structure
                <ChevronIcon />
              </a>
              <Link to={DEBUGGER_PATH} className="sx-cta" data-kind="secondary">
                Open the debugger
                <ArrowIcon />
              </Link>
            </div>
          </div>
          {replayArt ? (
            <Replay className="sx-hero-art">{config.art}</Replay>
          ) : (
            <div className="sx-hero-art">{config.art}</div>
          )}
        </div>
      </section>

      <main id="main">
        <Chooser base={base} />

        <section className="sx-about" aria-label="About Structs.sh">
          <div className="sx-wrap sx-about-grid">
            <div>
              <h2 className="sx-section-title">Algorithm visualisation</h2>
              <ul className="sx-features">
                {FEATURES.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="sx-section-title">Open source</h2>
              <p className="sx-about-text">{OPEN_SOURCE}</p>
              <a
                href={REPO_URL}
                target="_blank"
                rel="noreferrer"
                className="sx-cta"
                data-kind="secondary"
              >
                View on GitHub
                <ArrowIcon />
              </a>
            </div>
          </div>
        </section>

        <section className="sx-sponsors" aria-labelledby="sx-sponsors-title">
          <div className="sx-wrap">
            <h2 id="sx-sponsors-title" className="sx-section-title">
              Our sponsors
            </h2>
            {tiers.map((tier) => (
              <div key={tier.name} className="sx-tier">
                <h3>{tier.name}</h3>
                <ul>
                  {tier.sponsors.map((sponsor) => (
                    <li key={sponsor.name}>
                      <a
                        href={sponsor.href}
                        target="_blank"
                        rel="noreferrer"
                        style={{ '--h': sponsor.height } as CSSProperties}
                      >
                        <img src={sponsor.logo} alt={sponsor.name} />
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="sx-footer">
        <div className="sx-wrap">
          <span>© {new Date().getFullYear()} DevSoc UNSW</span>
          <nav aria-label="Project">
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <Link to="/feedback">Feedback</Link>
            <a href="https://devsoc.app/" target="_blank" rel="noreferrer">
              DevSoc
            </a>
          </nav>
        </div>
      </footer>
    </DemoFrame>
  );
};
