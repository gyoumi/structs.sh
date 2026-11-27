import { useEffect, useState } from 'react';
import { useSnapshot } from './useVisualiser';
import styles from './HashTablePhoneBanner.module.css';

const readBanner = (): string => {
  const texts = [...document.querySelectorAll('#visualiser-canvas [data-hash-banner] text')];
  const shown = texts
    .map((node) => ({
      text: (node.textContent ?? '').trim(),
      opacity: Number(getComputedStyle(node).opacity),
    }))
    .filter((entry) => entry.text.length > 0 && entry.opacity >= 0.5);
  return shown.at(-1)?.text ?? '';
};

/** Screen-sized hash table status pill for narrow viewports where the SVG strip is scaled down. */
const HashTablePhoneBanner = () => {
  const step = useSnapshot((s) => s.step);
  const layoutVersion = useSnapshot((s) => s.layoutVersion);
  const lastRunId = useSnapshot((s) => s.lastRun?.id ?? 0);
  const [text, setText] = useState('');

  useEffect(() => {
    const sync = () => setText(readBanner());
    sync();
    let second = 0;
    const first = requestAnimationFrame(() => {
      sync();
      second = requestAnimationFrame(sync);
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [step, layoutVersion, lastRunId]);

  if (!text) return null;
  return (
    <div className={styles.banner} data-hash-phone-banner="" aria-live="polite">
      {text}
    </div>
  );
};

export default HashTablePhoneBanner;
