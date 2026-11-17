#!/usr/bin/env node
// Runs the PR rules in scripts/pr-rules.mjs against a git diff.
//
//   node scripts/check-pr.mjs --base HEAD^1 --head HEAD   # CI: the PR's merge commit
//   node scripts/check-pr.mjs --local                      # your branch plus uncommitted work, vs origin/dev
//
// Labels come from the PR_LABELS env var (a JSON array of names). With --local
// there are no labels, so rules a label can waive print as notes, not failures.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { checkPr } from './pr-rules.mjs';

const WAIVABLE = new Set(['protected-paths', 'debugger-needs-test', 'large-removal']);

const { values: args } = parseArgs({
  options: {
    base: { type: 'string' },
    head: { type: 'string' },
    local: { type: 'boolean', default: false },
  },
});

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const lines = (text) => text.split('\n').filter(Boolean);
const countLines = (text) => (text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0));

const base = args.base ?? git('merge-base', 'HEAD', 'origin/dev').trim();
const head = args.local ? undefined : (args.head ?? 'HEAD');
const range = head ? [base, head] : [base];

const readAt = (rev, path) => {
  try {
    return rev ? git('show', `${rev}:${path}`) : readFileSync(path, 'utf8');
  } catch {
    return '';
  }
};

const files = lines(git('diff', '--name-status', '-M', ...range)).map((row) => {
  const [code, first, second] = row.split('\t');
  const status = code[0];
  const file = status === 'R' ? { status, path: second, oldPath: first } : { status, path: first };
  if (status === 'M') {
    file.oldLines = countLines(readAt(base, file.path));
    file.newLines = countLines(readAt(head, file.path));
  }
  return file;
});

const untracked = args.local ? lines(git('ls-files', '--others', '--exclude-standard')) : [];
for (const path of untracked) files.push({ status: 'A', path });

const addedLines = [];
let current;
let lineNo = 0;
for (const row of git('diff', '-U0', '--no-color', '-M', ...range).split('\n')) {
  if (row.startsWith('+++ ')) current = row.slice(4).replace(/^b\//, '');
  else if (row.startsWith('@@')) lineNo = Number(/\+(\d+)/.exec(row)[1]);
  else if (row.startsWith('+') && current) addedLines.push({ path: current, line: lineNo++, text: row.slice(1) });
}
for (const path of untracked) {
  if (!existsSync(path)) continue;
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((text, i) => addedLines.push({ path, line: i + 1, text }));
}

const tracked = [...lines(git('ls-files')), ...untracked];
const labels = new Set(JSON.parse(process.env.PR_LABELS || '[]'));

const findings = checkPr({ files, tracked, addedLines, labels });
const failures = args.local ? findings.filter((f) => !WAIVABLE.has(f.rule)) : findings;
const notes = findings.filter((f) => !failures.includes(f));

for (const f of failures) {
  const where = f.path ? `${f.path}${f.line ? `:${f.line}` : ''}` : '';
  if (process.env.GITHUB_ACTIONS) {
    console.log(`::error title=${f.rule}${f.path ? `,file=${f.path}` : ''}${f.line ? `,line=${f.line}` : ''}::${f.message}`);
  }
  console.log(`✗ ${f.rule}  ${where}\n    ${f.message}`);
}
for (const f of notes) console.log(`• ${f.rule} (on the PR this needs a label)  ${f.path ?? ''}`);

if (failures.length) process.exit(1);
console.log(`PR rules: ${files.length} changed files checked, no failures.`);
