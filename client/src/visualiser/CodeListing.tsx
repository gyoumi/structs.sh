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

const HANGING_INDENT_CH = 4;

const scrollParent = (element: HTMLElement): HTMLElement | null => {
  for (
    let node = element.parentElement;
    node && node !== document.body;
    node = node.parentElement
  ) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
};

interface CodeListingProps {
  className?: string;
  lineClassName?: string;
  numberClassName?: string;
  emptyMessage: string;
  emptyClassName?: string;
}

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
    // scrollIntoView would also scroll the page, moving the drawing away on narrow screens.
    const current = listRef.current?.querySelector<HTMLElement>('[data-current]');
    const scroller = current && scrollParent(current);
    if (!current || !scroller) return;
    const item = current.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    const offset = Math.min(0, item.top - box.top) || Math.max(0, item.bottom - box.bottom);
    if (offset) scroller.scrollBy({ top: offset, behavior: reducedMotion ? 'auto' : 'smooth' });
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
            <code
              style={{
                paddingInlineStart: `${indent + HANGING_INDENT_CH}ch`,
                textIndent: `-${HANGING_INDENT_CH}ch`,
              }}
            >
              {body ? <Unbroken text={body} /> : ' '}
            </code>
          </li>
        );
      })}
    </ol>
  );
};

export default CodeListing;
