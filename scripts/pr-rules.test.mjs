import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPr } from './pr-rules.mjs';

const pr = (overrides = {}) => ({
  files: [],
  tracked: [],
  addedLines: [],
  labels: new Set(),
  ...overrides,
});
const rulesHit = (result) => result.map((f) => f.rule);
// The findings as text, so a failed assertion shows what checkPr returned.
const show = (result) => JSON.stringify(result.map(({ rule, path }) => ({ rule, path })));

const DEBUGGER_NEEDS_TEST_MESSAGE =
  'Debugger changes need an e2e test, a Vitest or cargo test, or a known-failures entry. A person can add the "no-test-needed" label to waive this.';
const PROTECTED_PATHS_MESSAGE =
  'Changes to CI, lint config, the package.json scripts CI runs, agent config or known failures need a person to add the "human-approved" label.';

describe('forbidden-files', () => {
  it('rejects lockfiles from other package managers anywhere in the repo', () => {
    const result = checkPr(pr({ tracked: ['client/package-lock.json', 'yarn.lock', 'e2e/bun.lock'] }));
    assert.equal(result.filter((f) => f.rule === 'forbidden-files').length, 3);
  });

  it('rejects .env files and TypeScript build caches, but allows .env.example', () => {
    const result = checkPr(pr({ tracked: ['debugger/.env', 'client/.env.local', 'client/tsconfig.tsbuildinfo', 'client/.env.example'] }));
    assert.deepEqual(
      result.map((f) => f.path),
      ['debugger/.env', 'client/.env.local', 'client/tsconfig.tsbuildinfo'],
    );
  });

  it('rejects new screenshots outside the image folders', () => {
    const result = checkPr(
      pr({
        files: [
          { status: 'A', path: 'screenshot.png' },
          { status: 'A', path: 'e2e/step.png' },
          { status: 'A', path: 'client/public/icon.png' },
          { status: 'A', path: 'client/src/assets/img/tree.png' },
          { status: 'A', path: 'docs/docs/images/new.png' },
        ],
      }),
    );
    assert.deepEqual(
      result.map((f) => f.path),
      ['screenshot.png', 'e2e/step.png'],
    );
  });

  it('leaves a clean repo alone', () => {
    assert.deepEqual(checkPr(pr({ tracked: ['pnpm-lock.yaml', 'debugger/uv.lock', 'client/.env.example'] })), []);
  });
});

describe('debug-tags', () => {
  it('rejects temporary [DEBUG-xxxx] lines added to product code', () => {
    const result = checkPr(
      pr({
        files: [{ status: 'M', path: 'client/src/App.tsx' }],
        addedLines: [{ path: 'client/src/App.tsx', line: 12, text: "console.log('[DEBUG-a1b2] state', s);" }],
      }),
    );
    assert.deepEqual(rulesHit(result), ['debug-tags']);
  });

  it('rejects the tag in e2e and instrumenter code', () => {
    const addedLines = [
      { path: 'e2e/support/debugger-page.ts', line: 3, text: "console.log('[DEBUG-c3d4]');" },
      { path: 'instrumenter/src/lib.rs', line: 8, text: 'eprintln!("[DEBUG-e5f6] {x}");' },
    ];
    const result = checkPr(pr({ addedLines }));
    assert.deepEqual(
      result.map((f) => `${f.rule} ${f.path}`),
      ['debug-tags e2e/support/debugger-page.ts', 'debug-tags instrumenter/src/lib.rs'],
      `[DEBUG- lines added in e2e/support/debugger-page.ts and instrumenter/src/lib.rs should each hit debug-tags. Got findings: ${show(result)}`,
    );
  });

  it('ignores the tag outside client, e2e and instrumenter', () => {
    const result = checkPr(pr({ addedLines: [{ path: 'scripts/pr-rules.mjs', line: 1, text: '[DEBUG-' }] }));
    assert.deepEqual(result, [], `a [DEBUG- line in scripts/pr-rules.mjs should not hit any rule. Got findings: ${show(result)}`);
  });

  it('no longer treats the deleted debugger/ server as product code', () => {
    const result = checkPr(pr({ addedLines: [{ path: 'debugger/src/serve.py', line: 4, text: "print('[DEBUG-a1b2]')" }] }));
    assert.deepEqual(result, [], `a [DEBUG- line in debugger/src/serve.py should not hit debug-tags any more. Got findings: ${show(result)}`);
  });
});

describe('agent-config-alone', () => {
  it('rejects a PR that mixes .claude changes with product changes', () => {
    const result = checkPr(
      pr({
        files: [
          { status: 'M', path: '.claude/skills/develop/SKILL.md' },
          { status: 'M', path: 'client/src/App.tsx' },
        ],
        labels: new Set(['human-approved']),
      }),
    );
    assert.deepEqual(rulesHit(result), ['agent-config-alone']);
  });

  it('allows a PR that only changes agent config', () => {
    const result = checkPr(
      pr({
        files: [
          { status: 'D', path: '.claude/skills/git-clean-commit/SKILL.md' },
          { status: 'M', path: 'skills-lock.json' },
        ],
        labels: new Set(['human-approved']),
      }),
    );
    assert.deepEqual(result, []);
  });
});

describe('debugger-needs-test', () => {
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

  it('rejects an instrumenter change with no test change, with the new message', () => {
    const [finding] = expectNeedsTest([debuggerChange], 'instrumenter/src/lib.rs changed with no test change');
    assert.equal(finding.path, 'instrumenter/src/lib.rs', 'the debugger-needs-test finding should point at instrumenter/src/lib.rs');
    assert.equal(finding.message, DEBUGGER_NEEDS_TEST_MESSAGE, 'debugger-needs-test should use the new message naming Vitest and cargo tests');
  });

  it('rejects a change to the client debugger code with no test change', () => {
    const [finding] = expectNeedsTest(
      [{ status: 'M', path: 'client/src/Services/debugger/wasmDebugger.ts' }],
      'client/src/Services/debugger/wasmDebugger.ts changed with no test change',
    );
    assert.equal(finding.path, 'client/src/Services/debugger/wasmDebugger.ts', 'the finding should point at the changed client debugger file');
  });

  it('rejects added, deleted and renamed debugger files, by old or new path', () => {
    const cases = [
      [{ status: 'A', path: 'instrumenter/src/new_pass.rs' }, 'instrumenter/src/new_pass.rs added'],
      [{ status: 'D', path: 'client/src/Services/debugger/old.ts' }, 'client/src/Services/debugger/old.ts deleted'],
      [
        { status: 'R', path: 'client/src/Services/moved.ts', oldPath: 'client/src/Services/debugger/moved.ts' },
        'client/src/Services/debugger/moved.ts renamed out of the debugger folder',
      ],
      [
        { status: 'R', path: 'instrumenter/src/moved.rs', oldPath: 'instrumenter/moved.rs' },
        'instrumenter/moved.rs renamed into instrumenter/src/',
      ],
    ];
    for (const [file, what] of cases) expectNeedsTest([file], `${what} with no test change`);
  });

  it('does not count a Vitest test or a fixture as a debugger change', () => {
    const removalOk = new Set(['removal-ok']);
    expectClean([{ status: 'D', path: 'client/src/Services/debugger/wasm/recording.test.ts' }], 'deleting the Vitest test client/src/Services/debugger/wasm/recording.test.ts', removalOk);
    expectClean([{ status: 'D', path: 'client/src/Services/debugger/view.test.tsx' }], 'deleting the Vitest test client/src/Services/debugger/view.test.tsx', removalOk);
    expectClean([{ status: 'M', path: 'client/src/Services/debugger/wasm/fixtures/fib.json' }], 'changing the fixture client/src/Services/debugger/wasm/fixtures/fib.json alone');
    expectClean([{ status: 'D', path: 'instrumenter/src/fixtures/loop.c' }], 'deleting the fixture instrumenter/src/fixtures/loop.c alone');
  });

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

  it('does not count a non-code file in the debugger folders as a debugger change', () => {
    expectClean([{ status: 'M', path: 'client/src/Services/debugger/wasm/NOTES.md' }], 'changing client/src/Services/debugger/wasm/NOTES.md alone');
    expectClean([{ status: 'M', path: 'instrumenter/src/NOTES.md' }], 'changing instrumenter/src/NOTES.md alone');
  });

  it('no longer fires for the deleted debugger/ server', () => {
    expectClean([{ status: 'M', path: 'debugger/src/serve.py' }], 'debugger/src/serve.py changed with no test change');
  });

  it('accepts a debugger change that comes with an e2e test or program', () => {
    expectClean([debuggerChange, { status: 'M', path: 'e2e/tests/stepping.spec.ts' }], 'instrumenter/src/lib.rs with e2e/tests/stepping.spec.ts changed');
    expectClean([debuggerChange, { status: 'A', path: 'e2e/programs/loop.c' }], 'instrumenter/src/lib.rs with e2e/programs/loop.c added');
  });

  it('accepts a debugger change that comes with a Vitest test', () => {
    expectClean(
      [debuggerChange, { status: 'A', path: 'client/src/Services/debugger/wasm/recording.test.ts' }],
      'instrumenter/src/lib.rs with client/src/Services/debugger/wasm/recording.test.ts added',
    );
    expectClean(
      [{ status: 'M', path: 'client/src/Services/debugger/wasmDebugger.ts' }, { status: 'M', path: 'client/src/components/Frame.test.tsx' }],
      'client/src/Services/debugger/wasmDebugger.ts with client/src/components/Frame.test.tsx changed',
    );
  });

  it('accepts a debugger change that comes with a cargo test or a cargo test fixture', () => {
    expectClean([debuggerChange, { status: 'M', path: 'instrumenter/tests/instrument.rs' }], 'instrumenter/src/lib.rs with instrumenter/tests/instrument.rs changed');
    expectClean([debuggerChange, { status: 'A', path: 'instrumenter/tests/fixtures/loop.wasm' }], 'instrumenter/src/lib.rs with instrumenter/tests/fixtures/loop.wasm added');
  });

  it('does not count Markdown under instrumenter/tests as a test change', () => {
    for (const path of ['instrumenter/tests/fixtures/README.md', 'instrumenter/tests/README.md']) {
      expectNeedsTest([debuggerChange, { status: 'M', path }], `instrumenter/src/lib.rs with only ${path} changed`);
    }
  });

  it('accepts a known-failures entry as the test change', () => {
    const files = [debuggerChange, { status: 'M', path: 'e2e/known-failures/wasm.json' }];
    expectClean(files, 'instrumenter/src/lib.rs with e2e/known-failures/wasm.json changed (human-approved)', new Set(['human-approved']));
  });

  it('no longer counts a pytest as the test change', () => {
    const files = [debuggerChange, { status: 'A', path: 'debugger/src/debugger/test/test_new.py' }];
    expectNeedsTest(files, 'instrumenter/src/lib.rs with only debugger/src/debugger/test/test_new.py added');
  });

  it('does not count an e2e change that is not a test', () => {
    expectNeedsTest([debuggerChange, { status: 'M', path: 'e2e/README.md' }], 'instrumenter/src/lib.rs with only e2e/README.md changed');
  });

  it('does not count a deleted test', () => {
    const removalOk = new Set(['removal-ok']);
    for (const path of ['e2e/tests/stepping.spec.ts', 'client/src/Services/debugger/wasm/recording.test.ts', 'instrumenter/tests/instrument.rs']) {
      expectNeedsTest([debuggerChange, { status: 'D', path }], `instrumenter/src/lib.rs with ${path} deleted (removal-ok)`, removalOk);
    }
  });

  it('is waived by the no-test-needed label', () => {
    expectClean([debuggerChange], 'instrumenter/src/lib.rs with the no-test-needed label', new Set(['no-test-needed']));
  });
});

describe('large-removal', () => {
  // Compares "rule path" pairs, so a failure shows every finding checkPr returned.
  const expectFindings = (files, expected, what, labels = new Set()) => {
    const result = checkPr(pr({ files, labels }));
    assert.deepEqual(
      result.map((f) => `${f.rule} ${f.path}`),
      expected,
      `${what} should give ${JSON.stringify(expected)}. Got findings: ${show(result)}`,
    );
  };

  it('rejects a source file cut to a fraction of its size', () => {
    const files = [{ status: 'M', path: 'client/src/visualiser-src/linked-list/controller.ts', oldLines: 200, newLines: 20 }];
    expectFindings(files, ['large-removal client/src/visualiser-src/linked-list/controller.ts'], 'client/src/visualiser-src/linked-list/controller.ts cut from 200 to 20 lines');
  });

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

  it('rejects deleted test files', () => {
    const files = [{ status: 'D', path: 'e2e/tests/stepping.spec.ts' }];
    expectFindings(files, ['large-removal e2e/tests/stepping.spec.ts'], 'deleting e2e/tests/stepping.spec.ts');
  });

  it('rejects a test moved out of the test folders', () => {
    const files = [{ status: 'R', path: 'e2e/disabled/stepping.spec.ts', oldPath: 'e2e/tests/stepping.spec.ts' }];
    expectFindings(files, ['large-removal e2e/tests/stepping.spec.ts'], 'renaming e2e/tests/stepping.spec.ts to e2e/disabled/stepping.spec.ts');
  });

  it('allows a test moved within the test folders', () => {
    const files = [{ status: 'R', path: 'e2e/tests/steps/stepping.spec.ts', oldPath: 'e2e/tests/stepping.spec.ts' }];
    expectFindings(files, [], 'renaming e2e/tests/stepping.spec.ts to e2e/tests/steps/stepping.spec.ts');
  });

  it('rejects deleted Vitest and instrumenter tests', () => {
    const files = [
      { status: 'D', path: 'client/src/Services/debugger/wasm/recording.test.ts' },
      { status: 'D', path: 'instrumenter/tests/instrument.rs' },
    ];
    expectFindings(
      files,
      ['large-removal client/src/Services/debugger/wasm/recording.test.ts', 'large-removal instrumenter/tests/instrument.rs'],
      'deleting client/src/Services/debugger/wasm/recording.test.ts and instrumenter/tests/instrument.rs',
    );
  });

  it('rejects a Vitest test renamed so it no longer runs', () => {
    const files = [
      {
        status: 'R',
        path: 'client/src/Services/debugger/wasm/recording.ts.bak',
        oldPath: 'client/src/Services/debugger/wasm/recording.test.ts',
      },
    ];
    expectFindings(
      files,
      ['large-removal client/src/Services/debugger/wasm/recording.test.ts'],
      'renaming client/src/Services/debugger/wasm/recording.test.ts to recording.ts.bak (a test rename, not a debugger change)',
    );
  });

  it('rejects a test renamed in its folder so its runner skips it', () => {
    const files = [
      { status: 'R', path: 'e2e/tests/stepping.spec.ts.bak', oldPath: 'e2e/tests/stepping.spec.ts' },
      { status: 'R', path: 'instrumenter/tests/instrument.rs.bak', oldPath: 'instrumenter/tests/instrument.rs' },
    ];
    expectFindings(
      files,
      ['large-removal e2e/tests/stepping.spec.ts', 'large-removal instrumenter/tests/instrument.rs'],
      'renaming e2e/tests/stepping.spec.ts and instrumenter/tests/instrument.rs to .bak',
    );
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

  it('still checks client/src, e2e, the instrumenter and the rules tests for shrinking', () => {
    const paths = ['client/src/App.tsx', 'e2e/support/test.ts', 'instrumenter/src/lib.rs', 'instrumenter/tests/instrument.rs', 'scripts/pr-rules.test.mjs'];
    for (const path of paths) {
      const result = checkPr(pr({ files: [{ status: 'M', path, oldLines: 400, newLines: 10 }], labels: new Set(['no-test-needed']) }));
      assert.deepEqual(rulesHit(result), ['large-removal'], `${path} cut from 400 to 10 lines should hit large-removal. Got findings: ${show(result)}`);
    }
  });

  it('rejects deleting the tests of these rules', () => {
    const files = [{ status: 'D', path: 'scripts/pr-rules.test.mjs' }];
    expectFindings(files, ['large-removal scripts/pr-rules.test.mjs'], 'deleting scripts/pr-rules.test.mjs');
  });

  it('rejects a test of these rules cut to a fraction of its size', () => {
    const files = [{ status: 'M', path: 'scripts/pr-rules.test.mjs', oldLines: 300, newLines: 20 }];
    expectFindings(files, ['large-removal scripts/pr-rules.test.mjs'], 'scripts/pr-rules.test.mjs cut from 300 to 20 lines');
  });

  it('does not count a deleted test fixture as a test', () => {
    const files = [{ status: 'D', path: 'instrumenter/tests/fixtures/loop.c' }];
    const result = checkPr(pr({ files }));
    assert.deepEqual(result, [], `deleting instrumenter/tests/fixtures/loop.c should hit no rule. Got findings: ${show(result)}`);
  });

  it('rejects an instrumenter test file cut to a fraction of its size', () => {
    const files = [{ status: 'M', path: 'instrumenter/tests/instrument.rs', oldLines: 400, newLines: 40 }];
    expectFindings(files, ['large-removal instrumenter/tests/instrument.rs'], 'instrumenter/tests/instrument.rs cut from 400 to 40 lines');
  });

  it('is waived by the removal-ok label', () => {
    const files = [{ status: 'D', path: 'e2e/tests/stepping.spec.ts' }];
    expectFindings(files, [], 'deleting e2e/tests/stepping.spec.ts with the removal-ok label', new Set(['removal-ok']));
  });
});

describe('protected-paths', () => {
  it('rejects changes to CI, lint config and the known-failures list without human approval', () => {
    const files = [
      { status: 'M', path: '.github/workflows/e2e.yml' },
      { status: 'M', path: 'client/eslint.config.mjs' },
      { status: 'M', path: 'e2e/known-failures/wasm.json' },
    ];
    const result = checkPr(pr({ files }));
    assert.deepEqual(
      result.map((f) => `${f.rule} ${f.path}`),
      ['protected-paths .github/workflows/e2e.yml', 'protected-paths client/eslint.config.mjs', 'protected-paths e2e/known-failures/wasm.json'],
      `each of the CI, lint config and known-failures changes should hit protected-paths. Got findings: ${show(result)}`,
    );
    for (const finding of result) {
      assert.equal(finding.message, PROTECTED_PATHS_MESSAGE, `protected-paths for ${finding.path} should use the new message, which no longer mentions the sandbox`);
    }
  });

  it('no longer protects the deleted GDB server files', () => {
    const paths = [
      'debugger/pyproject.toml',
      'debugger/nsjail_gdb.cfg',
      'debugger/Dockerfile.prod',
      'debugger/src/debugger/base_debugger.py',
      'debugger/src/debugger/c_compile.py',
    ];
    for (const path of paths) {
      const result = checkPr(pr({ files: [{ status: 'D', path }] }));
      assert.deepEqual(result, [], `deleting ${path} should hit no rule. Got findings: ${show(result)}`);
    }
  });

  it('protects the Vitest config, which picks the unit tests that run', () => {
    const files = [{ status: 'M', path: 'client/vitest.config.ts' }];
    assert.deepEqual(rulesHit(checkPr(pr({ files }))), ['protected-paths']);
  });

  it('protects Cargo.toml settings that turn the instrumenter tests off, not dependency bumps', () => {
    const files = [{ status: 'M', path: 'instrumenter/Cargo.toml' }];
    const turnedOff = [{ path: 'instrumenter/Cargo.toml', line: 5, text: 'autotests = false' }];
    const bumped = [{ path: 'instrumenter/Cargo.toml', line: 9, text: 'walrus = "0.24"' }];
    assert.deepEqual(rulesHit(checkPr(pr({ files, addedLines: turnedOff }))), ['protected-paths']);
    assert.deepEqual(checkPr(pr({ files, addedLines: bumped })), []);
  });

  it('protects other ways cargo can skip the instrumenter tests', () => {
    const files = [
      { status: 'M', path: 'instrumenter/Cargo.toml' },
      { status: 'A', path: 'instrumenter/.cargo/config.toml' },
    ];
    const gated = [{ path: 'instrumenter/Cargo.toml', line: 7, text: 'required-features = ["slow"]' }];
    assert.equal(checkPr(pr({ files, addedLines: gated })).filter((f) => f.rule === 'protected-paths').length, 2);
  });

  it('protects test settings written any way TOML allows, or a test pointed at another file', () => {
    const files = [{ status: 'M', path: 'instrumenter/Cargo.toml' }];
    const lines = ['lib.test = false', 'lib = { test = false }', '"autotests" = false', 'path = "tests/empty.rs"'];
    for (const text of lines) {
      const addedLines = [{ path: 'instrumenter/Cargo.toml', line: 3, text }];
      assert.deepEqual(rulesHit(checkPr(pr({ files, addedLines }))), ['protected-paths'], text);
    }
  });

  it('protects test settings whose quoted key is spelled with TOML Unicode escapes', () => {
    const files = [{ status: 'M', path: 'instrumenter/Cargo.toml' }];
    // Each line as written in Cargo.toml (one backslash), and the setting it spells.
    const lines = [
      ['"\\u0061utotests" = false', 'autotests = false'],
      ['"\\U00000061utotests" = false', 'autotests = false'],
      ['"h\\u0061rness" = false', 'harness = false, under [[test]]'],
      ['lib = { "t\\u0065st" = false }', 'lib = { test = false }'],
      ['"\\u0064octest" = false', 'doctest = false'],
      ['"required-f\\u0065atures" = ["slow"]', 'required-features = ["slow"]'],
      ['"\\u0070\\u0061\\u0074\\u0068" = "tests/empty.rs"', 'path = "tests/empty.rs"'],
      ['"\\U00000061utobenches" = false', 'autobenches = false'],
    ];
    // Every line is checked before failing, so the message lists them all.
    const missed = lines
      .map(([text, meaning]) => {
        const result = checkPr(pr({ files, addedLines: [{ path: 'instrumenter/Cargo.toml', line: 3, text }] }));
        const hit = rulesHit(result).includes('protected-paths') && result.length === 1;
        return hit ? null : `  ${text}  (decodes to ${meaning}; got findings: ${show(result)})`;
      })
      .filter(Boolean);
    assert.deepEqual(
      missed,
      [],
      'each added line in instrumenter/Cargo.toml below spells a test setting with a TOML \\u or \\U escape, so it should hit ' +
        `protected-paths (and nothing else) like its plain spelling, but didn't:\n${missed.join('\n')}`,
    );
  });

  it('does not protect Cargo.toml lines with no test setting, escaped or not', () => {
    const files = [{ status: 'M', path: 'instrumenter/Cargo.toml' }];
    const lines = [
      ['serde = "1.0.2"', 'a dependency bump'],
      ['"\\u0077alrus" = "0.24"', 'walrus = "0.24", a dependency bump'],
      ['description = "caf\\u00e9 \\U0001F600"', 'a description with escaped characters'],
    ];
    for (const [text, meaning] of lines) {
      const addedLines = [{ path: 'instrumenter/Cargo.toml', line: 9, text }];
      const result = checkPr(pr({ files, addedLines }));
      assert.deepEqual(
        result,
        [],
        `added line ${text} in instrumenter/Cargo.toml (${meaning}) should hit no rule. Got findings: ${show(result)}`,
      );
    }
  });

  it('only decodes escapes in instrumenter/Cargo.toml: an escaped setting word elsewhere is not protected', () => {
    const text = '"\\u0061utotests" = false';
    for (const path of ['client/src/settings.toml', 'docs/Cargo.toml']) {
      const files = [{ status: 'M', path }];
      const addedLines = [{ path, line: 3, text }];
      const result = checkPr(pr({ files, addedLines }));
      assert.ok(
        !rulesHit(result).includes('protected-paths'),
        `added line ${text} in ${path} (not instrumenter/Cargo.toml) should not hit protected-paths. Got findings: ${show(result)}`,
      );
    }
  });

  it('accepts them once a person adds the human-approved label', () => {
    const files = [{ status: 'M', path: '.github/workflows/e2e.yml' }];
    assert.deepEqual(checkPr(pr({ files, labels: new Set(['human-approved']) })), []);
  });

  it('treats a renamed file as touching its old path too', () => {
    const files = [{ status: 'R', path: 'ci/e2e.yml', oldPath: '.github/workflows/e2e.yml' }];
    assert.deepEqual(rulesHit(checkPr(pr({ files }))), ['protected-paths']);
  });

  it('protects the rule files themselves, so a PR cannot drop its own check', () => {
    const files = [
      { status: 'M', path: 'scripts/pr-rules.mjs' },
      { status: 'M', path: 'scripts/check-pr.mjs' },
    ];
    assert.equal(checkPr(pr({ files })).filter((f) => f.rule === 'protected-paths').length, 2);
  });

  it('rejects edits to the package.json scripts that CI runs', () => {
    const files = [
      { status: 'M', path: 'package.json', scriptsChanged: true },
      { status: 'M', path: 'client/package.json', scriptsChanged: true },
    ];
    assert.deepEqual(
      checkPr(pr({ files })).map((f) => f.path),
      ['package.json', 'client/package.json'],
    );
  });

  it('allows dependency bumps that leave the scripts alone', () => {
    const files = [
      { status: 'M', path: 'package.json', scriptsChanged: false },
      { status: 'M', path: 'client/package.json' },
      { status: 'M', path: 'pnpm-lock.yaml' },
    ];
    assert.deepEqual(checkPr(pr({ files })), []);
  });

  it('protects a manifest that is added, deleted or renamed', () => {
    const files = [{ status: 'D', path: 'client/package.json' }];
    assert.deepEqual(rulesHit(checkPr(pr({ files }))), ['protected-paths']);
  });

  it('protects a manifest renamed out of its place', () => {
    const files = [{ status: 'R', path: 'client/package.backup.json', oldPath: 'client/package.json' }];
    const result = checkPr(pr({ files }));
    assert.ok(result.some((f) => f.rule === 'protected-paths' && f.path === 'client/package.json'));
  });
});
