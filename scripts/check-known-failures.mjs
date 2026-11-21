#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const listFolder = new URL('../e2e/known-failures/', import.meta.url);
const lists = readdirSync(listFolder)
  .filter((name) => name.endsWith('.json'))
  .map((name) => ({ name, entries: JSON.parse(readFileSync(new URL(name, listFolder), 'utf8')) }));

// --list only collects tests: it starts no web server and runs nothing.
const playwrightCli = createRequire(import.meta.url).resolve('@playwright/test/cli');
const report = JSON.parse(
  execFileSync(process.execPath, [playwrightCli, 'test', '-c', 'e2e', '--list', '--reporter=json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }),
);

const e2eTestKey = (titlesBelowFile) => titlesBelowFile.join(' › ');

const keys = new Set();
const addTestKeys = (suite, titlesBelowFile) => {
  for (const spec of suite.specs ?? []) keys.add(e2eTestKey([...titlesBelowFile, spec.title]));
  for (const child of suite.suites ?? []) addTestKeys(child, [...titlesBelowFile, child.title]);
};
for (const fileSuite of report.suites) addTestKeys(fileSuite, []);

const problems = [];
for (const { name, entries } of lists) {
  for (const [key, reason] of Object.entries(entries)) {
    if (!keys.has(key)) problems.push(`${name}: "${key}" does not match any e2e test. Fix the name or remove the entry.`);
    if (typeof reason !== 'string' || reason.trim().length < 20) {
      problems.push(`${name}: "${key}" needs a reason: what the user sees and why it fails.`);
    }
  }
}

for (const p of problems) console.log(`✗ known-failures/${p}`);
if (problems.length) process.exit(1);
for (const { name, entries } of lists) {
  console.log(`known-failures/${name}: ${Object.keys(entries).length} entries, all match one of ${keys.size} tests.`);
}
