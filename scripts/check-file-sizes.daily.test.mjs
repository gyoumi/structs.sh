import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inScope, kindOf, limitFor, oversized } from './check-file-sizes.mjs';

const fmt = (value) => JSON.stringify(value);

describe('inScope: all code files by default', () => {
  const included = [
    'client/src/App.tsx',
    'client/src/daily/Daily.tsx',
    'client/src/daily/challenge.ts',
    'client/src/daily/challenge.test.ts',
    'client/src/landing/Hero.tsx',
    'client/src/visualiser/Stage.tsx',
    'client/src/Services/challenges/challenges.ts',
    'client/src/Services/challenges/challenges.test.ts',
    'client/src/visualiser-src/controller/VisualiserController.ts',
    'client/src/visualiser-src/controller/TimelineTrack.ts',
    'client/src/visualiser-src/controller/operationArgs.ts',
    'client/src/test/FakeSession.ts',
    'game-server/challenges/src/lib.rs',
    'game-server/challenges/src/wire.rs',
    'game-server/challenges/tests/quicksort.rs',
    'game-server/server/src/main.rs',
    'game-server/server/tests/api.rs',
    'instrumenter/build.rs',
    'game-server/challenges/build.rs',
  ];

  for (const path of included) {
    it(`includes ${path}`, () => {
      assert.equal(inScope(path), true, `inScope(${fmt(path)}) should be true for every code file`);
    });
  }

  const excluded = [
    ['client/src/daily/Daily.module.css', 'a CSS module'],
    ['client/src/Services/challenges/generated/challenges.wasm', 'a generated wasm file'],
    ['client/src/Services/challenges/generated/glue.ts', 'a file in generated/'],
    ['client/__mocks__/styleMock.js', 'a file in __mocks__/'],
    ['game-server/challenges/Cargo.toml', 'a Cargo manifest'],
    ['game-server/challenges/tests/fixtures/helper.rs', 'a file in fixtures/'],
    ['game-server/challenges/src/generated/tables.rs', 'a file in generated/'],
    ['crates/README.md', 'a markdown file'],
  ];

  for (const [path, why] of excluded) {
    it(`excludes ${path} (${why})`, () => {
      assert.equal(inScope(path), false, `inScope(${fmt(path)}) should be false (${why})`);
    });
  }
});

describe('kindOf: daily game, client test helpers and crates workspace', () => {
  const cases = [
    ['client/src/App.tsx', 'source'],
    ['client/src/daily/Daily.tsx', 'source'],
    ['client/src/daily/challenge.test.ts', 'test'],
    ['client/src/test/FakeSession.ts', 'test'],
    ['client/src/Services/challenges/challenges.ts', 'source'],
    ['client/src/Services/challenges/challenges.test.ts', 'test'],
    ['game-server/challenges/src/lib.rs', 'source'],
    ['game-server/challenges/tests/quicksort.rs', 'test'],
    ['game-server/challenges/tests/common/mod.rs', 'test'],
  ];

  for (const [path, expected] of cases) {
    it(`calls ${path} a ${expected} file`, () => {
      assert.equal(kindOf(path), expected, `kindOf(${fmt(path)}) should be '${expected}'`);
    });
  }
});

describe('oversized: default limits and legacy ceilings', () => {
  it('enforces 300-line source and 500-line test limits across all code files', () => {
    const files = [
      { path: 'client/src/App.tsx', lines: 301 },
      { path: 'client/src/daily/Daily.tsx', lines: 300 },
      { path: 'client/src/daily/DailyCards.tsx', lines: 301 },
      { path: 'client/src/Services/challenges/challenges.test.ts', lines: 500 },
      { path: 'client/src/daily/challenge.test.ts', lines: 501 },
      { path: 'game-server/challenges/src/lib.rs', lines: 301 },
      { path: 'game-server/challenges/tests/quicksort.rs', lines: 501 },
    ];
    assert.deepStrictEqual(oversized(files, {}), [
      { path: 'client/src/App.tsx', lines: 301, limit: 300, kind: 'source' },
      { path: 'client/src/daily/DailyCards.tsx', lines: 301, limit: 300, kind: 'source' },
      { path: 'client/src/daily/challenge.test.ts', lines: 501, limit: 500, kind: 'test' },
      { path: 'game-server/challenges/src/lib.rs', lines: 301, limit: 300, kind: 'source' },
      { path: 'game-server/challenges/tests/quicksort.rs', lines: 501, limit: 500, kind: 'test' },
    ]);
  });

  it('ratchets legacy oversized files at their ceiling so they cannot grow', () => {
    const legacy = 'client/src/visualiser-debugger/Component/FileTree/FS/IFileSystem.ts';
    const ceiling = limitFor(legacy);
    assert.equal(ceiling, 771);
    assert.deepStrictEqual(oversized([{ path: legacy, lines: ceiling }], {}), []);
    assert.deepStrictEqual(oversized([{ path: legacy, lines: ceiling + 1 }], {}), [
      { path: legacy, lines: ceiling + 1, limit: ceiling, kind: 'source' },
    ]);
  });
});
