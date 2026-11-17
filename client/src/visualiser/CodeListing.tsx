import { useEffect, useRef } from 'react';
import { useSnapshot, usePrefersReducedMotion } from './useVisualiser';

/** Code that wraps only at spaces, so tokens like `node->left` never split across lines. */
export const Unbroken = ({ text }: { text: string }) => (
  <>
    {text.split(/(\s+)/).map((part, index) =>
      part.trim() ? (
        <span key={index} style={{ whiteSpace: 'nowrap' }}>
          {part}
        </span>
      ) : (
        part
      )
    )}
  </>
);

const HANG = 4;

interface CodeListingProps {
  className?: string;
  lineClassName?: string;
  numberClassName?: string;
  emptyMessage: string;
  emptyClassName?: string;
}

/** Long lines wrap at spaces only, continuing a few columns past their own indent. */

const CodeListing = ({
  className,
  lineClassName,
  numberClassName,
  emptyMessage,
  emptyClassName,
}: CodeListingProps) => {
  const code = useSnapshot((s) => s.code);
  const line = useSnapshot((s) => s.line);
  const listRef = useRef<HTMLOListElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const current = listRef.current?.querySelector<HTMLElement>('[data-current]');
    current?.scrollIntoView({ block: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
  }, [line, reducedMotion]);

  if (code.length === 0) {
    return <p className={emptyClassName}>{emptyMessage}</p>;
  }

  return (
    <ol ref={listRef} className={className} aria-label="Code for this operation">
      {code.map((text, index) => {
        const number = index + 1;
        const current = number === line;
        const shown = text.replace(/\t/g, '    ');
        const body = shown.trimStart();
        const indent = shown.length - body.length;
        return (
          <li
            key={`${number}:${text}`}
            className={lineClassName}
            data-current={current || undefined}
            aria-current={current ? 'step' : undefined}
          >
            <span className={numberClassName} aria-hidden="true">
              {number}
            </span>
            <code style={{ paddingInlineStart: `${indent + HANG}ch`, textIndent: `-${HANG}ch` }}>
              {body ? <Unbroken text={body} /> : ' '}
            </code>
          </li>
        );
      })}
    </ol>
  );
};

export default CodeListing;
