#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { findTargetBranch } from './target-branch.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const bin = (dir, name) => join(root, dir, 'node_modules', '.bin', name);
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' });
const onPath = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0;

// pnpm passes a `--` through to the script, so drop it.
const { values: args } = parseArgs({
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: { base: { type: 'string' } },
});
const target = findTargetBranch(args.base);
const base = git('merge-base', 'HEAD', target).trim();
// -z gives raw paths; git would otherwise quote names like client/src/é.ts.
// --no-renames lists both sides of a move, so moving a file out of an area
// still checks that area.
const changed = [
  ...git('diff', '-z', '--name-only', '--no-renames', base).split('\0'),
  ...git('ls-files', '-z', '--others', '--exclude-standard').split('\0'),
].filter(Boolean);
const present = (files) => files.filter((p) => existsSync(join(root, p)));

const under = (prefix) => changed.filter((p) => p.startsWith(prefix));
const client = under('client/');
const e2e = under('e2e/');
const instrumenter = changed.filter((p) => p.startsWith('instrumenter/') || p === 'rust-toolchain.toml');
const scripts = under('scripts/');
const lintable = (files, prefix) => present(files).filter((p) => /\.(ts|tsx)$/.test(p)).map((p) => p.slice(prefix.length));

const dependencies = changed.some((p) => ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(p));
const e2eLintConfig = changed.includes('eslint.config.mjs');
const knipConfig = changed.includes('knip.jsonc');
const valeConfig = changed.some((p) => p === '.vale.ini' || p.startsWith('.vale/'));

const checkClient = client.length > 0 || dependencies;
const checkE2e = e2e.length > 0 || dependencies || e2eLintConfig;
const ALL_PROSE = ['docs/docs', 'README.md', 'client/README.md', 'e2e/README.md'];
const prose = valeConfig ? ALL_PROSE : present(changed).filter((p) => p.endsWith('.md') && (p.startsWith('docs/') || p.endsWith('README.md')));

const checks = [];
const add = (name, cmd, args, cwd = root) => checks.push({ name, cmd, args, cwd });
const skipped = [];

add('PR rules', process.execPath, [join(root, 'scripts/check-pr.mjs'), '--local', '--base', base]);
if (scripts.length) {
  const tests = readdirSync(join(root, 'scripts')).filter((f) => f.endsWith('.test.mjs'));
  add('script tests', process.execPath, ['--test', ...tests.map((f) => join(root, 'scripts', f))]);
}

if (checkClient) {
  add('client: tsc', bin('client', 'tsc'), [], join(root, 'client'));
  const onlySource = !dependencies && client.every((p) => p.startsWith('client/src/') && existsSync(join(root, p)));
  const files = onlySource ? lintable(client, 'client/') : ['./src/**/*.{tsx,ts}'];
  if (files.length) add('client: eslint', bin('client', 'eslint'), files, join(root, 'client'));
}
if (checkE2e || checkClient) add('e2e: tsc', bin('.', 'tsc'), ['-p', 'e2e']);
if (checkE2e) {
  const onlyTests = !dependencies && !e2eLintConfig && e2e.every((p) => p.endsWith('.ts') && existsSync(join(root, p)));
  const files = onlyTests ? present(e2e) : ['e2e'];
  if (files.length) add('e2e: eslint', bin('.', 'eslint'), files);
  add('e2e: known failures', process.execPath, [join(root, 'scripts/check-known-failures.mjs')]);
}
if (checkClient || checkE2e || scripts.length || knipConfig) {
  add('knip', bin('.', 'knip'), ['--no-progress', '--include', 'files,unlisted,unresolved,binaries']);
}
const cargo = onPath('cargo');
if (instrumenter.length) {
  if (cargo) {
    const cwd = join(root, 'instrumenter');
    add('instrumenter: fmt', 'cargo', ['fmt', '--check'], cwd);
    add('instrumenter: clippy', 'cargo', ['clippy', '--all-targets', '--', '-D', 'warnings'], cwd);
    add('instrumenter: tests', 'cargo', ['test'], cwd);
  } else skipped.push('instrumenter: fmt, clippy and tests (cargo is not installed)');
}
if (checkClient || instrumenter.length) {
  const built = existsSync(join(root, 'client/src/Services/debugger/wasm/generated/instrumenter.wasm'));
  const needsBuild = instrumenter.length > 0 || !built;
  if (needsBuild && cargo) {
    const { scripts: rootScripts } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    add('instrumenter: build', 'sh', ['-c', rootScripts.instrumenter]);
  }
  if (needsBuild && !cargo && !built) {
    skipped.push('client: unit tests (they need the instrumenter built, and cargo is not installed)');
  } else {
    if (needsBuild && !cargo) skipped.push('instrumenter: build (cargo is not installed; the unit tests use the old build)');
    add('client: unit tests', bin('client', 'vitest'), ['run'], join(root, 'client'));
  }
}
if (prose.length) {
  if (onPath('vale')) add('docs: vale', 'vale', prose);
  else skipped.push('docs: vale (vale is not installed; brew install vale)');
}

console.log(`${changed.length} changed files since ${base.slice(0, 8)} (${target})\n`);
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
