import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPr } from './pr-rules.mjs';
import { pr, show } from './pr-rules-test-kit.mjs';

// large-removal: deleting a test, renaming it so its runner skips it, or
// gutting a file needs a person to add the removal-ok label.

// Compares "rule path" pairs, so a failure shows every finding checkPr returned.
const expectFindings = (files, expected, what, labels = new Set()) => {
  const result = checkPr(pr({ files, labels }));
  assert.deepEqual(
    result.map((f) => `${f.rule} ${f.path}`),
    expected,
    `${what} should give ${JSON.stringify(expected)}. Got findings: ${show(result)}`,
  );
};

describe('large-removal', () => {
  // The rows with no-test-needed are the folders checked for shrinking; the
  // label keeps instrumenter/src/lib.rs from also hitting debugger-needs-test.
  const shrunk = [
    ['client/src/visualiser-src/linked-list/controller.ts', 200, 20, []],
    ['client/src/App.tsx', 400, 10, ['no-test-needed']],
    ['e2e/support/test.ts', 400, 10, ['no-test-needed']],
    ['instrumenter/src/lib.rs', 400, 10, ['no-test-needed']],
    ['instrumenter/tests/instrument.rs', 400, 10, ['no-test-needed']],
    ['instrumenter/tests/instrument.rs', 400, 40, []],
    ['game-server/challenges/src/lib.rs', 400, 10, []],
    ['game-server/challenges/tests/quicksort.rs', 400, 40, []],
    ['scripts/pr-rules.test.mjs', 400, 10, ['no-test-needed']],
    ['scripts/pr-rules.test.mjs', 300, 20, []],
  ];
  for (const [path, oldLines, newLines, labels] of shrunk) {
    const labelled = labels.length ? ` (${labels.join(', ')})` : '';
    it(`rejects ${path} cut from ${oldLines} to ${newLines} lines${labelled}`, () => {
      const files = [{ status: 'M', path, oldLines, newLines }];
      expectFindings(files, [`large-removal ${path}`], `${path} cut from ${oldLines} to ${newLines} lines${labelled}`, new Set(labels));
    });
  }

  it('rejects an emptied file even when it was small', () => {
    const files = [{ status: 'M', path: 'e2e/support/test.ts', oldLines: 12, newLines: 0 }];
    expectFindings(files, ['large-removal e2e/support/test.ts'], 'e2e/support/test.ts emptied from 12 lines');
  });

  it('allows ordinary edits and small files', () => {
    const files = [
      { status: 'M', path: 'client/src/App.tsx', oldLines: 200, newLines: 150 },
      { status: 'M', path: 'client/src/utils/url.ts', oldLines: 20, newLines: 4 },
    ];
    expectFindings(files, [], 'client/src/App.tsx 200 to 150 lines and client/src/utils/url.ts 20 to 4 lines');
  });

  const deletedTests = [
    'e2e/tests/stepping.spec.ts',
    'client/src/Services/debugger/wasm/recording.test.ts',
    'instrumenter/tests/instrument.rs',
    'instrumenter/tests/suite/main.rs',
    'game-server/challenges/tests/quicksort.rs',
    'game-server/challenges/tests/suite/main.rs',
    'scripts/pr-rules.test.mjs',
  ];
  for (const path of deletedTests) {
    it(`rejects deleting the test ${path}`, () => {
      expectFindings([{ status: 'D', path }], [`large-removal ${path}`], `deleting ${path}`);
    });
  }

  it('reports every deleted test in a PR, not just the first', () => {
    const files = [
      { status: 'D', path: 'client/src/Services/debugger/wasm/recording.test.ts' },
      { status: 'D', path: 'instrumenter/tests/instrument.rs' },
    ];
    expectFindings(
      files,
      ['large-removal client/src/Services/debugger/wasm/recording.test.ts', 'large-removal instrumenter/tests/instrument.rs'],
      'one PR deleting client/src/Services/debugger/wasm/recording.test.ts and instrumenter/tests/instrument.rs',
    );
  });

  const skippedTests = [
    ['e2e/tests/stepping.spec.ts', 'e2e/disabled/stepping.spec.ts', 'moved out of the test folders'],
    ['client/src/Services/debugger/wasm/recording.test.ts', 'client/src/Services/debugger/wasm/recording.ts.bak', 'renamed so Vitest no longer runs it'],
    ['e2e/tests/stepping.spec.ts', 'e2e/tests/stepping.spec.ts.bak', 'renamed in its folder so Playwright skips it'],
    ['instrumenter/tests/instrument.rs', 'instrumenter/tests/instrument.rs.bak', 'renamed in its folder so cargo skips it'],
    ['game-server/challenges/tests/quicksort.rs', 'game-server/challenges/tests/quicksort.rs.bak', 'renamed in its crate folder so cargo skips it'],
    ['game-server/challenges/tests/suite/main.rs', 'game-server/challenges/tests/suite/helper.rs', 'renamed out of Cargo main.rs integration test layout'],
  ];
  for (const [oldPath, path, how] of skippedTests) {
    it(`rejects a test ${how}: ${oldPath} to ${path}`, () => {
      expectFindings([{ status: 'R', path, oldPath }], [`large-removal ${oldPath}`], `renaming ${oldPath} to ${path}`);
    });
  }

  it('reports every test renamed so its runner skips it in a PR, not just the first', () => {
    const files = [
      { status: 'R', path: 'e2e/tests/stepping.spec.ts.bak', oldPath: 'e2e/tests/stepping.spec.ts' },
      { status: 'R', path: 'instrumenter/tests/instrument.rs.bak', oldPath: 'instrumenter/tests/instrument.rs' },
    ];
    expectFindings(
      files,
      ['large-removal e2e/tests/stepping.spec.ts', 'large-removal instrumenter/tests/instrument.rs'],
      'one PR renaming e2e/tests/stepping.spec.ts and instrumenter/tests/instrument.rs to .bak',
    );
  });

  it('allows a test moved within the test folders', () => {
    const files = [{ status: 'R', path: 'e2e/tests/steps/stepping.spec.ts', oldPath: 'e2e/tests/stepping.spec.ts' }];
    expectFindings(files, [], 'renaming e2e/tests/stepping.spec.ts to e2e/tests/steps/stepping.spec.ts');
  });

  it('no longer treats a pytest file as a test', () => {
    const cases = [
      [{ status: 'D', path: 'debugger/src/debugger/test/test_x.py' }, 'deleting debugger/src/debugger/test/test_x.py'],
      [
        { status: 'R', path: 'debugger/src/debugger/test/circular.py', oldPath: 'debugger/src/debugger/test/test_circular.py' },
        'renaming debugger/src/debugger/test/test_circular.py to circular.py',
      ],
    ];
    for (const [file, what] of cases) {
      const result = checkPr(pr({ files: [file] }));
      assert.deepEqual(result, [], `${what} should not hit large-removal (pytest is gone). Got findings: ${show(result)}`);
    }
  });

  it('no longer checks files under debugger/src for shrinking', () => {
    const result = checkPr(pr({ files: [{ status: 'M', path: 'debugger/src/debugger/debugger.py', oldLines: 400, newLines: 10 }] }));
    assert.deepEqual(result, [], `debugger/src/debugger/debugger.py cut from 400 to 10 lines should not hit large-removal. Got findings: ${show(result)}`);
  });

  it('does not count a deleted test fixture as a test', () => {
    const result = checkPr(pr({ files: [{ status: 'D', path: 'instrumenter/tests/fixtures/loop.c' }] }));
    assert.deepEqual(result, [], `deleting instrumenter/tests/fixtures/loop.c should hit no rule. Got findings: ${show(result)}`);
  });

  it('is waived by the removal-ok label', () => {
    const files = [{ status: 'D', path: 'e2e/tests/stepping.spec.ts' }];
    expectFindings(files, [], 'deleting e2e/tests/stepping.spec.ts with the removal-ok label', new Set(['removal-ok']));
  });
});
