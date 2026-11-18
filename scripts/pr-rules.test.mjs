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

  it('ignores the tag outside client, debugger and e2e', () => {
    const result = checkPr(pr({ addedLines: [{ path: 'scripts/pr-rules.mjs', line: 1, text: '[DEBUG-' }] }));
    assert.deepEqual(result, []);
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
  const debuggerChange = { status: 'M', path: 'debugger/src/serve.py' };

  it('rejects a debugger change with no e2e or pytest change', () => {
    assert.deepEqual(rulesHit(checkPr(pr({ files: [debuggerChange] }))), ['debugger-needs-test']);
  });

  it('accepts a debugger change that comes with an e2e test', () => {
    const files = [debuggerChange, { status: 'M', path: 'e2e/tests/stepping.spec.ts' }];
    assert.deepEqual(checkPr(pr({ files })), []);
  });

  it('accepts a debugger change that comes with a pytest', () => {
    const files = [debuggerChange, { status: 'A', path: 'debugger/src/debugger/test/test_new.py' }];
    assert.deepEqual(checkPr(pr({ files })), []);
  });

  it('accepts a known-failures entry as the test change', () => {
    const files = [debuggerChange, { status: 'M', path: 'e2e/known-failures/gdb.json' }];
    const result = checkPr(pr({ files, labels: new Set(['human-approved']) }));
    assert.deepEqual(result, []);
  });

  it('does not count an e2e change that is not a test', () => {
    const files = [debuggerChange, { status: 'M', path: 'e2e/README.md' }];
    assert.deepEqual(rulesHit(checkPr(pr({ files }))), ['debugger-needs-test']);
  });

  it('does not count a deleted test', () => {
    const files = [debuggerChange, { status: 'D', path: 'e2e/tests/stepping.spec.ts' }];
    const result = checkPr(pr({ files, labels: new Set(['removal-ok']) }));
    assert.deepEqual(rulesHit(result), ['debugger-needs-test']);
  });

  it('is waived by the no-test-needed label', () => {
    assert.deepEqual(checkPr(pr({ files: [debuggerChange], labels: new Set(['no-test-needed']) })), []);
  });
});

describe('large-removal', () => {
  it('rejects a source file cut to a fraction of its size', () => {
    const files = [{ status: 'M', path: 'client/src/visualiser-src/linked-list/controller.ts', oldLines: 200, newLines: 20 }];
    assert.deepEqual(rulesHit(checkPr(pr({ files }))), ['large-removal']);
  });

  it('rejects an emptied file even when it was small', () => {
    const files = [{ status: 'M', path: 'e2e/support/test.ts', oldLines: 12, newLines: 0 }];
    assert.deepEqual(rulesHit(checkPr(pr({ files }))), ['large-removal']);
  });

  it('allows ordinary edits and small files', () => {
    const files = [
      { status: 'M', path: 'client/src/App.tsx', oldLines: 200, newLines: 150 },
      { status: 'M', path: 'client/src/utils/url.ts', oldLines: 20, newLines: 4 },
    ];
    assert.deepEqual(checkPr(pr({ files })), []);
  });

  it('rejects deleted test files', () => {
    const files = [{ status: 'D', path: 'e2e/tests/stepping.spec.ts' }];
    assert.deepEqual(rulesHit(checkPr(pr({ files }))), ['large-removal']);
  });

  it('rejects a test moved out of the test folders', () => {
    const files = [{ status: 'R', path: 'e2e/disabled/stepping.spec.ts', oldPath: 'e2e/tests/stepping.spec.ts' }];
    assert.deepEqual(rulesHit(checkPr(pr({ files }))), ['large-removal']);
  });

  it('allows a test moved within the test folders', () => {
    const files = [{ status: 'R', path: 'e2e/tests/steps/stepping.spec.ts', oldPath: 'e2e/tests/stepping.spec.ts' }];
    assert.deepEqual(checkPr(pr({ files })), []);
  });

  it('rejects deleted Vitest and instrumenter tests', () => {
    const files = [
      { status: 'D', path: 'client/src/Services/debugger/wasm/recording.test.ts' },
      { status: 'D', path: 'instrumenter/tests/instrument.rs' },
    ];
    assert.equal(checkPr(pr({ files })).filter((f) => f.rule === 'large-removal').length, 2);
  });

  it('rejects a Vitest test renamed so it no longer runs', () => {
    const files = [
      {
        status: 'R',
        path: 'client/src/Services/debugger/wasm/recording.ts.bak',
        oldPath: 'client/src/Services/debugger/wasm/recording.test.ts',
      },
    ];
    assert.deepEqual(rulesHit(checkPr(pr({ files }))), ['large-removal']);
  });

  it('rejects an instrumenter test file cut to a fraction of its size', () => {
    const files = [{ status: 'M', path: 'instrumenter/tests/instrument.rs', oldLines: 400, newLines: 40 }];
    assert.deepEqual(rulesHit(checkPr(pr({ files }))), ['large-removal']);
  });

  it('is waived by the removal-ok label', () => {
    const files = [{ status: 'D', path: 'e2e/tests/stepping.spec.ts' }];
    assert.deepEqual(checkPr(pr({ files, labels: new Set(['removal-ok']) })), []);
  });
});

describe('protected-paths', () => {
  it('rejects changes to CI, lint config and the known-failures list without human approval', () => {
    const files = [
      { status: 'M', path: '.github/workflows/e2e.yml' },
      { status: 'M', path: 'client/eslint.config.mjs' },
      { status: 'M', path: 'e2e/known-failures/wasm.json' },
      { status: 'M', path: 'debugger/nsjail_gdb.cfg' },
    ];
    const result = checkPr(pr({ files }));
    assert.equal(result.filter((f) => f.rule === 'protected-paths').length, 4);
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
