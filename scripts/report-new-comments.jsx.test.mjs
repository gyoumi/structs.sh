import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// The report-new-comments CLI on an in-scope .tsx file, in a temporary git
// repo: JSX text is not code, so // and /* in it start no comment, while
// {/* ... */} and // after code are plain comments. Each head file is valid
// TSX (checked with the typescript-eslint parser when these cases were written).

const scriptPath = fileURLToPath(new URL('./report-new-comments.mjs', import.meta.url));
const TSX = 'client/src/visualiser-debugger/DevelopmentMode.tsx';

const MESSAGE =
  'Keep only API docs, licence headers and notes about outside constraints in checked source files. If this explains our own code, say it with a name, type or shape instead (see the no-comments skill).';
const warning = (path, line) => `::warning file=${path},line=${line},title=New comment::${MESSAGE}`;
const NONE = 'No new comments in checked source files.';
const some = (n) => `${n} new comment(s) in checked source files. Each needs a reviewer's OK.`;

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};
delete gitEnv.GITHUB_ACTIONS;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8' }).trim();
const lines = (rows) => `${rows.join('\n')}\n`;

function commit(root, path, content, message) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--no-verify', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

const BASE = ['export function DevelopmentMode() {', '  return null;', '}'];

/** Commits BASE then `headRows` at TSX, runs the CLI, and checks the warnings and summary. */
function expectTsx(headRows, expectedLines, what) {
  if (!existsSync(scriptPath)) assert.fail(`scripts/report-new-comments.mjs does not exist, so the CLI can't be run (looked for ${scriptPath})`);
  const repo = mkdtempSync(join(tmpdir(), 'report-new-comments-jsx-'));
  tempDirs.push(repo);
  git(repo, 'init', '-q', '-b', 'main');
  const base = commit(repo, TSX, lines(BASE), 'base');
  const head = commit(repo, TSX, lines(headRows), 'head');
  const args = [scriptPath, '--base', base, '--head', head];
  const result = spawnSync(process.execPath, args, { cwd: repo, env: gitEnv, encoding: 'utf8' });
  const stdout = result.stdout ?? '';
  const stdoutLines = stdout.split('\n').filter((l) => l.trim() !== '');
  const quoted = (text) => text.split('\n').map((l) => `    | ${l}`).join('\n');
  const headShown = headRows.map((row, i) => `    ${String(i + 1).padStart(2)}  ${row}`).join('\n');
  const context =
    `${what}\n  base ${TSX}: ${JSON.stringify(BASE.join('\\n'))}\n  head ${TSX}:\n${headShown}\n` +
    `  expected warnings on lines: ${expectedLines.length ? expectedLines.join(', ') : 'none'}\n` +
    `\`node ${args.join(' ')}\` in ${repo}\n  exit code: ${result.status}\n  stdout:\n${quoted(stdout)}\n  stderr:\n${quoted(result.stderr ?? '')}`;
  assert.equal(result.status, 0, `exit code should be 0\n${context}`);
  assert.deepStrictEqual(
    stdoutLines.filter((l) => l.startsWith('::')),
    expectedLines.map((line) => warning(TSX, line)),
    `the ::warning lines on stdout\n${context}`,
  );
  assert.equal(stdoutLines.at(-1), expectedLines.length ? some(expectedLines.length) : NONE, `the last stdout line should be the summary\n${context}`);
}

describe('CLI on an in-scope .tsx file', () => {
  it('does not report // in JSX text (<span>https://example.com</span>)', () => {
    expectTsx(
      ['export function DevelopmentMode() {', '  const node = <span>https://example.com</span>;', '  return node;', '}'],
      [],
      'line 2 "const node = <span>https://example.com</span>;" has // only inside JSX text, so it is not a comment',
    );
  });

  it('reports a // comment after JSX on the same line', () => {
    expectTsx(
      ['export function DevelopmentMode() {', '  const other = <span>hello</span>; // explanation', '  return other;', '}'],
      [2],
      'line 2 "const other = <span>hello</span>; // explanation" ends with a plain // comment after the JSX',
    );
  });

  it('reports a {/* ... */} comment inside a JSX element', () => {
    expectTsx(
      ['export function DevelopmentMode() {', '  return (', '    <div>', '      {/* jsx comment */}', '      <span>hi</span>', '    </div>', '  );', '}'],
      [4],
      'line 4 "{/* jsx comment */}" inside <div> is a plain block comment in a JSX expression container',
    );
  });

  it('does not read /* in JSX text as a block comment: the // comment on the next line is reported', () => {
    expectTsx(
      ['export function DevelopmentMode() {', '  const para = <p>a /* b</p>;', '  // after', '  return para;', '}'],
      [3],
      'line 2 "const para = <p>a /* b</p>;" has /* only inside JSX text, so it opens no block; line 3 "// after" is a plain comment',
    );
  });
});
