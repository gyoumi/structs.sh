// Rules every PR must pass. They turn review-checklist items into checks, so
// an agent gets a red X with a reason instead of a paragraph in a skill.
//
// checkPr takes a description of the change and returns a list of findings.
// scripts/check-pr.mjs builds that description from git and GitHub.

/** Labels a person adds to a PR to waive a rule. Agents never add these. */
const LABELS = {
  humanApproved: 'human-approved',
  noTestNeeded: 'no-test-needed',
  removalOk: 'removal-ok',
};

// Changing any of these can weaken a check or the sandbox, so a person signs off.
const PROTECTED = [
  /^\.github\//,
  /^\.claude\//,
  /^skills-lock\.json$/,
  /^scripts\/(pr-rules|check-pr|check-known-failures|check-changed|target-branch)\.mjs$/,
  /^(client\/)?eslint\.config\.mjs$/,
  /^commitlint\.config\.js$/,
  /^knip\.jsonc$/,
  /^\.vale\.ini$/,
  /^\.vale\//,
  /^renovate\.json$/,
  /^\.coderabbit\.yaml$/,
  /^e2e\/known-failures\/[^/]+\.json$/,
  /^e2e\/playwright\.config\.ts$/,
  /^client\/vitest\.config\.ts$/,
  /(^|\/)\.cargo\//, // cargo config can change or skip what `cargo test` runs
  /^debugger\/pyproject\.toml$/, // ruff and mypy settings
  /^debugger\/nsjail_gdb\.cfg$/,
  /^debugger\/Dockerfile\.prod$/,
  /^debugger\/src\/debugger\/(base_debugger|c_compile)\.py$/,
];
// CI runs the commands in these manifests' "scripts", so editing those (to
// `true`, say) would switch a check off. Dependency bumps stay unprotected.
const MANIFEST = /^(client\/)?package\.json$/;
// Cargo.toml settings that change which instrumenter tests cargo runs,
// matched anywhere in an added line, since TOML can also write them as
// dotted keys (lib.test), inline tables or quoted keys. `path` can point a
// test at another file. Other lines, such as dependency bumps, stay
// unprotected.
const CARGO_MANIFEST = /^instrumenter\/Cargo\.toml$/;
const CARGO_TEST_SETTING = /\b(autotests|autobenches|test|harness|doctest|required-features|path)\b/;

const OTHER_LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'bun.lock', 'bun.lockb']);
const IMAGE_FOLDERS = [/^client\/public\//, /^client\/src\//, /^docs\/docs\/images\//];
const PRODUCT_CODE = /^(client|debugger|e2e)\//;
const AGENT_CONFIG = /^(\.claude\/|skills-lock\.json$)/;
const DEBUGGER_SOURCE = /^debugger\/src\//;
const DEBUGGER_TESTS = /^debugger\/src\/debugger\/test\//;
// Files a test runner picks up, by its own naming rule, so renaming one out
// of the pattern counts as removing it: Playwright's *.spec.ts and *.test.ts,
// pytest's test_*.py and *_test.py, cargo's tests/*.rs, Vitest's
// client/src/**/*.test.ts(x), and node --test's scripts/*.test.mjs.
const TEST_FILE =
  /^(e2e\/tests\/.*\.(spec|test)\.[cm]?[jt]sx?|debugger\/src\/debugger\/test\/(.*\/)?(test_[^/]*|[^/]*_test)\.py|instrumenter\/tests\/[^/]+\.rs|client\/src\/.*\.test\.tsx?|scripts\/[^/]+\.test\.mjs)$/;
// Changes that count as test coverage for a debugger change.
const TEST_CHANGE = /^(e2e\/tests\/|e2e\/programs\/|e2e\/known-failures\/[^/]+\.json$|debugger\/src\/debugger\/test\/)/;
const SHRINK_CHECKED = /^((client\/src|debugger\/src|e2e|instrumenter\/src|instrumenter\/tests)\/|scripts\/[^/]+\.test\.mjs$)/;

const basename = (path) => path.slice(path.lastIndexOf('/') + 1);

/**
 * @param {{
 *   files: { status: 'A' | 'M' | 'D' | 'R', path: string, oldPath?: string, oldLines?: number, newLines?: number, scriptsChanged?: boolean }[],
 *   tracked: string[],
 *   addedLines: { path: string, line: number, text: string }[],
 *   labels: Set<string>,
 * }} pr
 * @returns {{ rule: string, path?: string, line?: number, message: string }[]}
 */
export function checkPr({ files, tracked, addedLines, labels }) {
  const findings = [];
  const add = (rule, path, message, line) => findings.push({ rule, path, line, message });

  // forbidden-files
  for (const path of tracked) {
    const name = basename(path);
    if (OTHER_LOCKFILES.has(name)) add('forbidden-files', path, 'This repo uses pnpm (pnpm-lock.yaml). Delete this lockfile.');
    else if (/^\.env(\..+)?$/.test(name) && name !== '.env.example') add('forbidden-files', path, 'Env files hold secrets. Untrack it and add it to .gitignore.');
    else if (name.endsWith('.tsbuildinfo')) add('forbidden-files', path, 'TypeScript build cache. Untrack it.');
  }
  for (const { status, path } of files) {
    if (status !== 'D' && path.endsWith('.png') && !IMAGE_FOLDERS.some((re) => re.test(path))) {
      add('forbidden-files', path, 'Screenshots are not committed. Images belong in client/public, client/src or docs/docs/images.');
    }
  }

  // debug-tags
  for (const { path, line, text } of addedLines) {
    if (PRODUCT_CODE.test(path) && text.includes('[DEBUG-')) {
      add('debug-tags', path, 'Temporary [DEBUG-xxxx] line left in. Remove it before merging.', line);
    }
  }

  const paths = files.flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path]));

  // agent-config-alone
  const agentConfig = paths.filter((p) => AGENT_CONFIG.test(p));
  if (agentConfig.length && agentConfig.length < paths.length) {
    add('agent-config-alone', agentConfig[0], 'Agent config (.claude/, skills-lock.json) goes in its own PR, separate from other changes.');
  }

  // debugger-needs-test
  const debuggerChanged = paths.find((p) => DEBUGGER_SOURCE.test(p) && !DEBUGGER_TESTS.test(p));
  const testChanged = files.some((f) => f.status !== 'D' && TEST_CHANGE.test(f.path));
  if (debuggerChanged && !testChanged && !labels.has(LABELS.noTestNeeded)) {
    add(
      'debugger-needs-test',
      debuggerChanged,
      `Debugger changes need an e2e test, a pytest, or a known-failures entry. A person can add the "${LABELS.noTestNeeded}" label to waive this.`,
    );
  }

  // large-removal
  if (!labels.has(LABELS.removalOk)) {
    for (const { status, path, oldPath, oldLines = 0, newLines = 0 } of files) {
      if (status === 'D' && TEST_FILE.test(path)) {
        add('large-removal', path, `Test file deleted. A person can add the "${LABELS.removalOk}" label if this is intended.`);
      } else if (status === 'R' && TEST_FILE.test(oldPath) && !TEST_FILE.test(path)) {
        add('large-removal', oldPath, `Test file moved out of the test folders, so it no longer runs. A person can add the "${LABELS.removalOk}" label if this is intended.`);
      } else if (status === 'M' && SHRINK_CHECKED.test(path)) {
        const emptied = oldLines > 0 && newLines === 0;
        const gutted = oldLines >= 40 && newLines < oldLines * 0.3;
        if (emptied || gutted) {
          add('large-removal', path, `File went from ${oldLines} to ${newLines} lines. A person can add the "${LABELS.removalOk}" label if this is intended.`);
        }
      }
    }
  }

  // protected-paths
  if (!labels.has(LABELS.humanApproved)) {
    const manifestScripts = files
      .filter((f) => (MANIFEST.test(f.path) || MANIFEST.test(f.oldPath ?? '')) && (f.status !== 'M' || f.scriptsChanged))
      .flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path]));
    const cargoTestSettings = addedLines.filter((l) => CARGO_MANIFEST.test(l.path) && CARGO_TEST_SETTING.test(l.text)).map((l) => l.path);
    for (const path of new Set(paths)) {
      if (PROTECTED.some((re) => re.test(path)) || manifestScripts.includes(path) || cargoTestSettings.includes(path)) {
        add('protected-paths', path, `Changes to CI, lint config, the package.json scripts CI runs, agent config, known failures or the sandbox need a person to add the "${LABELS.humanApproved}" label.`);
      }
    }
  }

  return findings;
}
