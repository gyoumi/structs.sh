#!/usr/bin/env node
// Fast checks for what this branch changed, before you push.
//
//   pnpm check:changed
//
// Compares your branch and uncommitted work with origin/dev and runs only the
// checks for the areas you touched. CI still runs everything, including the
// client build and the e2e suite. This is the quick local pass.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = (dir, name) => join(root, dir, 'node_modules', '.bin', name);
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const onPath = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;

const base = git('merge-base', 'HEAD', 'origin/dev').trim();
// Deleted files still decide which areas to check (a deletion can break
// imports elsewhere), but only files that still exist are passed to linters.
const changed = [
  ...git('diff', '--name-only', base).split('\n'),
  ...git('ls-files', '--others', '--exclude-standard').split('\n'),
].filter(Boolean);
const present = (files) => files.filter((p) => existsSync(join(root, p)));

const under = (prefix) => changed.filter((p) => p.startsWith(prefix));
const client = under('client/');
const e2e = under('e2e/');
const debuggerFiles = under('debugger/');
const scripts = under('scripts/');
const lintable = (files, prefix) => present(files).filter((p) => /\.(ts|tsx)$/.test(p)).map((p) => p.slice(prefix.length));
const prose = present(changed).filter((p) => p.endsWith('.md') && (p.startsWith('docs/') || p.endsWith('README.md')));

const checks = [];
const add = (name, cmd, args, cwd = root) => checks.push({ name, cmd, args, cwd });
const skipped = [];

add('PR rules', process.execPath, [join(root, 'scripts/check-pr.mjs'), '--local']);
if (scripts.length) {
  const tests = readdirSync(join(root, 'scripts')).filter((f) => f.endsWith('.test.mjs'));
  add('script tests', process.execPath, ['--test', ...tests.map((f) => join(root, 'scripts', f))]);
}

if (client.length) {
  add('client: tsc', bin('client', 'tsc'), [], join(root, 'client'));
  // A config or dependency change can affect every file, so lint them all.
  const onlySource = client.every((p) => p.startsWith('client/src/') && existsSync(join(root, p)));
  const files = onlySource ? lintable(client, 'client/') : ['./src/**/*.{tsx,ts}'];
  if (files.length) add('client: eslint', bin('client', 'eslint'), files, join(root, 'client'));
}
if (e2e.length || client.length) add('e2e: tsc', bin('.', 'tsc'), ['-p', 'e2e']);
if (e2e.length) {
  const files = present(e2e).filter((p) => p.endsWith('.ts'));
  if (files.length) add('e2e: eslint', bin('.', 'eslint'), files);
  add('e2e: known failures', process.execPath, [join(root, 'scripts/check-known-failures.mjs')]);
}
if (client.length || e2e.length || scripts.length) {
  add('knip', bin('.', 'knip'), ['--no-progress', '--include', 'files,unlisted,unresolved,binaries']);
}
if (debuggerFiles.length) {
  if (onPath('uv')) {
    add('debugger: ruff', 'uv', ['run', 'ruff', 'check', 'src'], join(root, 'debugger'));
    add('debugger: mypy', 'uv', ['run', 'mypy', 'src/'], join(root, 'debugger'));
  } else skipped.push('debugger: ruff and mypy (uv is not installed)');
}
if (prose.length) {
  if (onPath('vale')) add('docs: vale', 'vale', prose);
  else skipped.push('docs: vale (vale is not installed; brew install vale)');
}

console.log(`${changed.length} changed files since ${base.slice(0, 8)} (origin/dev)\n`);
const failed = [];
for (const { name, cmd, args, cwd } of checks) {
  if (cmd.includes('node_modules') && !existsSync(cmd)) {
    skipped.push(`${name} (run pnpm install first)`);
    continue;
  }
  console.log(`▶ ${name}`);
  const { status } = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  if (status !== 0) failed.push(name);
}

console.log('');
for (const s of skipped) console.log(`- skipped ${s}`);
if (failed.length) {
  console.log(`✗ failed: ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`✓ ${checks.length - skipped.filter((s) => s.includes('pnpm install')).length} checks passed. CI also runs the client build and the e2e suite.`);
