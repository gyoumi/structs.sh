import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPr } from './pr-rules.mjs';
import { PROTECTED_PATHS_MESSAGE, pr, rulesHit, show } from './pr-rules-test-kit.mjs';

// protected-paths: changes to CI, lint config, the rules themselves, the test
// runners' settings, the package.json scripts CI runs, or the known-failures
// list need a person to add the human-approved label.

describe('protected-paths', () => {
  const protectedChanges = [
    { what: 'the CI workflow .github/workflows/e2e.yml changed', file: { status: 'M', path: '.github/workflows/e2e.yml' }, finding: '.github/workflows/e2e.yml' },
    { what: 'the lint config client/eslint.config.mjs changed', file: { status: 'M', path: 'client/eslint.config.mjs' }, finding: 'client/eslint.config.mjs' },
    { what: 'the known-failures list e2e/known-failures/wasm.json changed', file: { status: 'M', path: 'e2e/known-failures/wasm.json' }, finding: 'e2e/known-failures/wasm.json' },
    { what: 'the Vitest config client/vitest.config.ts changed (it picks the unit tests that run)', file: { status: 'M', path: 'client/vitest.config.ts' }, finding: 'client/vitest.config.ts' },
    { what: 'the rules scripts/pr-rules.mjs changed (a PR cannot drop its own check)', file: { status: 'M', path: 'scripts/pr-rules.mjs' }, finding: 'scripts/pr-rules.mjs' },
    { what: 'the rules runner scripts/check-pr.mjs changed', file: { status: 'M', path: 'scripts/check-pr.mjs' }, finding: 'scripts/check-pr.mjs' },
    {
      what: '.github/workflows/e2e.yml renamed to ci/e2e.yml (a rename touches its old path too)',
      file: { status: 'R', path: 'ci/e2e.yml', oldPath: '.github/workflows/e2e.yml' },
      finding: '.github/workflows/e2e.yml',
    },
  ];
  for (const { what, file, finding } of protectedChanges) {
    it(`protects it without human approval: ${what}`, () => {
      const result = checkPr(pr({ files: [file] }));
      assert.deepEqual(
        result.map((f) => `${f.rule} ${f.path}`),
        [`protected-paths ${finding}`],
        `${what} should hit protected-paths on ${finding} only. Got findings: ${show(result)}`,
      );
      assert.equal(result[0].message, PROTECTED_PATHS_MESSAGE, `${what}: protected-paths should use the message, which no longer mentions the sandbox`);
    });
  }

  it('accepts them once a person adds the human-approved label', () => {
    const files = [{ status: 'M', path: '.github/workflows/e2e.yml' }];
    const result = checkPr(pr({ files, labels: new Set(['human-approved']) }));
    assert.deepEqual(result, [], `.github/workflows/e2e.yml changed with the human-approved label should hit no rule. Got findings: ${show(result)}`);
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

  const manifestChanges = [
    { what: 'the scripts in the root package.json changed', file: { status: 'M', path: 'package.json', scriptsChanged: true }, finding: 'package.json' },
    { what: 'the scripts in client/package.json changed', file: { status: 'M', path: 'client/package.json', scriptsChanged: true }, finding: 'client/package.json' },
    { what: 'client/package.json added', file: { status: 'A', path: 'client/package.json' }, finding: 'client/package.json' },
    { what: 'client/package.json deleted', file: { status: 'D', path: 'client/package.json' }, finding: 'client/package.json' },
    {
      what: 'client/package.json renamed out of its place, to client/package.backup.json',
      file: { status: 'R', path: 'client/package.backup.json', oldPath: 'client/package.json' },
      finding: 'client/package.json',
    },
  ];
  for (const { what, file, finding } of manifestChanges) {
    it(`protects a package.json whose scripts CI runs: ${what}`, () => {
      const result = checkPr(pr({ files: [file] }));
      assert.ok(
        result.some((f) => f.rule === 'protected-paths' && f.path === finding),
        `${what} should hit protected-paths on ${finding}. Got findings: ${show(result)}`,
      );
    });
  }

  it('allows dependency bumps that leave the scripts alone', () => {
    const files = [
      { status: 'M', path: 'package.json', scriptsChanged: false },
      { status: 'M', path: 'client/package.json' },
      { status: 'M', path: 'pnpm-lock.yaml' },
    ];
    const result = checkPr(pr({ files }));
    assert.deepEqual(result, [], `package.json and client/package.json changed with their scripts unchanged, plus pnpm-lock.yaml, should hit no rule. Got findings: ${show(result)}`);
  });

  // Cargo.toml settings that turn the instrumenter tests off or skip them.
  const cargoTestSettings = [
    'autotests = false',
    'required-features = ["slow"]',
    'lib.test = false',
    'lib = { test = false }',
    '"autotests" = false',
    'path = "tests/empty.rs"',
  ];
  for (const text of cargoTestSettings) {
    it(`protects a Cargo.toml line that changes which instrumenter tests run: ${text}`, () => {
      const files = [{ status: 'M', path: 'instrumenter/Cargo.toml' }];
      const result = checkPr(pr({ files, addedLines: [{ path: 'instrumenter/Cargo.toml', line: 3, text }] }));
      assert.deepEqual(
        rulesHit(result),
        ['protected-paths'],
        `added line ${text} in instrumenter/Cargo.toml should hit protected-paths only. Got findings: ${show(result)}`,
      );
    });
  }

  it('protects cargo config, another way cargo can skip the instrumenter tests', () => {
    const result = checkPr(pr({ files: [{ status: 'A', path: 'instrumenter/.cargo/config.toml' }] }));
    assert.deepEqual(
      result.map((f) => `${f.rule} ${f.path}`),
      ['protected-paths instrumenter/.cargo/config.toml'],
      `adding instrumenter/.cargo/config.toml should hit protected-paths. Got findings: ${show(result)}`,
    );
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
      ['walrus = "0.24"', 'a dependency bump'],
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
});
