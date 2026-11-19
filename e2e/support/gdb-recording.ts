import { readFileSync } from 'node:fs';

/**
 * Recordings of the old GDB debugger stepping through e2e/programs, kept in
 * e2e/fixtures/gdb-steps/ (each file says how it was recorded), and the rules
 * for comparing the wasm debugger's stops with them.
 */

/** One stop of the GDB debugger: the highlighted line and the node values drawn, sorted. */
export type GdbStop = {
  line: number;
  nodes: string[];
  /** Set where GDB drew the wrong nodes: why, and what it should show. Its drawing isn't compared. */
  gdbFault?: string;
};

export const gdbStops = (program: string): GdbStop[] =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/gdb-steps/${program.replace(/\.c$/, '')}.json`, import.meta.url), 'utf8'),
  ).stops;

/** The program's source lines, so lines[n - 1] is line n. */
export const sourceLines = (program: string): string[] =>
  readFileSync(new URL(`../programs/${program}`, import.meta.url), 'utf8').split('\n');

/** "line N `source text`", for failure messages. */
export const describeLine = (program: string, line: number | null): string =>
  line === null ? 'no line' : `line ${line} \`${sourceLines(program)[line - 1]?.trim() ?? '?'}\``;

/**
 * Whether the line is a function's closing brace: a `}` alone at the start
 * of the line. Every program in e2e/programs is laid out so that only
 * functions' braces are.
 */
export const isFunctionEnd = (program: string, line: number): boolean =>
  sourceLines(program)[line - 1] === '}';

/** The line of main's first statement: the first non-blank line after `main(` is declared. */
export const mainFirstLine = (program: string): number => {
  const lines = sourceLines(program);
  const main = lines.findIndex((text) => /\bmain\s*\(/.test(text));
  const first = lines.findIndex((text, index) => index > main && text.trim() !== '');
  return first + 1;
};

/** Node values sorted the way the recordings sort them: numbers ascending, then "??". */
export const sortNodes = (nodes: string[]): string[] =>
  [...nodes].sort((a, b) => Number(a === '??') - Number(b === '??') || Number(a) - Number(b));

/**
 * Compares the wasm debugger's stops (lines, in order, each different from
 * the one before) with GDB's, allowing only these differences:
 *
 * - the wasm debugger stops on main's first line first, and GDB doesn't (its
 *   server runs one `next` before the first step);
 * - GDB stops on a function's closing `}` where the wasm debugger doesn't
 *   (clang's wasm line table usually has no row for it).
 *
 * Returns null when they match, or a description of the first difference.
 */
export const firstLineDifference = (program: string, wasm: number[], gdb: number[]): string | null => {
  let w = wasm[0] === mainFirstLine(program) && gdb[0] !== wasm[0] ? 1 : 0;
  let g = 0;
  while (w < wasm.length || g < gdb.length) {
    if (w < wasm.length && g < gdb.length && wasm[w] === gdb[g]) {
      w++;
      g++;
    } else if (g < gdb.length && isFunctionEnd(program, gdb[g])) {
      g++;
    } else {
      const wasmSays = w < wasm.length ? describeLine(program, wasm[w]) : 'the end of the session';
      const gdbSays = g < gdb.length ? describeLine(program, gdb[g]) : 'the end of the session';
      return (
        `wasm stop ${w + 1} is ${wasmSays}, where GDB's stop ${g + 1} is ${gdbSays}` +
        ` (after ${w} matching wasm stops)`
      );
    }
  }
  return null;
};

/**
 * Pairs each wasm stop with the GDB stop on the same line, keeping both in
 * order and pairing as many as possible (a longest common subsequence). Stops
 * only one debugger makes are left unpaired; the line comparison reports them.
 * Returns [wasm index, GDB index] pairs.
 */
export const pairStops = (wasm: number[], gdb: number[]): [number, number][] => {
  const longest = Array.from({ length: wasm.length + 1 }, () => new Array<number>(gdb.length + 1).fill(0));
  for (let w = wasm.length - 1; w >= 0; w--) {
    for (let g = gdb.length - 1; g >= 0; g--) {
      longest[w][g] =
        wasm[w] === gdb[g] ? longest[w + 1][g + 1] + 1 : Math.max(longest[w + 1][g], longest[w][g + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let w = 0;
  let g = 0;
  while (w < wasm.length && g < gdb.length) {
    if (wasm[w] === gdb[g]) {
      pairs.push([w, g]);
      w++;
      g++;
    } else if (longest[w + 1][g] >= longest[w][g + 1]) {
      w++;
    } else {
      g++;
    }
  }
  return pairs;
};
