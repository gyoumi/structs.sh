const LABELS = {
  humanApproved: 'human-approved',
  noTestNeeded: 'no-test-needed',
  removalOk: 'removal-ok',
};

const PROTECTED = [
  /^\.github\//,
  /^\.claude\//,
  /^skills-lock\.json$/,
  /^scripts\/(pr-rules|check-pr|check-known-failures|check-changed|target-branch|check-file-sizes|lint-one-stage-value|retired-names)\.mjs$/,
  /(^|\/)\.?clippy\.toml$/,
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
];
const MANIFEST = /^(client\/)?package\.json$/;
// Cargo.toml settings that change which instrumenter tests cargo runs,
// matched anywhere in an added or removed line, since TOML can also write
// them as dotted keys (lib.test), inline tables or quoted keys. `path` can
// point a test at another file. Quoted keys can spell a setting with TOML's
// \uXXXX and \UXXXXXXXX escapes, so those are decoded first.
const CARGO_MANIFEST = /^(instrumenter|crates(\/[^/]+)?)\/Cargo\.toml$/;
const CARGO_TEST_SETTING = /\b(autotests|autobenches|test|harness|doctest|required-features|path)\b/;
const CARGO_LINT_SETTING = /\blints\b|["'](allow|warn|deny|forbid)["']/;
const decodeTomlEscapes = (text) =>
  text.replace(/\\u([0-9a-fA-F]{4})|\\U([0-9a-fA-F]{8})/g, (escape, short, long) => {
    const code = parseInt(short ?? long, 16);
    return code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff) ? escape : String.fromCodePoint(code);
  });

const OTHER_LOCKFILES = new Set(['package-lock.json', 'npm-shrinkwrap.json', 'yarn.lock', 'bun.lock', 'bun.lockb']);
const IMAGE_FOLDERS = [/^client\/public\//, /^client\/src\//, /^docs\/docs\/images\//];
const PRODUCT_CODE = /^(client|e2e|instrumenter|crates)\//;
const AGENT_CONFIG = /^(\.claude\/|skills-lock\.json$)/;
const DEBUGGER_SOURCE = /^(instrumenter\/src|client\/src\/Services\/debugger)\/.*\.(tsx?|rs)$/;
const DEBUGGER_TESTS = /(\.test\.tsx?$|\/fixtures\/)/;
// Files a test runner picks up, by its own naming rule, so renaming one out
// of the pattern counts as removing it: Playwright's *.spec.ts and *.test.ts,
// cargo's tests/*.rs, Vitest's client/src/**/*.test.ts(x), and node --test's
// scripts/*.test.mjs.
const TEST_FILE =
  /^(e2e\/tests\/.*\.(spec|test)\.[cm]?[jt]sx?|(instrumenter|crates\/[^/]+)\/tests\/[^/]+\.rs|client\/src\/.*\.test\.tsx?|scripts\/[^/]+\.test\.mjs)$/;
const TEST_CHANGE =
  /^(e2e\/tests\/|e2e\/programs\/|e2e\/known-failures\/[^/]+\.json$|(instrumenter|crates\/[^/]+)\/tests\/([^/]+\.rs|fixtures\/.*(?<!\.md))$|client\/src\/.*\.test\.tsx?$)/;
const SHRINK_CHECKED = /^((client\/src|e2e|instrumenter\/src|instrumenter\/tests|crates\/[^/]+\/(src|tests))\/|scripts\/[^/]+\.test\.mjs$)/;

const basename = (path) => path.slice(path.lastIndexOf('/') + 1);

const finding = (rule, path, message, line) => ({ rule, path, line, message });

const changedPaths = (files) => files.flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path]));

function forbiddenFiles({ files, tracked }) {
  const findings = [];
  for (const path of tracked) {
    const name = basename(path);
    if (OTHER_LOCKFILES.has(name)) findings.push(finding('forbidden-files', path, 'This repo uses pnpm (pnpm-lock.yaml). Delete this lockfile.'));
    else if (/^\.env(\..+)?$/.test(name) && name !== '.env.example') findings.push(finding('forbidden-files', path, 'Env files hold secrets. Untrack it and add it to .gitignore.'));
    else if (name.endsWith('.tsbuildinfo')) findings.push(finding('forbidden-files', path, 'TypeScript build cache. Untrack it.'));
  }
  for (const { status, path } of files) {
    if (status !== 'D' && path.endsWith('.png') && !IMAGE_FOLDERS.some((re) => re.test(path))) {
      findings.push(finding('forbidden-files', path, 'Screenshots are not committed. Images belong in client/public, client/src or docs/docs/images.'));
    }
  }
  return findings;
}

function debugTags({ addedLines }) {
  return addedLines
    .filter(({ path, text }) => PRODUCT_CODE.test(path) && text.includes('[DEBUG-'))
    .map(({ path, line }) => finding('debug-tags', path, 'Temporary [DEBUG-xxxx] line left in. Remove it before merging.', line));
}

function agentConfigAlone({ files }) {
  const paths = changedPaths(files);
  const agentConfig = paths.filter((p) => AGENT_CONFIG.test(p));
  if (agentConfig.length && agentConfig.length < paths.length) {
    return [finding('agent-config-alone', agentConfig[0], 'Agent config (.claude/, skills-lock.json) goes in its own PR, separate from other changes.')];
  }
  return [];
}

function debuggerNeedsTest({ files, labels }) {
  const debuggerChanged = changedPaths(files).find((p) => DEBUGGER_SOURCE.test(p) && !DEBUGGER_TESTS.test(p));
  const testChanged = files.some((f) => f.status !== 'D' && TEST_CHANGE.test(f.path));
  if (debuggerChanged && !testChanged && !labels.has(LABELS.noTestNeeded)) {
    return [
      finding(
        'debugger-needs-test',
        debuggerChanged,
        `Debugger changes need an e2e test, a Vitest or cargo test, or a known-failures entry. A person can add the "${LABELS.noTestNeeded}" label to waive this.`,
      ),
    ];
  }
  return [];
}

function largeRemoval({ files, labels }) {
  if (labels.has(LABELS.removalOk)) return [];
  const findings = [];
  for (const { status, path, oldPath, oldLines = 0, newLines = 0 } of files) {
    if (status === 'D' && TEST_FILE.test(path)) {
      findings.push(finding('large-removal', path, `Test file deleted. A person can add the "${LABELS.removalOk}" label if this is intended.`));
    } else if (status === 'R' && TEST_FILE.test(oldPath) && !TEST_FILE.test(path)) {
      findings.push(finding('large-removal', oldPath, `Test file moved out of the test folders, so it no longer runs. A person can add the "${LABELS.removalOk}" label if this is intended.`));
    } else if (status === 'M' && SHRINK_CHECKED.test(path)) {
      const emptied = oldLines > 0 && newLines === 0;
      const gutted = oldLines >= 40 && newLines < oldLines * 0.3;
      if (emptied || gutted) {
        findings.push(finding('large-removal', path, `File went from ${oldLines} to ${newLines} lines. A person can add the "${LABELS.removalOk}" label if this is intended.`));
      }
    }
  }
  return findings;
}

function protectedPaths({ files, addedLines, removedLines = [], labels }) {
  if (labels.has(LABELS.humanApproved)) return [];
  const manifestScripts = changedPaths(
    files.filter((f) => (MANIFEST.test(f.path) || MANIFEST.test(f.oldPath ?? '')) && (f.status !== 'M' || f.scriptsChanged)),
  );
  const cargoGuardedLines = [...addedLines, ...removedLines]
    .filter((l) => CARGO_MANIFEST.test(l.path) && [CARGO_TEST_SETTING, CARGO_LINT_SETTING].some((setting) => setting.test(decodeTomlEscapes(l.text))))
    .map((l) => l.path);
  return [...new Set(changedPaths(files))]
    .filter((path) => PROTECTED.some((re) => re.test(path)) || manifestScripts.includes(path) || cargoGuardedLines.includes(path))
    .map((path) =>
      finding('protected-paths', path, `Changes to CI, lint config, the package.json scripts CI runs, agent config or known failures need a person to add the "${LABELS.humanApproved}" label.`),
    );
}

const RULES = [forbiddenFiles, debugTags, agentConfigAlone, debuggerNeedsTest, largeRemoval, protectedPaths];

/**
 * @param {{
 *   files: { status: 'A' | 'M' | 'D' | 'R', path: string, oldPath?: string, oldLines?: number, newLines?: number, scriptsChanged?: boolean }[],
 *   tracked: string[],
 *   addedLines: { path: string, line: number, text: string }[],
 *   removedLines?: { path: string, line: number, text: string }[],
 *   labels: Set<string>,
 * }} pr
 * @returns {{ rule: string, path?: string, line?: number, message: string }[]}
 */
export function checkPr(pr) {
  return RULES.flatMap((rule) => rule(pr));
}
