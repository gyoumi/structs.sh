import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(new URL('./check-file-sizes.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Load the script lazily, so a missing script or export fails each test with
// a message rather than stopping the whole file. Importing must not run the
// CLI, so process.exit is trapped while the module loads.
let checkFileSizes;
let loadError;
{
  const realExit = process.exit;
  process.exit = (code) => {
    throw new Error(
      `importing scripts/check-file-sizes.mjs called process.exit(${code}). Run the CLI only when the file is the entry point (node scripts/check-file-sizes.mjs), not when a test imports it`,
    );
  };
  try {
    checkFileSizes = await import('./check-file-sizes.mjs');
  } catch (error) {
    loadError = error;
  } finally {
    process.exit = realExit;
  }
}

function exported(name) {
  if (loadError) assert.fail(`could not import scripts/check-file-sizes.mjs: ${loadError.message}`);
  const fn = checkFileSizes[name];
  assert.equal(typeof fn, 'function', `scripts/check-file-sizes.mjs should export a function ${name}, but ${name} is ${typeof fn}`);
  return fn;
}

const fmt = (value) => JSON.stringify(value);
const same = (actual, expected, what) =>
  assert.deepStrictEqual(actual, expected, `${what}\n  expected: ${fmt(expected)}\n  actual:   ${fmt(actual)}`);

// --- inScope -----------------------------------------------------------------

describe('inScope', () => {
  const inScopePaths = [
    // The debugger services and the hook.
    'client/src/Services/debugger/debuggerStore.ts',
    'client/src/Services/debugger/wasm/run.ts',
    'client/src/Services/debugger/wasm/recording.test.ts',
    'client/src/Services/debugger/wasm/compiler.worker.ts',
    'client/src/Services/useDebugger.ts',
    // The instrumenter.
    'instrumenter/src/lib.rs',
    'instrumenter/src/debug.rs',
    'instrumenter/tests/instrument.rs',
    // e2e and scripts.
    'e2e/playwright.config.ts',
    'e2e/support/debugger-page.ts',
    'e2e/tests/linked-list.spec.ts',
    'scripts/pr-rules.mjs',
    'scripts/pr-rules.test.mjs',
    'scripts/helper.js',
    // A file named fixtures, not in a fixtures folder.
    'e2e/support/fixtures.ts',
    // The visualiser files the rewrite changed.
    // Every file in Parser/ whose name starts with linkedList.
    'client/src/visualiser-debugger/Component/Visualizer/Parser/linkedListParser.ts',
    'client/src/visualiser-debugger/Component/Visualizer/Parser/linkedListParser.test.ts',
    'client/src/visualiser-debugger/Component/Visualizer/Parser/linkedListHeap.ts',
    'client/src/visualiser-debugger/Component/Visualizer/Parser/linkedListLayout.ts',
    'client/src/visualiser-debugger/Component/Visualizer/Parser/linkedListEntities.ts',
    'client/src/visualiser-debugger/Types/annotationType.ts',
    'client/src/visualiser-debugger/Component/Configuration/Configuration.tsx',
    'client/src/visualiser-debugger/Component/Configuration/StackVarAnnotation.tsx',
    'client/src/visualiser-debugger/Component/Configuration/RoleAnnotation/LinkedListNodeAnnotation.tsx',
    'client/src/visualiser-debugger/Component/Control/Controls.tsx',
    'client/src/visualiser-debugger/DevelopmentMode.tsx',
    'client/src/visualiser-debugger/Component/Console/useCursor.ts',
  ];

  for (const path of inScopePaths) {
    it(`includes ${path}`, () => {
      const inScope = exported('inScope');
      const parser = 'every code file in client/src/visualiser-debugger/Component/Visualizer/Parser/ whose name starts with linkedList is checked';
      const why = path.includes('/Parser/linkedList') ? parser : 'a code file in the checked folders or list';
      assert.equal(inScope(path), true, `inScope(${fmt(path)}) should be true (${why}); got ${fmt(inScope(path))}`);
    });
  }

  const outOfScopePaths = [
    // Fixtures, generated and mock folders.
    ['client/src/visualiser-debugger/Component/Visualizer/Parser/fixtures/linkedList-x.json', 'a .json file in Parser/fixtures/'],
    ['client/src/visualiser-debugger/Component/Visualizer/Parser/fixtures/linkedList-x.ts', 'a .ts file in Parser/fixtures/'],
    ['instrumenter/tests/fixtures/helper.rs', 'a .rs file in instrumenter/tests/fixtures/'],
    ['e2e/fixtures/gdb-steps/linked_list.ts', 'a .ts file in e2e/fixtures/'],
    ['client/src/Services/debugger/wasm/fixtures/variables.ts', 'a .ts file in a debugger fixtures/ folder'],
    ['scripts/fixtures/check-file-sizes/big.mjs', 'a .mjs file in scripts/fixtures/'],
    ['client/src/Services/debugger/generated/clang.js', 'a .js file in a generated/ folder'],
    ['instrumenter/src/generated/tables.rs', 'a .rs file in instrumenter/src/generated/'],
    ['client/__mocks__/styleMock.js', 'a .js file in __mocks__/'],
    // Non-code files.
    ['client/src/Services/debugger/wasm/fixtures/variables.c', 'a .c file'],
    ['instrumenter/src/runtime.c', 'a .c file in instrumenter/src/'],
    ['e2e/known-failures/wasm.json', 'a .json file'],
    ['e2e/README.md', 'a .md file'],
    ['scripts/README.md', 'a .md file in scripts/'],
    ['instrumenter/tests/fixtures/hello.wasm', 'a .wasm file'],
    ['e2e/tsconfig.json', 'a .json file at the e2e root'],
    ['client/src/Services/debugger/wasm/style.css', 'a .css file'],
  ];

  for (const [path, why] of outOfScopePaths) {
    it(`excludes ${path} (${why})`, () => {
      const inScope = exported('inScope');
      assert.equal(inScope(path), false, `inScope(${fmt(path)}) should be false: ${why}; got ${fmt(inScope(path))}`);
    });
  }
});

// --- kindOf ------------------------------------------------------------------

describe('kindOf', () => {
  const kinds = [
    ['client/src/Services/debugger/wasm/recording.test.ts', 'test', '*.test.ts'],
    ['client/src/Services/debugger/Panel.test.tsx', 'test', '*.test.tsx'],
    ['client/src/Services/debugger/wasm/run.spec.ts', 'test', '*.spec.ts'],
    ['scripts/pr-rules.test.mjs', 'test', '*.test.mjs'],
    ['client/src/visualiser-debugger/Component/Visualizer/Parser/linkedListParser.test.ts', 'test', '*.test.ts on the visualiser list'],
    ['instrumenter/tests/instrument.rs', 'test', 'under instrumenter/tests/'],
    ['instrumenter/tests/common/mod.rs', 'test', 'nested under instrumenter/tests/'],
    ['e2e/tests/linked-list.spec.ts', 'test', 'an e2e spec'],
    ['e2e/support/debugger-page.ts', 'test', 'an e2e page object'],
    ['e2e/support/gdb-recording.ts', 'test', 'e2e support code'],
    ['e2e/playwright.config.ts', 'test', 'e2e config'],
    ['client/src/Services/debugger/wasm/recording.ts', 'source', 'debugger code'],
    ['client/src/Services/useDebugger.ts', 'source', 'the hook'],
    ['instrumenter/src/lib.rs', 'source', 'instrumenter/src/'],
    ['scripts/pr-rules.mjs', 'source', 'a script'],
    ['scripts/helper.js', 'source', 'a .js script'],
    ['client/src/visualiser-debugger/Component/Visualizer/Parser/linkedListParser.ts', 'source', 'a visualiser file'],
    ['client/src/visualiser-debugger/Component/Visualizer/Parser/linkedListLayout.ts', 'source', 'a linkedList file split out of linkedListParser.ts'],
    ['client/src/visualiser-debugger/Component/Control/Controls.tsx', 'source', 'a .tsx visualiser file'],
  ];

  for (const [path, kind, why] of kinds) {
    it(`calls ${path} a ${kind} file (${why})`, () => {
      const kindOf = exported('kindOf');
      assert.equal(kindOf(path), kind, `kindOf(${fmt(path)}) should be '${kind}' (${why}); got ${fmt(kindOf(path))}`);
    });
  }
});

// --- oversized ---------------------------------------------------------------

describe('oversized', () => {
  const SRC = 'client/src/Services/debugger/wasm/run.ts';
  const TEST = 'client/src/Services/debugger/wasm/run.test.ts';

  const limitCases = [
    [SRC, 299, null],
    [SRC, 300, null],
    [SRC, 301, { limit: 300, kind: 'source' }],
    [TEST, 300, null],
    [TEST, 301, null],
    [TEST, 500, null],
    [TEST, 501, { limit: 500, kind: 'test' }],
    ['e2e/support/debugger-page.ts', 500, null],
    ['e2e/support/debugger-page.ts', 501, { limit: 500, kind: 'test' }],
    ['instrumenter/tests/instrument.rs', 501, { limit: 500, kind: 'test' }],
    ['instrumenter/src/lib.rs', 301, { limit: 300, kind: 'source' }],
  ];

  for (const [path, lines, over] of limitCases) {
    const label = over ? `reports ${path} at ${lines} lines, over the ${over.limit}-line ${over.kind} limit` : `allows ${path} at ${lines} lines`;
    it(label, () => {
      const oversized = exported('oversized');
      const files = [{ path, lines }];
      const expected = over ? [{ path, lines, limit: over.limit, kind: over.kind }] : [];
      same(oversized(files, {}), expected, `oversized(${fmt(files)}, {}) (source limit 300, test limit 500, both inclusive)`);
    });
  }

  it('ignores out-of-scope paths, however long', () => {
    const oversized = exported('oversized');
    const files = [
      { path: 'instrumenter/tests/fixtures/helper.rs', lines: 5000 },
      { path: 'client/src/Services/debugger/generated/clang.js', lines: 5000 },
      { path: 'client/__mocks__/styleMock.js', lines: 5000 },
      { path: 'e2e/fixtures/gdb-steps/linked_list.json', lines: 5000 },
      { path: 'client/src/Services/debugger/wasm/fixtures/variables.c', lines: 5000 },
      { path: 'scripts/README.md', lines: 5000 },
      { path: 'scripts/pr-rules.mjs', lines: 301 },
    ];
    same(
      oversized(files, {}),
      [{ path: 'scripts/pr-rules.mjs', lines: 301, limit: 300, kind: 'source' }],
      `oversized(${fmt(files)}, {}) should report only the in-scope scripts/pr-rules.mjs`,
    );
  });

  it('returns an empty list for no files', () => {
    const oversized = exported('oversized');
    same(oversized([], {}), [], 'oversized([], {})');
  });

  const mixed = [
    { path: 'scripts/pr-rules.test.mjs', lines: 600 },
    { path: 'scripts/pr-rules.mjs', lines: 400 },
    { path: 'instrumenter/tests/instrument.rs', lines: 501 },
    { path: 'instrumenter/src/lib.rs', lines: 654 },
    { path: 'e2e/support/debugger-page.ts', lines: 546 },
    { path: 'client/src/Services/useDebugger.ts', lines: 134 },
    { path: 'client/src/Services/debugger/wasm/recording.ts', lines: 363 },
    { path: 'client/src/Services/debugger/wasm/recording.test.ts', lines: 1625 },
    { path: 'client/src/Services/debugger/wasm/run.test.ts', lines: 176 },
  ];
  const overSource = [
    { path: 'client/src/Services/debugger/wasm/recording.ts', lines: 363, limit: 300, kind: 'source' },
    { path: 'instrumenter/src/lib.rs', lines: 654, limit: 300, kind: 'source' },
    { path: 'scripts/pr-rules.mjs', lines: 400, limit: 300, kind: 'source' },
  ];
  const overTest = [
    { path: 'client/src/Services/debugger/wasm/recording.test.ts', lines: 1625, limit: 500, kind: 'test' },
    { path: 'e2e/support/debugger-page.ts', lines: 546, limit: 500, kind: 'test' },
    { path: 'instrumenter/tests/instrument.rs', lines: 501, limit: 500, kind: 'test' },
    { path: 'scripts/pr-rules.test.mjs', lines: 600, limit: 500, kind: 'test' },
  ];
  const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);

  it('with only undefined, reports source and test files together, sorted by path', () => {
    const oversized = exported('oversized');
    same(
      oversized(mixed, {}),
      [...overSource, ...overTest].sort(byPath),
      `oversized(${fmt(mixed)}, {}) should list every file over its limit, sorted by path`,
    );
    same(
      oversized(mixed, { only: undefined }),
      [...overSource, ...overTest].sort(byPath),
      `oversized(${fmt(mixed)}, { only: undefined }) should list every file over its limit, sorted by path`,
    );
  });

  it("with only 'source', reports only source files", () => {
    const oversized = exported('oversized');
    same(oversized(mixed, { only: 'source' }), overSource, `oversized(${fmt(mixed)}, { only: 'source' })`);
  });

  it("with only 'test', reports only test files", () => {
    const oversized = exported('oversized');
    same(oversized(mixed, { only: 'test' }), overTest, `oversized(${fmt(mixed)}, { only: 'test' })`);
  });

  it('sorts by path whatever order the files come in', () => {
    const oversized = exported('oversized');
    const files = [
      { path: 'scripts/z.mjs', lines: 301 },
      { path: 'client/src/Services/debugger/b.ts', lines: 301 },
      { path: 'instrumenter/src/a.rs', lines: 301 },
      { path: 'client/src/Services/debugger/a.ts', lines: 301 },
      { path: 'e2e/tests/x.spec.ts', lines: 501 },
    ];
    same(
      oversized(files, {}).map((f) => f.path),
      [
        'client/src/Services/debugger/a.ts',
        'client/src/Services/debugger/b.ts',
        'e2e/tests/x.spec.ts',
        'instrumenter/src/a.rs',
        'scripts/z.mjs',
      ],
      `oversized(${fmt(files)}, {}) paths should come back sorted`,
    );
  });
});

// --- CLI in a temporary git repo -----------------------------------------------

// n lines of code, each ending in a newline unless trailingNewline is false.
const linesOf = (n, { trailingNewline = true } = {}) =>
  Array.from({ length: n }, (_, i) => `// line ${i + 1}`).join('\n') + (trailingNewline && n > 0 ? '\n' : '');

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

/**
 * A git repo with the script copied alone into scripts/ (untracked), the
 * `tracked` files added to the index and the `untracked` files left out.
 * Each entry is [path, content].
 */
function makeRepo(tracked, untracked = []) {
  const root = mkdtempSync(join(tmpdir(), 'check-file-sizes-'));
  tempDirs.push(root);
  execFileSync('git', ['init', '-q'], { cwd: root });
  for (const [path, content] of [...tracked, ...untracked]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  if (tracked.length) execFileSync('git', ['add', '--', ...tracked.map(([path]) => path)], { cwd: root });
  mkdirSync(join(root, 'scripts'), { recursive: true });
  if (!existsSync(scriptPath)) assert.fail(`scripts/check-file-sizes.mjs does not exist, so the CLI can't be run (looked for ${scriptPath})`);
  copyFileSync(scriptPath, join(root, 'scripts/check-file-sizes.mjs'));
  return root;
}

function runCli(cwd, args = [], script = 'scripts/check-file-sizes.mjs') {
  const result = spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8' });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return { status: result.status, output, lines: output.split('\n').filter((line) => line.trim() !== '') };
}

const quoted = (output) => output.split('\n').map((l) => `    | ${l}`).join('\n');
const describeRun = (repo, args, run, script = 'scripts/check-file-sizes.mjs') =>
  `\`node ${[script, ...args].join(' ')}\` in ${repo}\n  exit code: ${run.status}\n  output:\n${quoted(run.output)}`;

const overLine = (path, lines, limit, kind) => `${path}: ${lines} lines, over the ${limit}-line limit for ${kind} files`;
const reportLines = (run) => run.lines.filter((line) => /: \d+ lines, over the \d+-line limit for \w+ files$/.test(line.trim())).map((l) => l.trim());

describe('CLI in a temporary git repo', () => {
  // Tracked, in scope:
  //   scripts/big.mjs        301 lines, no final newline  -> over (source, 300)
  //   scripts/ok.mjs         300 lines, final newline     -> fine
  //   client/src/Services/debugger/wasm/huge.test.ts  501 -> over (test, 500)
  //   e2e/support/page.ts    500 lines                    -> fine (test)
  //   instrumenter/src/lib.rs  400 lines                  -> over (source)
  // Ignored, however long: a fixtures .rs, an excluded client file, a .json,
  // a .md, and an untracked .mjs.
  const repoFiles = [
    ['scripts/big.mjs', linesOf(301, { trailingNewline: false })],
    ['scripts/ok.mjs', linesOf(300)],
    ['client/src/Services/debugger/wasm/huge.test.ts', linesOf(501)],
    ['e2e/support/page.ts', linesOf(500)],
    ['instrumenter/src/lib.rs', linesOf(400)],
    ['instrumenter/tests/fixtures/big.rs', linesOf(900)],
    ['client/src/Services/debugger/generated/big.ts', linesOf(900)],
    ['e2e/fixtures/gdb-steps/rec.json', linesOf(900)],
    ['scripts/notes.md', linesOf(900)],
  ];
  const untrackedFiles = [['scripts/untracked.mjs', linesOf(900)]];
  const repoDescription =
    'a temp git repo with tracked scripts/big.mjs (301 lines, no final newline), scripts/ok.mjs (300), client/src/Services/debugger/wasm/huge.test.ts (501), e2e/support/page.ts (500), instrumenter/src/lib.rs (400), and ignored 900-line instrumenter/tests/fixtures/big.rs, generated/big.ts, e2e/fixtures/gdb-steps/rec.json, scripts/notes.md and untracked scripts/untracked.mjs; the script is copied alone into its scripts/ folder';

  it('lists each file over its limit, sorted by path, and exits 1', () => {
    const repo = makeRepo(repoFiles, untrackedFiles);
    const run = runCli(repo);
    const what = describeRun(repoDescription, [], run);
    assert.equal(run.status, 1, `exit code should be 1 when files are over their limit\n${what}`);
    same(
      reportLines(run),
      [
        overLine('client/src/Services/debugger/wasm/huge.test.ts', 501, 500, 'test'),
        overLine('instrumenter/src/lib.rs', 400, 300, 'source'),
        overLine('scripts/big.mjs', 301, 300, 'source'),
      ],
      `the "<path>: <lines> lines, over the <limit>-line limit for <kind> files" lines (a final line without a newline counts; 300 and 500 are allowed; fixtures, excluded, non-code and untracked files are ignored)\n${what}`,
    );
  });

  it('with --only source, lists only the source files', () => {
    const repo = makeRepo(repoFiles, untrackedFiles);
    const run = runCli(repo, ['--only', 'source']);
    const what = describeRun(repoDescription, ['--only', 'source'], run);
    assert.equal(run.status, 1, `exit code should be 1: two source files are over 300 lines\n${what}`);
    same(
      reportLines(run),
      [overLine('instrumenter/src/lib.rs', 400, 300, 'source'), overLine('scripts/big.mjs', 301, 300, 'source')],
      `the over-limit lines with --only source\n${what}`,
    );
  });

  it('with --only test, lists only the test files', () => {
    const repo = makeRepo(repoFiles, untrackedFiles);
    const run = runCli(repo, ['--only', 'test']);
    const what = describeRun(repoDescription, ['--only', 'test'], run);
    assert.equal(run.status, 1, `exit code should be 1: one test file is over 500 lines\n${what}`);
    same(
      reportLines(run),
      [overLine('client/src/Services/debugger/wasm/huge.test.ts', 501, 500, 'test')],
      `the over-limit lines with --only test\n${what}`,
    );
  });

  it('checks the whole repo, with repo-relative paths, when run from a subfolder', () => {
    const repo = makeRepo([['client/src/Services/debugger/wasm/big.ts', linesOf(301)], ['instrumenter/src/lib.rs', linesOf(400)], ['e2e/support/page.ts', linesOf(10)]]);
    const expected = [overLine('client/src/Services/debugger/wasm/big.ts', 301, 300, 'source'), overLine('instrumenter/src/lib.rs', 400, 300, 'source')];
    const repoDescription = 'a temp git repo with tracked client/src/Services/debugger/wasm/big.ts (301 lines), instrumenter/src/lib.rs (400) and e2e/support/page.ts (10)';
    const fromRoot = runCli(repo);
    same(reportLines(fromRoot), expected, `run from the repo root\n${describeRun(repoDescription, [], fromRoot)}`);
    for (const [sub, script] of [['client', '../scripts/check-file-sizes.mjs'], ['e2e/support', '../../scripts/check-file-sizes.mjs']]) {
      const run = runCli(join(repo, sub), [], script);
      const what = describeRun(`${repoDescription}, run from its ${sub}/ folder`, [], run, script);
      assert.equal(run.status, 1, `exit code should be 1 from ${sub}/: the CLI checks the whole repo (git top-level), whatever folder it runs from\n${what}`);
      same(reportLines(run), expected, `the over-limit lines from ${sub}/ should match the run from the root, with repo-relative paths\n${what}`);
    }
  });

  it('with --only test, passes when only source files are over', () => {
    const files = [
      ['instrumenter/src/lib.rs', linesOf(400)],
      ['e2e/tests/a.spec.ts', linesOf(500)],
    ];
    const repo = makeRepo(files);
    const run = runCli(repo, ['--only', 'test']);
    const what = describeRun('a temp git repo with tracked instrumenter/src/lib.rs (400 lines) and e2e/tests/a.spec.ts (500)', ['--only', 'test'], run);
    assert.equal(run.status, 0, `exit code should be 0: the only file over its limit is a source file\n${what}`);
    same(reportLines(run), [], `no over-limit lines expected\n${what}`);
  });

  it('prints one line with the number of files checked and exits 0 when nothing is over', () => {
    // Seven in-scope tracked files; the 900-line ones are all ignored.
    const files = [
      ['scripts/ok.mjs', linesOf(300)],
      ['scripts/empty.mjs', ''],
      ['instrumenter/src/lib.rs', linesOf(12)],
      ['instrumenter/tests/instrument.rs', linesOf(500, { trailingNewline: false })],
      ['e2e/support/page.ts', linesOf(499)],
      ['client/src/Services/useDebugger.ts', linesOf(134)],
      ['client/src/visualiser-debugger/Component/Control/Controls.tsx', linesOf(250)],
      ['client/src/Services/debugger/wasm/fixtures/huge.ts', linesOf(900)],
      ['client/src/Services/debugger/generated/huge.ts', linesOf(900)],
      ['instrumenter/tests/fixtures/README.md', linesOf(900)],
    ];
    const repo = makeRepo(files, [['scripts/untracked.mjs', linesOf(900)]]);
    const run = runCli(repo);
    const what = describeRun(
      'a temp git repo with 7 in-scope tracked files all within their limits (scripts/ok.mjs 300, scripts/empty.mjs 0, instrumenter/src/lib.rs 12, instrumenter/tests/instrument.rs 500 without a final newline, e2e/support/page.ts 499, client/src/Services/useDebugger.ts 134, Controls.tsx 250) plus ignored 900-line debugger fixtures/huge.ts, client/src/Services/useQueue.ts, a fixtures README.md and untracked scripts/untracked.mjs',
      [],
      run,
    );
    assert.equal(run.status, 0, `exit code should be 0 when no file is over its limit\n${what}`);
    assert.equal(run.lines.length, 1, `should print exactly one line; printed ${run.lines.length}\n${what}`);
    assert.match(run.lines[0] ?? '', /\b7\b/, `the line should say 7 files were checked\n${what}`);
  });

  for (const args of [['--bogus'], ['--only', 'everything'], ['source']]) {
    it(`exits 2 with a usage message for ${args.join(' ')}`, () => {
      const repo = makeRepo([['scripts/ok.mjs', linesOf(10)]]);
      const run = runCli(repo, args);
      const what = describeRun('a temp git repo with one 10-line scripts/ok.mjs', args, run);
      assert.equal(run.status, 2, `an unknown argument should exit with code 2\n${what}`);
      assert.match(run.output, /usage/i, `an unknown argument should print a usage message (containing "usage")\n${what}`);
    });
  }
});

// --- CLI against this repo -------------------------------------------------------

// No particular file has to be oversized here: the run must agree with the line
// counts of the files git lists, using the script's own inScope and kindOf
// (tested above). The temp-repo tests guarantee failures are reported.
describe('CLI against this repo', () => {
  const countLines = (path) => {
    const text = readFileSync(join(repoRoot, path), 'utf8');
    return text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  };

  for (const kind of ['test', 'source']) {
    it(`with --only ${kind}, reports exactly the ${kind} files over their limit, and exits 1 only if there are any`, () => {
      assert.ok(existsSync(scriptPath), `scripts/check-file-sizes.mjs does not exist, so the CLI can't be run (looked for ${scriptPath})`);
      const inScope = exported('inScope');
      const kindOf = exported('kindOf');
      const limitFor = exported('limitFor');
      const tracked = execFileSync('git', ['ls-files'], { cwd: repoRoot, encoding: 'utf8' }).split('\n').filter(Boolean);
      const expected = tracked
        .filter((path) => existsSync(join(repoRoot, path)) && inScope(path) && kindOf(path) === kind)
        .map((path) => ({ path, lines: countLines(path), limit: limitFor(path) }))
        .filter((f) => f.lines > f.limit)
        .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
        .map((f) => overLine(f.path, f.lines, f.limit, kind));
      const run = runCli(repoRoot, ['--only', kind]);
      const what = describeRun(`the real repo at ${repoRoot}`, ['--only', kind], run);
      same(
        reportLines(run),
        expected,
        `the over-limit lines should be every git-tracked file with inScope true and kindOf '${kind}' over its limit (counted from the working tree), sorted by path, and nothing else\n${what}`,
      );
      const code = expected.length ? 1 : 0;
      assert.equal(run.status, code, `exit code should be ${code}: ${expected.length} ${kind} files are over their limit\n${what}`);
    });
  }
});
