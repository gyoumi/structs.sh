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

  it('reports every protected file in a PR, not just the first: CI, lint config and the known-failures list', () => {
    const files = [
      { status: 'M', path: '.github/workflows/e2e.yml' },
      { status: 'M', path: 'client/eslint.config.mjs' },
      { status: 'M', path: 'e2e/known-failures/wasm.json' },
    ];
    const result = checkPr(pr({ files }));
    assert.deepEqual(
      result.map((f) => `${f.rule} ${f.path}`),
      ['protected-paths .github/workflows/e2e.yml', 'protected-paths client/eslint.config.mjs', 'protected-paths e2e/known-failures/wasm.json'],
      `one PR changing the CI, lint config and known-failures files: each should hit protected-paths. Got findings: ${show(result)}`,
    );
    for (const finding of result) {
      assert.equal(finding.message, PROTECTED_PATHS_MESSAGE, `protected-paths for ${finding.path} should use the message, which no longer mentions the sandbox`);
    }
  });

  it('reports every protected file in a PR, not just the first: both rule files', () => {
    const files = [
      { status: 'M', path: 'scripts/pr-rules.mjs' },
      { status: 'M', path: 'scripts/check-pr.mjs' },
    ];
    const result = checkPr(pr({ files }));
    assert.deepEqual(
      result.map((f) => `${f.rule} ${f.path}`),
      ['protected-paths scripts/pr-rules.mjs', 'protected-paths scripts/check-pr.mjs'],
      `one PR changing scripts/pr-rules.mjs and scripts/check-pr.mjs: each should hit protected-paths. Got findings: ${show(result)}`,
    );
  });

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
    { what: 'the scripts in the root package.json changed', file: { status: 'M', path: 'package.json', scriptsChanged: true }, findings: ['package.json'] },
    { what: 'the scripts in client/package.json changed', file: { status: 'M', path: 'client/package.json', scriptsChanged: true }, findings: ['client/package.json'] },
    { what: 'client/package.json added', file: { status: 'A', path: 'client/package.json' }, findings: ['client/package.json'] },
    { what: 'client/package.json deleted', file: { status: 'D', path: 'client/package.json' }, findings: ['client/package.json'] },
    {
      what: 'client/package.json renamed out of its place, to client/package.backup.json',
      file: { status: 'R', path: 'client/package.backup.json', oldPath: 'client/package.json' },
      // A rename touches both its paths.
      findings: ['client/package.backup.json', 'client/package.json'],
    },
  ];
  for (const { what, file, findings } of manifestChanges) {
    it(`protects a package.json whose scripts CI runs: ${what}`, () => {
      const result = checkPr(pr({ files: [file] }));
      assert.deepEqual(
        result.map((f) => `${f.rule} ${f.path}`),
        findings.map((path) => `protected-paths ${path}`),
        `${what} should hit protected-paths on ${findings.join(' and ')} only. Got findings: ${show(result)}`,
      );
    });
  }

  it('reports every package.json whose scripts changed in a PR, and nothing else', () => {
    const files = [
      { status: 'M', path: 'package.json', scriptsChanged: true },
      { status: 'M', path: 'client/package.json', scriptsChanged: true },
    ];
    const result = checkPr(pr({ files }));
    assert.deepEqual(
      result.map((f) => f.path),
      ['package.json', 'client/package.json'],
      `one PR changing the scripts in package.json and client/package.json: paths of all findings. Got findings: ${show(result)}`,
    );
  });

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

  it('reports both Cargo.toml and cargo config in a PR that changes them together', () => {
    const files = [
      { status: 'M', path: 'instrumenter/Cargo.toml' },
      { status: 'A', path: 'instrumenter/.cargo/config.toml' },
    ];
    const addedLines = [{ path: 'instrumenter/Cargo.toml', line: 7, text: 'required-features = ["slow"]' }];
    const result = checkPr(pr({ files, addedLines }));
    assert.deepEqual(
      result.filter((f) => f.rule === 'protected-paths').map((f) => f.path),
      ['instrumenter/Cargo.toml', 'instrumenter/.cargo/config.toml'],
      `one PR adding required-features = ["slow"] to instrumenter/Cargo.toml and adding instrumenter/.cargo/config.toml: paths with protected-paths. Got findings: ${show(result)}`,
    );
  });

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

  // Lint settings and the lint and size-check scripts: changing them can turn
  // a check off, like changing the lint config.
  const lintFiles = [
    { path: 'instrumenter/clippy.toml', what: "clippy's settings for the instrumenter" },
    { path: 'instrumenter/src/clippy.toml', what: 'a clippy.toml in a subfolder (clippy reads the nearest one)' },
    { path: '.clippy.toml', what: 'a .clippy.toml at the repo root' },
    { path: 'instrumenter/.clippy.toml', what: 'a .clippy.toml next to Cargo.toml' },
    { path: 'scripts/lint-one-stage-value.mjs', what: 'the one-stage-value ESLint rule' },
    { path: 'scripts/retired-names.mjs', what: 'the retired-names list the lint config uses' },
    { path: 'scripts/check-file-sizes.mjs', what: 'the file-size check and the scope the lint rules use' },
  ];
  for (const { path, what } of lintFiles) {
    for (const status of ['M', 'A']) {
      it(`protects it without human approval: ${path} (${what}), status ${status}`, () => {
        const result = checkPr(pr({ files: [{ status, path }] }));
        assert.deepEqual(
          result.map((f) => `${f.rule} ${f.path}`),
          [`protected-paths ${path}`],
          `${path} (${what}) with status ${status} should hit protected-paths on ${path} only. Got findings: ${show(result)}`,
        );
        assert.equal(result[0].message, PROTECTED_PATHS_MESSAGE, `${path}: protected-paths should use the usual message`);
      });
    }
  }

  // Cargo.toml lines that set a lint level or a lint table.
  const cargoLintSettings = [
    '[lints.clippy]',
    'struct_excessive_bools = "allow"',
    'fn_params_excessive_bools = { level = "warn", priority = 1 }',
    '[lints]',
    'lints.workspace = true',
  ];
  for (const text of cargoLintSettings) {
    it(`protects a Cargo.toml line that sets a lint level or lint table: ${text}`, () => {
      const files = [{ status: 'M', path: 'instrumenter/Cargo.toml' }];
      const result = checkPr(pr({ files, addedLines: [{ path: 'instrumenter/Cargo.toml', line: 12, text }] }));
      assert.deepEqual(
        result.map((f) => `${f.rule} ${f.path}`),
        ['protected-paths instrumenter/Cargo.toml'],
        `added line ${text} in instrumenter/Cargo.toml (a lint setting) should hit protected-paths on instrumenter/Cargo.toml only. Got findings: ${show(result)}`,
      );
    });
  }

  it('accepts lint settings and lint scripts once a person adds the human-approved label', () => {
    const labels = new Set(['human-approved']);
    for (const { path } of lintFiles) {
      const result = checkPr(pr({ files: [{ status: 'M', path }], labels }));
      assert.deepEqual(result, [], `${path} changed with the human-approved label should hit no rule. Got findings: ${show(result)}`);
    }
    for (const text of cargoLintSettings) {
      const files = [{ status: 'M', path: 'instrumenter/Cargo.toml' }];
      const result = checkPr(pr({ files, labels, addedLines: [{ path: 'instrumenter/Cargo.toml', line: 12, text }] }));
      assert.deepEqual(result, [], `added line ${text} in instrumenter/Cargo.toml with the human-approved label should hit no rule. Got findings: ${show(result)}`);
    }
  });

  // Removing a lint or test setting from Cargo.toml turns a check off as surely
  // as adding one, so removed lines (line numbers in the base file) count too.
  const CARGO = 'instrumenter/Cargo.toml';
  const removed = (texts, start = 20) => texts.map((text, i) => ({ path: CARGO, line: start + i, text }));
  const cargoPolicy = ['[lints.clippy]', 'struct_excessive_bools = "warn"', 'fn_params_excessive_bools = "warn"'];

  for (const text of [...cargoPolicy, 'harness = false']) {
    it(`protects a removed Cargo.toml lint or test setting: ${text}`, () => {
      const result = checkPr(pr({ files: [{ status: 'M', path: CARGO }], removedLines: removed([text]) }));
      assert.deepEqual(
        result.map((f) => `${f.rule} ${f.path}`),
        [`protected-paths ${CARGO}`],
        `removed line ${text} from ${CARGO} (no added lines) should hit protected-paths on ${CARGO} only. Got findings: ${show(result)}`,
      );
      assert.equal(result[0].message, PROTECTED_PATHS_MESSAGE, `removed line ${text}: protected-paths should use the usual message`);
    });
  }

  it('protects a deletion-only change that removes the whole [lints.clippy] table from Cargo.toml', () => {
    const removedLines = removed(cargoPolicy);
    const result = checkPr(pr({ files: [{ status: 'M', path: CARGO }], addedLines: [], removedLines }));
    const what = `removing ${cargoPolicy.join(' / ')} (lines 20-22) from ${CARGO}, with no added lines`;
    assert.ok(result.length > 0, `${what} should hit protected-paths. Got findings: ${show(result)}`);
    assert.deepEqual(
      [...new Set(result.map((f) => `${f.rule} ${f.path}`))],
      [`protected-paths ${CARGO}`],
      `${what}: every finding should be protected-paths on ${CARGO}. Got findings: ${show(result)}`,
    );
  });

  it('accepts removed Cargo.toml lint and test settings once a person adds the human-approved label', () => {
    const labels = new Set(['human-approved']);
    for (const texts of [cargoPolicy, ['harness = false']]) {
      const result = checkPr(pr({ files: [{ status: 'M', path: CARGO }], removedLines: removed(texts), labels }));
      assert.deepEqual(result, [], `removing ${texts.join(' / ')} from ${CARGO} with the human-approved label should hit no rule. Got findings: ${show(result)}`);
    }
  });

  it('does not protect a removed dependency line in Cargo.toml, alone or as a version bump', () => {
    const files = [{ status: 'M', path: CARGO }];
    const cases = [
      ['removing walrus = "0.28"', { removedLines: removed(['walrus = "0.28"']) }],
      ['bumping walrus = "0.28" to walrus = "0.29"', { removedLines: removed(['walrus = "0.28"']), addedLines: [{ path: CARGO, line: 20, text: 'walrus = "0.29"' }] }],
    ];
    for (const [what, lines] of cases) {
      const result = checkPr(pr({ files, ...lines }));
      assert.deepEqual(result, [], `${what} in ${CARGO} should hit no rule. Got findings: ${show(result)}`);
    }
  });
});
