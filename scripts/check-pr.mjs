#!/usr/bin/env node
// Runs the PR rules in scripts/pr-rules.mjs against a git diff.
//
//   node scripts/check-pr.mjs --base <sha> --head <sha>   # CI (.github/workflows/pr-rules.yml)
//   node scripts/check-pr.mjs --local                      # your branch plus uncommitted work, vs origin/dev
//
// It only reads the two commits with git and never runs code from them, so CI
// can run the base branch's copy of this script against an untrusted PR.
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

const scriptsOf = (text) => {
  try {
    return JSON.stringify(JSON.parse(text).scripts ?? {});
  } catch {
    return undefined; // unparseable counts as changed
  }
};

// -z gives raw paths. Without it git quotes names with non-ASCII or control
// characters, and a quoted name would slip past every path rule.
const nulList = (text) => text.split('\0').filter(Boolean);
const statusRecords = [];
for (const fields = nulList(git('diff', '-z', '--name-status', '-M', ...range)); fields.length; ) {
  const status = fields.shift()[0];
  statusRecords.push(status === 'R' || status === 'C' ? { status, oldPath: fields.shift(), path: fields.shift() } : { status, path: fields.shift() });
}

const files = statusRecords.map(({ status, path, oldPath }) => {
  const file = status === 'R' ? { status, path, oldPath } : { status: status === 'C' ? 'A' : status, path };
  if (status === 'M') {
    const before = readAt(base, file.path);
    const after = readAt(head, file.path);
    file.oldLines = countLines(before);
    file.newLines = countLines(after);
    if (file.path.endsWith('package.json')) {
      const old = scriptsOf(before);
      file.scriptsChanged = old === undefined || old !== scriptsOf(after);
    }
  }
  return file;
});

const untracked = args.local ? nulList(git('ls-files', '-z', '--others', '--exclude-standard')) : [];
for (const path of untracked) files.push({ status: 'A', path });

// Patch headers can't be made NUL-safe, so decode git's C-style quoting.
const unquote = (raw) => {
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
};

const addedLines = [];
let current;
let lineNo = 0;
for (const row of git('diff', '-U0', '--no-color', '--no-ext-diff', '-M', ...range).split('\n')) {
  if (row.startsWith('+++ ')) current = unquote(row.slice(4)).replace(/^b\//, '');
  else if (row.startsWith('@@')) lineNo = Number(/\+(\d+)/.exec(row)[1]);
  else if (row.startsWith('+') && current) addedLines.push({ path: current, line: lineNo++, text: row.slice(1) });
}
for (const path of untracked) {
  if (!existsSync(path)) continue;
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((text, i) => addedLines.push({ path, line: i + 1, text }));
}

// The head commit's files, not the checkout's: in CI the checkout is the base branch.
const tracked = head ? nulList(git('ls-tree', '-z', '-r', '--name-only', head)) : [...nulList(git('ls-files', '-z')), ...untracked];
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
