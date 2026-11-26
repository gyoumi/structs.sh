import { useEffect, useState } from 'react';
import { LandingPage, type LandingConfig } from '../shared/Landing';
import './demo2.css';

const VALUES = [12, 27, 41, 33];

const CODE = [
  { text: 'bool search(struct list *list, int value) {', indent: 0 },
  { text: 'struct node *curr = list->head;', indent: 1 },
  { text: 'while (curr != NULL) {', indent: 1 },
  { text: 'if (curr->value == value) return true;', indent: 2 },
  { text: 'curr = curr->next;', indent: 2 },
  { text: '}', indent: 1 },
  { text: 'return false;', indent: 1 },
  { text: '}', indent: 0 },
];

/** Each step of searching the list for 41: the line that runs, and where `curr` is after it. */
const STEPS = [
  { line: 1, curr: 0 },
  { line: 2, curr: 0 },
  { line: 3, curr: 0 },
  { line: 4, curr: 1 },
  { line: 2, curr: 1 },
  { line: 3, curr: 1 },
  { line: 4, curr: 2 },
  { line: 2, curr: 2 },
  { line: 3, curr: 2 },
];

const STEP_MS = 520;

/** A search running in an editor: the list on top, and the line being executed below. */
const SearchWindow = () => {
  const [reduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [at, setAt] = useState(reduced ? STEPS.length - 1 : 0);

  useEffect(() => {
    if (at >= STEPS.length - 1) return undefined;
    const timer = window.setTimeout(() => setAt(at + 1), STEP_MS);
    return () => window.clearTimeout(timer);
  }, [at]);

  const { line, curr } = STEPS[at];
  const found = at === STEPS.length - 1;

  return (
    <div className="d2-window" aria-hidden="true">
      <div className="d2-window-bar">
        <i />
        <i />
        <i />
        <span>search(41)</span>
      </div>
      <svg className="d2-list" viewBox="0 0 400 104">
        {VALUES.map((value, index) => {
          const x = 56 + index * 96;
          return (
            <g key={value} data-found={(found && index === curr) || undefined}>
              {index > 0 ? <path d={`M${x - 68} 40h36m-7-6 7 6-7 6`} /> : null}
              <circle cx={x} cy="40" r="22" />
              <text x={x} y="41">
                {value}
              </text>
            </g>
          );
        })}
        <g className="d2-curr" style={{ transform: `translateX(${curr * 96}px)` }}>
          <path d="M56 84V70m-6 6 6-6 6 6" />
          <text x="56" y="96">
            curr
          </text>
        </g>
      </svg>
      <ol className="d2-listing">
        {CODE.map((row, index) => (
          <li
            key={row.text + String(index)}
            data-active={index === line || undefined}
            style={{ paddingInlineStart: `${1 + row.indent * 2}ch` }}
          >
            {row.text}
          </li>
        ))}
      </ol>
    </div>
  );
};

const config: LandingConfig = {
  base: '/2',
  className: 'd2',
  heading: 'Structs.sh',
  art: <SearchWindow />,
};

const Landing = () => <LandingPage config={config} />;

export default Landing;
