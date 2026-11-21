import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

// Tests of scripts/report-new-comments.mjs: findNewComments, annotation, and
// the CLI run in a temporary git repo.

const scriptPath = fileURLToPath(new URL('./report-new-comments.mjs', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// Load the module lazily, so a missing module or export fails each test with a
// message. Importing must not run the CLI, so process.exit is trapped.
let mod;
let loadError;
{
  const realExit = process.exit;
  process.exit = (code) => {
    throw new Error(`importing scripts/report-new-comments.mjs called process.exit(${code}). Run the CLI only when the file is the entry point, not when a test imports it`);
  };
  try {
    mod = await import('./report-new-comments.mjs');
  } catch (error) {
    loadError = error;
  } finally {
    process.exit = realExit;
  }
}

function exported(name) {
  if (loadError) assert.fail(`could not import scripts/report-new-comments.mjs: ${loadError.message}`);
  const fn = mod[name];
  assert.equal(typeof fn, 'function', `scripts/report-new-comments.mjs should export a function ${name}, but ${name} is ${typeof fn}`);
  return fn;
}

const fmt = (value) => JSON.stringify(value);

const SRC = 'client/src/Services/debugger/wasm/run.ts';
const RS = 'instrumenter/src/lib.rs';

/** Added lines of one file, numbered from `start`. */
const added = (path, rows, start = 1) => rows.map((text, i) => ({ path, line: start + i, text }));

/** findNewComments(input) should return exactly the entries of `input` at `reportedLines` (their line numbers), in input order. */
function expectReported(input, reportedLines, what) {
  const findNewComments = exported('findNewComments');
  const expected = input.filter(({ line }) => reportedLines.includes(line)).map(({ path, line, text }) => ({ path, line, text }));
  const actual = findNewComments(input);
  const shown = input.map(({ path, line, text }) => `    ${path}:${line}  ${fmt(text)}`).join('\n');
  assert.deepStrictEqual(
    actual,
    expected,
    `findNewComments: ${what}\n  added lines:\n${shown}\n  expected: ${fmt(expected)}\n  actual:   ${fmt(actual)}`,
  );
}

/** Each text alone, as one added line of `path`: reported or not. */
function expectEach(path, texts, reported, why) {
  for (const text of texts) {
    expectReported([{ path, line: 7, text }], reported ? [7] : [], `${fmt(text)} in ${path} ${reported ? 'is' : 'is not'} a new plain comment (${why})`);
  }
}

describe('findNewComments: TypeScript and JavaScript source files', () => {
  it('reports a line starting with // or /* (also indented) and a // after code', () => {
    expectEach(SRC, ['// why this works', '    // indented why', '\t// tab-indented why', 'foo(); // why', '/* why */', '/* opens a block comment'], true, 'plain comment');
  });

  it('does not report API docs: /// and /** */', () => {
    expectEach(SRC, ['/// <reference types="vite/client" />', '/** Runs the program. */', '/**', '  /** indented doc */'], false, 'API doc or triple-slash directive');
  });

  it('reports //! and /*! in a .ts file: the spec excludes only /// and /** there (//! and /*! are excluded in .rs only)', () => {
    expectEach(SRC, ['//! bang note', '/*! bang note */'], true, 'only /// and /** are API docs in .ts');
  });

  it('does not report // inside a string or template literal', () => {
    expectEach(
      SRC,
      [
        "const url = 'https://example.com';",
        'const s = "a//b";',
        'const t = `${base}//path`;',
        "const q = 'it\\'s // still a string';",
        'const r = "say \\"//\\" here";',
        'fetch(`https://x.dev/${id}`, { mode: "cors" });',
      ],
      false,
      '// is inside a string',
    );
  });

  it('reports a // comment after a string that contains //', () => {
    expectEach(SRC, ["const url = 'https://example.com'; // why", 'const t = `a//b`; // why', 'const s = "x"; // why'], true, 'the comment after the string');
  });

  it('does not report code or blank lines', () => {
    expectEach(SRC, ['', '   ', 'const x = a / b / c;', 'export function run() {', '}', ' * not opened here'], false, 'no comment');
  });

  it('covers every scope source extension: .ts, .tsx, .mjs, .js', () => {
    for (const path of [
      'client/src/Services/useDebugger.ts',
      'client/src/visualiser-debugger/Component/Control/Controls.tsx',
      'scripts/check-pr.mjs',
      'scripts/tool.js',
    ]) {
      expectEach(path, ['// why', 'go(); // why', '/* why */'], true, 'in-scope source file');
      expectEach(path, ['/// doc', '/** doc */', "const u = 'https://x';"], false, 'not a plain comment');
    }
  });
});

describe('findNewComments: Rust source files', () => {
  it('reports // at the start or after code, and /* */', () => {
    expectEach(RS, ['// why', '    // indented why', 'let x = 1; // why', '/* why */', 'let s = "a"; // why'], true, 'plain Rust comment');
  });

  it("does not report Rust doc forms: ///, //!, /** */, /*! */", () => {
    expectEach(RS, ['/// Instruments a module.', '//! The instrumenter crate.', '/** Outer block doc. */', '/*! Inner block doc. */', '    /// indented doc'], false, 'Rust doc comment');
  });

  it('does not report // inside a Rust string', () => {
    expectEach(RS, ['let url = "https://example.com";', 'let s = "a // b";'], false, '// is inside a string');
  });

  it("reports a trailing // after code with lifetimes ('a is not a string opener)", () => {
    expectEach(RS, ["fn f<'a>(s: &'a str) -> &'a str { s } // why"], true, 'the comment after code with lifetimes');
  });
});

describe('findNewComments: lint and tool directives are not plain comments', () => {
  const directives = [
    '// eslint-disable-next-line no-console',
    '//eslint-disable-next-line no-console',
    '/* eslint-disable */',
    '/* eslint-enable */',
    '// eslint-enable no-console',
    '// @ts-expect-error: the wasm export is untyped',
    '// @ts-ignore',
    '// @ts-nocheck',
    '// prettier-ignore',
    '/* c8 ignore next */',
    '// c8 ignore start',
    '/* istanbul ignore next */',
    'console.log(x); // eslint-disable-line no-console',
  ];

  it('does not report directives in a .ts source file, at line start or after code', () => {
    expectEach(SRC, directives, false, 'lint or tool directive');
  });

  it('does not report a directive in a .rs source file ("in any language")', () => {
    expectEach(RS, ['// eslint-disable-next-line', '/* prettier-ignore */'], false, 'directive, in any language');
  });

  it('reports a comment that only mentions a tool ("// eslint is noisy here", "// ts-expect-error is not used")', () => {
    expectEach(SRC, ['// eslint is noisy here', '// ts-expect-error is not used'], true, 'its text does not start with a directive');
  });
});

describe('findNewComments: block comments spanning lines', () => {
  it('reports only the opening line of a new multi-line block comment', () => {
    const input = added(SRC, ['/* Explains', ' * more', '   foo(); // inside the block', '   // also inside', ' */', 'run();']);
    expectReported(input, [1], 'lines 2-5 are inside the block opened on line 1, so only line 1 is reported');
  });

  it('does not report lines inside a new /** doc block, even ones that look like // comments', () => {
    const input = added(SRC, ['/**', ' * Example:', '   // run(code)', '   foo(); // inside the doc', ' */', 'export function run() {}']);
    expectReported(input, [], 'everything is inside the /** doc block on lines 1-5');
  });

  it('does not report added continuation lines when the opening line is not new', () => {
    const input = added(SRC, [' * a new line inside an old block comment', ' * another', ' */'], 5);
    expectReported(input, [], 'lines 5-7 continue a block comment opened on an unchanged line, so nothing is new');
  });

  it('reports a // comment after a block comment has closed', () => {
    const input = added(SRC, ['/* a', '   b */', '// after the block', '/* one line */', 'foo(); // why']);
    expectReported(input, [1, 3, 4, 5], 'the block on lines 1-2 closes, so line 3 is a new comment; line 4 is a closed one-line block; line 5 is a trailing comment');
  });

  it('reports only the opening line of a Rust block comment', () => {
    const input = added(RS, ['/*', '   // inside', '   let x = 1; // inside', '*/', 'let y = 2; // after']);
    expectReported(input, [1, 5], 'lines 2-4 are inside the block opened on line 1; line 5 is after it closes');
  });

  it('keeps block state per file: a block left open in one file does not hide the next file\'s comment', () => {
    const input = [...added(SRC, ['run();', '/* opens and continues past the diff'], 10), ...added('scripts/check-pr.mjs', ['// why'], 1)];
    expectReported(input, [11, 1], `${SRC}:11 opens a block; scripts/check-pr.mjs:1 is another file, so its // why is reported`);
  });
});

describe('findNewComments: only scope source files', () => {
  const comments = ['// why', 'foo(); // why', '/* why */'];

  it('ignores test files in scope', () => {
    for (const path of [
      'client/src/Services/debugger/wasm/__tests__/x.test.ts',
      'client/src/Services/debugger/wasm/run.test.ts',
      'instrumenter/tests/instrument.rs',
      'e2e/support/debugger-page.ts',
      'scripts/check-pr.test.mjs',
    ]) {
      expectEach(path, comments, false, 'a test file, which the comment rule does not cover');
    }
  });

  it('ignores out-of-scope files', () => {
    for (const path of ['client/src/App.tsx', 'client/src/Services/debugger/wasm/generated/bindings.ts', 'instrumenter/tests/fixtures/prog.rs', 'docs/notes.md', 'scripts/notes.md']) {
      expectEach(path, comments, false, 'out of the size check\'s scope');
    }
  });

  it('returns { path, line, text } with the same values, in input order, across mixed files', () => {
    const input = [
      { path: 'client/src/App.tsx', line: 3, text: '// app' },
      { path: SRC, line: 40, text: '    // why, indented' },
      { path: 'client/src/Services/debugger/wasm/run.test.ts', line: 2, text: '// test' },
      { path: RS, line: 9, text: 'let x = 1; // rust why' },
      { path: SRC, line: 41, text: 'go();' },
      { path: 'scripts/check-pr.mjs', line: 1, text: '/* why */' },
    ];
    const findNewComments = exported('findNewComments');
    const expected = [input[1], input[3], input[5]].map((e) => ({ ...e }));
    const actual = findNewComments(input);
    assert.deepStrictEqual(actual, expected, `findNewComments on mixed files returns the 3 in-scope source comments in input order, text unchanged (indentation kept)\n  expected: ${fmt(expected)}\n  actual:   ${fmt(actual)}`);
  });

  it('returns [] for no added lines', () => {
    const actual = exported('findNewComments')([]);
    assert.deepStrictEqual(actual, [], `findNewComments([]) should be []; actual: ${fmt(actual)}`);
  });
});

// --- annotation ---------------------------------------------------------------

const MESSAGE =
  "Checkpoint 5 keeps only API docs, licence headers and notes about outside constraints in the debugger's code. If this explains our own code, say it with a name, type or shape instead (see the no-comments skill).";
const warning = (escapedPath, line) => `::warning file=${escapedPath},line=${line},title=New comment::${MESSAGE}`;

function expectAnnotation(entry, expected, what) {
  const actual = exported('annotation')(entry);
  assert.equal(actual, expected, `annotation(${fmt(entry)}): ${what}\n  expected: ${expected}\n  actual:   ${actual}`);
}

describe('annotation', () => {
  it('builds the ::warning command with file, line, title and the fixed message (commas in the message are not escaped)', () => {
    expectAnnotation({ path: SRC, line: 12, text: '// why' }, warning(SRC, 12), 'one workflow command, message unescaped because it has no %, \\r or \\n');
  });

  it('does not include the comment text, even when it has %, comma, colon or newline', () => {
    expectAnnotation({ path: RS, line: 3, text: '// 100%, really: yes\r\n' }, warning(RS, 3), 'the message is fixed; the text does not appear');
  });

  it('escapes , and : in the file property as %2C and %3A', () => {
    expectAnnotation({ path: 'scripts/a,b:c.mjs', line: 1, text: '// x' }, warning('scripts/a%2Cb%3Ac.mjs', 1), 'property values escape , and :');
  });

  it('escapes % first, so a literal %2C in a path becomes %252C', () => {
    expectAnnotation({ path: 'scripts/100%2C.mjs', line: 2, text: '// x' }, warning('scripts/100%252C.mjs', 2), '% becomes %25 before other escapes');
  });

  it('escapes \\r and \\n in the file property as %0D and %0A', () => {
    expectAnnotation({ path: 'scripts/a\r\nb.mjs', line: 4, text: '// x' }, warning('scripts/a%0D%0Ab.mjs', 4), 'carriage return and newline are escaped');
  });
});

describe('package.json', () => {
  it('has the report:comments script', () => {
    const scripts = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')).scripts ?? {};
    assert.equal(scripts['report:comments'], 'node scripts/report-new-comments.mjs', `root package.json scripts["report:comments"] should run the CLI; actual: ${fmt(scripts['report:comments'])}`);
  });
});

// --- CLI in a temporary git repo ------------------------------------------------

// The CLI runs from this worktree (node <worktree>/scripts/report-new-comments.mjs)
// with a temp repo as cwd. inScope is about repo-relative paths, so the scope
// applies to any repo; git is expected to run in the cwd, as check-pr.mjs does.

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

const gitEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};
delete gitEnv.GITHUB_ACTIONS;

const git = (cwd, ...args) => execFileSync('git', args, { cwd, env: gitEnv, encoding: 'utf8' }).trim();

function makeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'report-new-comments-'));
  tempDirs.push(root);
  git(root, 'init', '-q', '-b', 'main');
  return root;
}

/** Writes each [path, content] and commits them all; returns the commit sha. */
function commit(root, files, message) {
  for (const [path, content] of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--no-verify', '-m', message);
  return git(root, 'rev-parse', 'HEAD');
}

function runCli(cwd, base, head) {
  if (!existsSync(scriptPath)) assert.fail(`scripts/report-new-comments.mjs does not exist, so the CLI can't be run (looked for ${scriptPath})`);
  const args = [scriptPath, '--base', base, '--head', head];
  const result = spawnSync(process.execPath, args, { cwd, env: gitEnv, encoding: 'utf8' });
  const stdout = result.stdout ?? '';
  const stdoutLines = stdout.split('\n').filter((l) => l.trim() !== '');
  const quoted = (text) => text.split('\n').map((l) => `    | ${l}`).join('\n');
  const what = `\`node ${args.join(' ')}\` in ${cwd}\n  exit code: ${result.status}\n  stdout:\n${quoted(stdout)}\n  stderr:\n${quoted(result.stderr ?? '')}`;
  return { status: result.status, stdoutLines, annotations: stdoutLines.filter((l) => l.startsWith('::')), what };
}

const sorted = (list) => [...list].sort();
const lines = (...rows) => `${rows.join('\n')}\n`;
const NONE = "No new comments in the debugger's code.";
const some = (n) => `${n} new comment(s) in the debugger's code. Each needs a reviewer's OK.`;

describe('CLI in a temporary git repo', () => {
  it('prints an annotation per new comment in scope source files, then the count, and exits 0', () => {
    const repo = makeRepo();
    const base = commit(
      repo,
      [
        [SRC, lines('export function run() {', '  // old comment', '  return 1;', '}')],
        [RS, lines('pub fn f() {}')],
        ['client/src/App.tsx', lines('export const App = 1;')],
      ],
      'base',
    );
    const head = commit(
      repo,
      [
        [SRC, lines('export function run() {', '  // old comment', '  // new plain comment', "  const url = 'https://example.com';", '  const n = 2; // trailing why', '  /** doc */', '  // eslint-disable-next-line no-console', '  console.log(url, n);', '  return 1;', '}')],
        [RS, lines('/// doc', 'pub fn f() {}', '// rust why', 'pub fn g() {} // trailing rust')],
        ['client/src/Services/debugger/wasm/__tests__/x.test.ts', lines('// test comment', "it('x', () => {});")],
        ['client/src/App.tsx', lines('// app comment', 'export const App = 1;')],
        ['scripts/new-tool.mjs', lines('#!/usr/bin/env node', '// new file comment', 'console.log(1);')],
      ],
      'head',
    );
    const run = runCli(repo, base, head);
    const scenario =
      `base: ${SRC} with "// old comment" on line 2; head adds to it "// new plain comment" (line 3), a url string, "const n = 2; // trailing why" (line 5), a /** doc */ and an eslint directive; ` +
      `adds "// rust why" (line 3) and "pub fn g() {} // trailing rust" (line 4) to ${RS}; adds new scripts/new-tool.mjs with "// new file comment" on line 2; ` +
      'adds comments to the test file client/src/Services/debugger/wasm/__tests__/x.test.ts and the out-of-scope client/src/App.tsx';
    assert.equal(run.status, 0, `exit code should be 0 (comments never fail the run)\n  ${scenario}\n${run.what}`);
    const expected = [warning(SRC, 3), warning(SRC, 5), warning(RS, 3), warning(RS, 4), warning('scripts/new-tool.mjs', 2)];
    assert.deepStrictEqual(
      sorted(run.annotations),
      sorted(expected),
      `the ::warning lines on stdout (compared in sorted order; the spec doesn't fix the order)\n  ${scenario}\n  expected:\n    ${sorted(expected).join('\n    ')}\n${run.what}`,
    );
    assert.equal(run.stdoutLines.at(-1), some(5), `the last stdout line should be the summary for 5 new comments\n  ${scenario}\n${run.what}`);
  });

  it('diffs from the merge base: a comment the base branch removed after the fork is not reported as new', () => {
    const repo = makeRepo();
    commit(repo, [[SRC, lines('export function run() {', '  // kept comment', '  return 1;', '}')]], 'fork point');
    git(repo, 'checkout', '-q', '-b', 'feature');
    const head = commit(repo, [[SRC, lines('export function run() {', '  // kept comment', '  // head comment', '  return 1;', '}')]], 'feature adds a comment');
    git(repo, 'checkout', '-q', 'main');
    const base = commit(repo, [[SRC, lines('export function run() {', '  return 1;', '}')]], 'main removes the kept comment');
    const run = runCli(repo, base, head);
    const scenario = `fork point has "// kept comment" on line 2 of ${SRC}; --base (main) later removes it; --head (feature, from the fork point) adds "// head comment" on line 3`;
    assert.equal(run.status, 0, `exit code should be 0\n  ${scenario}\n${run.what}`);
    assert.deepStrictEqual(
      run.annotations,
      [warning(SRC, 3)],
      `only the head branch's comment is new (diff from the merge base, not base..head)\n  ${scenario}\n  expected: ${warning(SRC, 3)}\n${run.what}`,
    );
    assert.equal(run.stdoutLines.at(-1), some(1), `the last stdout line should be the summary for 1 new comment\n  ${scenario}\n${run.what}`);
  });

  it('prints only "No new comments" and exits 0 when no scope source file gains a comment', () => {
    const repo = makeRepo();
    const base = commit(repo, [[SRC, lines('export function run() {', '  // old comment', '  return 1;', '}')]], 'base');
    const head = commit(
      repo,
      [
        [SRC, lines('export function run() {', '  // old comment', "  const url = 'https://example.com';", '  /** doc */', '  return 1;', '}')],
        [RS, lines('//! crate doc', 'pub fn f() {}')],
        ['client/src/Services/debugger/wasm/__tests__/x.test.ts', lines('// test comment')],
        ['client/src/App.tsx', lines('// app comment')],
      ],
      'head',
    );
    const run = runCli(repo, base, head);
    const scenario = `head adds code, a url string and a /** doc */ to ${SRC}, a //! doc to ${RS}, and comments only to a test file and the out-of-scope client/src/App.tsx`;
    assert.equal(run.status, 0, `exit code should be 0\n  ${scenario}\n${run.what}`);
    assert.deepStrictEqual(run.annotations, [], `no ::warning lines expected\n  ${scenario}\n${run.what}`);
    assert.equal(run.stdoutLines.at(-1), NONE, `the last stdout line should be the no-comments summary\n  ${scenario}\n${run.what}`);
  });
});

// Lines added inside a block comment or template literal that the base already
// had: only the head file's full content shows they are not comments.
describe('CLI: added lines inside an unchanged block comment or template literal', () => {
  const blockBase = lines('export function run() {', '  /*', '   Explains the old thing.', '   More explanation.', '  */', '  return 1;', '}');
  const blockHead = (...after) =>
    lines('export function run() {', '  /*', '   Explains the old thing.', '   // looks like a comment', '   * starts with a star', '   More explanation.', '  */', ...after, '  return 1;', '}');

  function expectRun(baseFiles, headFiles, expected, scenario) {
    const repo = makeRepo();
    const base = commit(repo, baseFiles, 'base');
    const head = commit(repo, headFiles, 'head');
    const run = runCli(repo, base, head);
    assert.equal(run.status, 0, `exit code should be 0\n  ${scenario}\n${run.what}`);
    assert.deepStrictEqual(
      run.annotations,
      expected.map(([path, line]) => warning(path, line)),
      `the ::warning lines on stdout\n  ${scenario}\n  expected: ${expected.length ? expected.map(([p, l]) => `${p}:${l}`).join(', ') : 'none'}\n${run.what}`,
    );
    assert.equal(run.stdoutLines.at(-1), expected.length ? some(expected.length) : NONE, `the last stdout line should be the summary for ${expected.length} new comment(s)\n  ${scenario}\n${run.what}`);
  }

  it('does not report lines added inside a block comment the base already had', () => {
    expectRun(
      [[SRC, blockBase]],
      [[SRC, blockHead()]],
      [],
      `base ${SRC} has a /* ... */ block on lines 2-5; head adds "   // looks like a comment" (line 4) and "   * starts with a star" (line 5) inside it, so they are part of the old comment`,
    );
  });

  it('does not report a // line added inside a multi-line template literal the base already had', () => {
    const path = 'client/src/Services/debugger/wasm/usage.ts';
    expectRun(
      [[path, lines('export const usage = `', 'usage: run <file>', '`;')]],
      [[path, lines('export const usage = `', 'usage: run <file>', '// not a comment, part of the string', '`;')]],
      [],
      `base ${path} has a template literal on lines 1-3; head adds "// not a comment, part of the string" on line 3, inside the backticks`,
    );
  });

  it('control: reports a new // comment added right after that block comment closes', () => {
    expectRun(
      [[SRC, blockBase]],
      [[SRC, blockHead('  // new comment')]],
      [[SRC, 8]],
      `same as the block-comment case, plus "  // new comment" on line 8, right after the block's "*/" on line 7: only line 8 is a new comment`,
    );
  });
});
