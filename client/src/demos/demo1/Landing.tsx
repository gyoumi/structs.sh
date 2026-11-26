import type { CSSProperties } from 'react';
import { LandingPage, type LandingConfig } from '../shared/Landing';
import './demo1.css';

const at = (ms: number) => ({ '--at': ms }) as CSSProperties;

/** An insert into a linked list, drawn the way it would be on a tutorial whiteboard. */
const InsertFigure = () => (
  <svg viewBox="0 0 520 292" role="img" aria-labelledby="d1-fig-title">
    <title id="d1-fig-title">
      A linked list of 12, 27 and 41. A new node, 19, is linked in after 27.
    </title>
    <defs>
      <marker
        id="d1-arrow"
        markerUnits="userSpaceOnUse"
        markerWidth="12"
        markerHeight="12"
        refX="8"
        refY="5"
        orient="auto"
      >
        <path d="M1 1l7 4-7 4" className="d1-pencil" strokeWidth="2" />
      </marker>
      <marker
        id="d1-arrow-pen"
        markerUnits="userSpaceOnUse"
        markerWidth="12"
        markerHeight="12"
        refX="8"
        refY="5"
        orient="auto"
      >
        <path d="M1 1l7 4-7 4" className="d1-pencil d1-pen" strokeWidth="2" />
      </marker>
    </defs>

    <text x="70" y="16" data-appear style={at(0)}>
      head
    </text>
    <path
      d="M70 28v22"
      className="d1-pencil"
      markerEnd="url(#d1-arrow)"
      data-appear
      style={at(0)}
    />

    <path d="M98 80h62" className="d1-pencil" pathLength={1} data-draw style={at(260)} />
    <path d="M152 74l8 6-8 6" className="d1-pencil" data-appear style={at(700)} />
    <path d="M218 80h62" className="d1-pencil" pathLength={1} data-draw style={at(420)} />
    <path d="M272 74l8 6-8 6" className="d1-pencil" data-appear style={at(860)} />

    {[
      { x: 70, value: 12, delay: 0 },
      { x: 190, value: 27, delay: 160 },
      { x: 310, value: 41, delay: 320 },
    ].map(({ x, value, delay }) => (
      <g key={value}>
        <circle
          cx={x}
          cy="80"
          r="26"
          className="d1-pencil d1-pencil-fill"
          pathLength={1}
          data-draw
          style={at(delay)}
        />
        <text x={x} y="81" data-appear style={at(delay + 300)}>
          {value}
        </text>
      </g>
    ))}

    <text x="372" y="81" data-appear style={at(700)}>
      NULL
    </text>
    <path d="M338 80h8" className="d1-pencil" data-appear style={at(700)} />

    <text x="172" y="128" className="d1-hand" data-appear style={at(1100)}>
      curr
    </text>

    <circle
      cx="250"
      cy="178"
      r="26"
      className="d1-pencil d1-pencil-fill d1-pen"
      pathLength={1}
      data-draw
      style={at(1200)}
    />
    <text x="250" y="179" data-appear style={at(1500)}>
      19
    </text>
    <text x="150" y="196" className="d1-hand" data-appear style={at(1500)}>
      new node
    </text>

    <path
      d="M268 158l28-48"
      className="d1-pencil d1-pen"
      markerEnd="url(#d1-arrow-pen)"
      pathLength={1}
      data-draw
      style={at(1800)}
    />
    <path
      d="M204 104l28 48"
      className="d1-pencil d1-pen"
      markerEnd="url(#d1-arrow-pen)"
      pathLength={1}
      data-draw
      style={at(2250)}
    />
    <path
      d="M242 70l14 20M256 70l-14 20"
      stroke="var(--d1-red)"
      strokeWidth="2.5"
      strokeLinecap="round"
      data-appear
      style={at(2700)}
    />

    <rect x="24" y="258" width="226" height="22" rx="2" className="d1-swipe" style={at(2250)} />
    <text x="30" y="246" className="d1-codeline" data-appear style={at(1800)}>
      new_node-&gt;next = curr-&gt;next;
    </text>
    <text x="30" y="270" className="d1-codeline" data-appear style={at(2250)}>
      curr-&gt;next = new_node;
    </text>
  </svg>
);

const config: LandingConfig = {
  base: '/1',
  className: 'd1',
  heading: 'Welcome to Structs.sh',
  art: (
    <div className="d1-figure">
      <InsertFigure />
    </div>
  ),
};

const Landing = () => <LandingPage config={config} />;

export default Landing;
