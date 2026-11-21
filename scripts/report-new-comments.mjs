#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { inScope, kindOf } from './check-file-sizes.mjs';
import { commentStartLines, languageOf } from './comment-scanner.mjs';
import { findTargetBranch } from './target-branch.mjs';

const MESSAGE =
  "Checkpoint 5 keeps only API docs, licence headers and notes about outside constraints in the debugger's code. If this explains our own code, say it with a name, type or shape instead (see the no-comments skill).";

const languageFor = (path) => (inScope(path) && kindOf(path) === 'source' ? languageOf(path) : undefined);

function runsOfConsecutiveLines(addedLines) {
  const runs = [];
  let previous;
  for (const added of addedLines) {
    if (previous && previous.path === added.path && previous.line + 1 === added.line) runs.at(-1).push(added);
    else runs.push([added]);
    previous = added;
  }
  return runs;
}

const copy = ({ path, line, text }) => ({ path, line, text });

/**
 * The added lines that start a plain comment in the debugger's source files:
 * not API docs and not lint or tool directives. Knowing only the added
 * lines, it scans each run of consecutive ones as a unit.
 * @param {{ path: string, line: number, text: string }[]} addedLines
 * @returns {{ path: string, line: number, text: string }[]}
 */
export function findNewComments(addedLines) {
  return runsOfConsecutiveLines(addedLines).flatMap((run) => {
    const language = languageFor(run[0].path);
    if (!language) return [];
    const starts = commentStartLines(run.map(({ text }) => text).join('\n'), language);
    return run.filter((_, index) => starts.has(index + 1)).map(copy);
  });
}

/**
 * @param {{ path: string, line: number, text: string }[]} addedLines
 * @param {(path: string) => string} contentOf the file's content after the change
 */
function findNewCommentsInFiles(addedLines, contentOf) {
  const startsByPath = new Map();
  const startsIn = (path, language) => {
    if (!startsByPath.has(path)) startsByPath.set(path, commentStartLines(contentOf(path), language));
    return startsByPath.get(path);
  };
  return addedLines
    .filter(({ path, line }) => {
      const language = languageFor(path);
      return language !== undefined && startsIn(path, language).has(line);
    })
    .map(copy);
}

const escapeData = (value) => String(value).replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
const escapeProperty = (value) => escapeData(value).replaceAll(':', '%3A').replaceAll(',', '%2C');

/** The GitHub Actions workflow command that marks this line with a warning. */
export function annotation({ path, line }) {
  return `::warning file=${escapeProperty(path)},line=${escapeProperty(line)},title=New comment::${escapeData(MESSAGE)}`;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

// Patch headers can't be made NUL-safe, so decode git's C-style quoting.
function unquote(raw) {
  if (!raw.startsWith('"')) return raw;
  const bytes = [];
  const named = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, '\\': 92 };
  const body = raw.slice(1, -1);
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      bytes.push(...Buffer.from(body[i]));
    } else if (/[0-7]/.test(body[i + 1])) {
      bytes.push(parseInt(body.slice(i + 1, i + 4), 8));
      i += 3;
    } else {
      bytes.push(named[body[++i]]);
    }
  }
  return Buffer.from(bytes).toString('utf8');
}

function addedLinesBetween(base, head) {
  const added = [];
  let path;
  let lineNo = 0;
  // "+++ " names the file only in the header before the first hunk. Inside a
  // hunk it is an added line that starts with "++".
  let inHeader = false;
  for (const row of git('diff', '-U0', '--no-color', '--no-ext-diff', '-M', base, head).split('\n')) {
    if (row.startsWith('diff --git ')) {
      inHeader = true;
      path = undefined;
    } else if (inHeader && row.startsWith('+++ ')) {
      path = unquote(row.slice(4)).replace(/^b\//, '');
    } else if (row.startsWith('@@')) {
      inHeader = false;
      lineNo = Number(/\+(\d+)/.exec(row)[1]);
    } else if (!inHeader && row.startsWith('+') && path) {
      added.push({ path, line: lineNo++, text: row.slice(1) });
    }
  }
  return added;
}

function main() {
  // pnpm passes a `--` through to the script, so drop it.
  const { values: args } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { base: { type: 'string' }, head: { type: 'string' } },
  });
  const head = args.head ?? 'HEAD';
  const base = git('merge-base', args.base ?? findTargetBranch(), head).trim();
  const comments = findNewCommentsInFiles(addedLinesBetween(base, head), (path) => git('show', `${head}:${path}`));
  for (const comment of comments) console.log(annotation(comment));
  console.log(
    comments.length === 0
      ? "No new comments in the debugger's code."
      : `${comments.length} new comment(s) in the debugger's code. Each needs a reviewer's OK.`,
  );
}

const isEntryPoint = () => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isEntryPoint()) main();
