#!/usr/bin/env node
// Checks each debugger's list in e2e/known-failures/: every entry names a
// real test and gives a reason. A test on the list that starts passing
// already fails the e2e run (see e2e/support/test.ts), so this covers the
// other ways a list can rot.

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

// Same key as testKey() in e2e/support/test.ts: describe titles and the test
// title, joined with " › ", without the file name.
const keys = new Set();
const walk = (suite, titles) => {
  for (const spec of suite.specs ?? []) keys.add([...titles, spec.title].join(' › '));
  for (const child of suite.suites ?? []) walk(child, [...titles, child.title]);
};
for (const fileSuite of report.suites) walk(fileSuite, []);

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
