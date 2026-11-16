import type { FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter';

type Tally = { working: number; knownFailing: number; broken: string[]; nowFixed: string[] };

/**
 * Prints a per-feature summary after the run, e.g.
 *
 *   compiling                  3/3 working
 *   stepping                   4/6 working  (2 on the known-failures list)
 *
 * A feature is the top-level test.describe() name.
 */
export default class ProgressReporter implements Reporter {
  private suite?: Suite;

  onBegin(_config: unknown, suite: Suite) {
    this.suite = suite;
  }

  onEnd(_result: FullResult) {
    if (!this.suite) return;
    const features = new Map<string, Tally>();

    for (const test of this.suite.allTests()) {
      const feature = featureOf(test);
      const tally = features.get(feature) ?? { working: 0, knownFailing: 0, broken: [], nowFixed: [] };
      features.set(feature, tally);

      const status = test.results.at(-1)?.status;
      const expectedToFail = test.expectedStatus === 'failed';
      if (status === 'skipped' || status === undefined) continue;

      if (expectedToFail && status === 'passed') tally.nowFixed.push(test.title);
      else if (expectedToFail) tally.knownFailing++;
      else if (status === 'passed') tally.working++;
      else tally.broken.push(test.title);
    }

    let working = 0;
    let total = 0;
    const width = Math.max(...[...features.keys()].map((f) => f.length)) + 2;
    const lines = ['', 'Feature progress', ''];

    for (const [feature, t] of [...features].sort(([a], [b]) => a.localeCompare(b))) {
      const featureTotal = t.working + t.knownFailing + t.broken.length + t.nowFixed.length;
      const notes = [
        t.knownFailing && `${t.knownFailing} on the known-failures list`,
        t.broken.length && `${t.broken.length} broken`,
        t.nowFixed.length && `${t.nowFixed.length} now passing, remove from known-failures.json`,
      ].filter(Boolean);

      lines.push(
        `  ${feature.padEnd(width)}${t.working}/${featureTotal} working` +
          (notes.length ? `  (${notes.join(', ')})` : ''),
      );
      for (const title of t.broken) lines.push(`      ✗ ${title}`);
      for (const title of t.nowFixed) lines.push(`      ✓ ${title}  ← now passing`);

      working += t.working;
      total += featureTotal;
    }

    lines.push('', `  ${working}/${total} behaviours working`, '');
    console.log(lines.join('\n'));
  }

  printsToStdio() {
    return false;
  }
}

function featureOf(test: TestCase): string {
  // Walk up to the suite directly under the file.
  let suite: Suite | undefined = test.parent;
  while (suite?.parent && suite.parent.type !== 'file') suite = suite.parent;
  return suite && suite.type === 'describe' ? suite.title : '(no feature)';
}
