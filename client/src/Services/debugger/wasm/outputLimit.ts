/** The most output one run keeps. More only slows the console down. */
export const OUTPUT_LIMIT = 20_000;

/**
 * Returns a function that passes text through until OUTPUT_LIMIT characters
 * in total, then adds one note that the output was stopped, then passes
 * nothing.
 */
export const createOutputLimit = (limit = OUTPUT_LIMIT) => {
  let kept = 0;
  let full = false;

  return (text: string) => {
    if (full) return '';
    const allowed = text.slice(0, limit - kept);
    kept += allowed.length;
    if (allowed.length === text.length) return allowed;
    full = true;
    return `${allowed}\n[The program's output was stopped after ${limit.toLocaleString('en')} characters.]\n`;
  };
};
