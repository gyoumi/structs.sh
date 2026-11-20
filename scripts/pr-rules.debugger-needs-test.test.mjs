import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPr } from './pr-rules.mjs';
import { DEBUGGER_NEEDS_TEST_MESSAGE, pr, rulesHit, show } from './pr-rules-test-kit.mjs';

// debugger-needs-test: a change to the debugger's source needs a test change
// in the same PR, unless a person waives it.

const debuggerChange = { status: 'M', path: 'instrumenter/src/lib.rs' };

const expectNeedsTest = (files, what, labels = new Set()) => {
  const result = checkPr(pr({ files, labels }));
  assert.deepEqual(rulesHit(result), ['debugger-needs-test'], `${what} should hit debugger-needs-test only. Got findings: ${show(result)}`);
  return result;
};

const expectClean = (files, what, labels = new Set()) => {
  const result = checkPr(pr({ files, labels }));
  assert.deepEqual(result, [], `${what} should hit no rule. Got findings: ${show(result)}`);
};

describe('debugger-needs-test', () => {
  const debuggerChanges = [
    { what: 'instrumenter/src/lib.rs changed', file: debuggerChange, debuggerPath: 'instrumenter/src/lib.rs' },
    {
      what: 'client/src/Services/debugger/wasmDebugger.ts changed',
      file: { status: 'M', path: 'client/src/Services/debugger/wasmDebugger.ts' },
      debuggerPath: 'client/src/Services/debugger/wasmDebugger.ts',
    },
    { what: 'instrumenter/src/new_pass.rs added', file: { status: 'A', path: 'instrumenter/src/new_pass.rs' }, debuggerPath: 'instrumenter/src/new_pass.rs' },
    { what: 'client/src/Services/debugger/old.ts deleted', file: { status: 'D', path: 'client/src/Services/debugger/old.ts' }, debuggerPath: 'client/src/Services/debugger/old.ts' },
    {
      what: 'client/src/Services/debugger/moved.ts renamed out of the debugger folder',
      file: { status: 'R', path: 'client/src/Services/moved.ts', oldPath: 'client/src/Services/debugger/moved.ts' },
      debuggerPath: 'client/src/Services/debugger/moved.ts',
    },
    {
      what: 'instrumenter/moved.rs renamed into instrumenter/src/',
      file: { status: 'R', path: 'instrumenter/src/moved.rs', oldPath: 'instrumenter/moved.rs' },
      debuggerPath: 'instrumenter/src/moved.rs',
    },
  ];
  for (const { what, file, debuggerPath } of debuggerChanges) {
    it(`rejects a debugger change with no test change: ${what}`, () => {
      const [finding] = expectNeedsTest([file], `${what} with no test change`);
      assert.equal(finding.path, debuggerPath, `${what}: the debugger-needs-test finding should point at the debugger file`);
      assert.equal(finding.message, DEBUGGER_NEEDS_TEST_MESSAGE, `${what}: debugger-needs-test should use the message naming Vitest and cargo tests`);
    });
  }

  const notDebuggerChanges = [
    { what: 'deleting the Vitest test client/src/Services/debugger/wasm/recording.test.ts', file: { status: 'D', path: 'client/src/Services/debugger/wasm/recording.test.ts' }, labels: ['removal-ok'] },
    { what: 'deleting the Vitest test client/src/Services/debugger/view.test.tsx', file: { status: 'D', path: 'client/src/Services/debugger/view.test.tsx' }, labels: ['removal-ok'] },
    { what: 'changing the fixture client/src/Services/debugger/wasm/fixtures/fib.json alone', file: { status: 'M', path: 'client/src/Services/debugger/wasm/fixtures/fib.json' } },
    { what: 'deleting the fixture instrumenter/src/fixtures/loop.c alone', file: { status: 'D', path: 'instrumenter/src/fixtures/loop.c' } },
    { what: 'changing client/src/Services/debugger/wasm/NOTES.md alone', file: { status: 'M', path: 'client/src/Services/debugger/wasm/NOTES.md' } },
    { what: 'changing instrumenter/src/NOTES.md alone', file: { status: 'M', path: 'instrumenter/src/NOTES.md' } },
    { what: 'changing debugger/src/serve.py, in the deleted debugger/ server, with no test change', file: { status: 'M', path: 'debugger/src/serve.py' } },
  ];
  for (const { what, file, labels = [] } of notDebuggerChanges) {
    it(`does not count it as a debugger change: ${what}`, () => {
      expectClean([file], what, new Set(labels));
    });
  }

  it('counts a fixture renamed into debugger source as a debugger change', () => {
    const cases = [
      { status: 'R', oldPath: 'client/src/Services/debugger/wasm/fixtures/helper.ts', path: 'client/src/Services/debugger/wasm/helper.ts' },
      { status: 'R', oldPath: 'instrumenter/src/fixtures/x.rs', path: 'instrumenter/src/x.rs' },
    ];
    for (const file of cases) expectNeedsTest([file], `renaming the fixture ${file.oldPath} to ${file.path} with no test change`);
  });

  it('counts a Vitest test renamed into debugger source as a debugger change', () => {
    const file = { status: 'R', oldPath: 'client/src/Services/debugger/wasm/helper.test.ts', path: 'client/src/Services/debugger/wasm/helper.ts' };
    const what = 'renaming client/src/Services/debugger/wasm/helper.test.ts to helper.ts with no test change';
    expectNeedsTest([file], `${what}, with the removal-ok label (it waives large-removal, not the test requirement),`, new Set(['removal-ok']));
    const result = checkPr(pr({ files: [file] }));
    assert.deepEqual(
      rulesHit(result).sort(),
      ['debugger-needs-test', 'large-removal'],
      `${what}, with no labels, should hit both debugger-needs-test and large-removal. Got findings: ${show(result)}`,
    );
  });

  const testChanges = [
    { what: 'e2e/tests/stepping.spec.ts changed', file: { status: 'M', path: 'e2e/tests/stepping.spec.ts' } },
    { what: 'e2e/programs/loop.c added', file: { status: 'A', path: 'e2e/programs/loop.c' } },
    { what: 'the Vitest test client/src/Services/debugger/wasm/recording.test.ts added', file: { status: 'A', path: 'client/src/Services/debugger/wasm/recording.test.ts' } },
    { what: 'the Vitest test client/src/components/Frame.test.tsx changed', file: { status: 'M', path: 'client/src/components/Frame.test.tsx' } },
    { what: 'the cargo test instrumenter/tests/instrument.rs changed', file: { status: 'M', path: 'instrumenter/tests/instrument.rs' } },
    { what: 'the cargo test fixture instrumenter/tests/fixtures/loop.wasm added', file: { status: 'A', path: 'instrumenter/tests/fixtures/loop.wasm' } },
    { what: 'a known-failures entry in e2e/known-failures/wasm.json (human-approved)', file: { status: 'M', path: 'e2e/known-failures/wasm.json' }, labels: ['human-approved'] },
    { what: 'no test change, but the no-test-needed label', labels: ['no-test-needed'] },
  ];
  for (const { what, file, labels = [] } of testChanges) {
    it(`accepts a debugger change that comes with ${what}`, () => {
      expectClean([debuggerChange, ...(file ? [file] : [])], `instrumenter/src/lib.rs changed, with ${what},`, new Set(labels));
    });
  }

  const notTestChanges = [
    { what: 'instrumenter/tests/fixtures/README.md changed (Markdown under instrumenter/tests)', file: { status: 'M', path: 'instrumenter/tests/fixtures/README.md' } },
    { what: 'instrumenter/tests/README.md changed (Markdown under instrumenter/tests)', file: { status: 'M', path: 'instrumenter/tests/README.md' } },
    { what: 'the pytest debugger/src/debugger/test/test_new.py added', file: { status: 'A', path: 'debugger/src/debugger/test/test_new.py' } },
    { what: 'e2e/README.md changed (in e2e/, but not a test)', file: { status: 'M', path: 'e2e/README.md' } },
    { what: 'the e2e test e2e/tests/stepping.spec.ts deleted (removal-ok)', file: { status: 'D', path: 'e2e/tests/stepping.spec.ts' }, labels: ['removal-ok'] },
    { what: 'the Vitest test client/src/Services/debugger/wasm/recording.test.ts deleted (removal-ok)', file: { status: 'D', path: 'client/src/Services/debugger/wasm/recording.test.ts' }, labels: ['removal-ok'] },
    { what: 'the cargo test instrumenter/tests/instrument.rs deleted (removal-ok)', file: { status: 'D', path: 'instrumenter/tests/instrument.rs' }, labels: ['removal-ok'] },
  ];
  for (const { what, file, labels = [] } of notTestChanges) {
    it(`does not count it as the test change: ${what}`, () => {
      expectNeedsTest([debuggerChange, file], `instrumenter/src/lib.rs changed, with only ${what},`, new Set(labels));
    });
  }
});
