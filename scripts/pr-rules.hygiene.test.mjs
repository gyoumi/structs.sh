import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkPr } from './pr-rules.mjs';
import { pr, rulesHit, show } from './pr-rules-test-kit.mjs';

// The rules about what a PR may contain: forbidden files, temporary debug
// lines, and agent config mixed with product changes.

describe('forbidden-files', () => {
  it('rejects lockfiles from other package managers anywhere in the repo', () => {
    const tracked = ['client/package-lock.json', 'yarn.lock', 'e2e/bun.lock'];
    const result = checkPr(pr({ tracked }));
    assert.deepEqual(
      result.filter((f) => f.rule === 'forbidden-files').map((f) => f.path),
      tracked,
      `tracked ${tracked.join(', ')}: each should hit forbidden-files. Got findings: ${show(result)}`,
    );
  });

  it('rejects .env files and TypeScript build caches, but allows .env.example', () => {
    const result = checkPr(pr({ tracked: ['debugger/.env', 'client/.env.local', 'client/tsconfig.tsbuildinfo', 'client/.env.example'] }));
    assert.deepEqual(
      result.map((f) => f.path),
      ['debugger/.env', 'client/.env.local', 'client/tsconfig.tsbuildinfo'],
      `tracked debugger/.env, client/.env.local, client/tsconfig.tsbuildinfo and client/.env.example: paths found (all but .env.example). Got findings: ${show(result)}`,
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
      `added .png files at the root, in e2e/, and in three image folders: paths found (the two outside the image folders). Got findings: ${show(result)}`,
    );
  });

  it('leaves a clean repo alone', () => {
    const result = checkPr(pr({ tracked: ['pnpm-lock.yaml', 'debugger/uv.lock', 'client/.env.example'] }));
    assert.deepEqual(result, [], `tracked pnpm-lock.yaml, debugger/uv.lock and client/.env.example should hit no rule. Got findings: ${show(result)}`);
  });
});

describe('debug-tags', () => {
  // The client row also lists the file as changed, as a real PR would.
  const productCode = [
    { added: { path: 'client/src/App.tsx', line: 12, text: "console.log('[DEBUG-a1b2] state', s);" }, files: [{ status: 'M', path: 'client/src/App.tsx' }] },
    { added: { path: 'e2e/support/debugger-page.ts', line: 3, text: "console.log('[DEBUG-c3d4]');" }, files: [] },
    { added: { path: 'instrumenter/src/lib.rs', line: 8, text: 'eprintln!("[DEBUG-e5f6] {x}");' }, files: [] },
  ];
  for (const { added, files } of productCode) {
    it(`rejects a temporary [DEBUG-xxxx] line added to ${added.path}`, () => {
      const result = checkPr(pr({ files, addedLines: [added] }));
      assert.deepEqual(
        result.map((f) => `${f.rule} ${f.path}`),
        [`debug-tags ${added.path}`],
        `a [DEBUG- line added in ${added.path} should hit debug-tags only. Got findings: ${show(result)}`,
      );
    });
  }

  it('reports every file with the tag in a PR, not just the first', () => {
    const addedLines = productCode.slice(1).map(({ added }) => added);
    const result = checkPr(pr({ addedLines }));
    assert.deepEqual(
      result.map((f) => `${f.rule} ${f.path}`),
      ['debug-tags e2e/support/debugger-page.ts', 'debug-tags instrumenter/src/lib.rs'],
      `[DEBUG- lines added in e2e/support/debugger-page.ts and instrumenter/src/lib.rs in one PR should each hit debug-tags. Got findings: ${show(result)}`,
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
    assert.deepEqual(
      rulesHit(result),
      ['agent-config-alone'],
      `.claude/skills/develop/SKILL.md and client/src/App.tsx changed (human-approved) should hit agent-config-alone only. Got findings: ${show(result)}`,
    );
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
    assert.deepEqual(
      result,
      [],
      `only .claude/skills/git-clean-commit/SKILL.md deleted and skills-lock.json changed (human-approved) should hit no rule. Got findings: ${show(result)}`,
    );
  });
});
