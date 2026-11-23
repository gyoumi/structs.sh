import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { inScope, kindOf, limitFor, oversized } from './check-file-sizes.mjs';

const fmt = (value) => JSON.stringify(value);

describe('inScope: all code files by default', () => {
  const included = [
    'client/src/App.tsx',
    'client/src/daily/Daily.tsx',
    'client/src/daily/puzzle.ts',
    'client/src/daily/puzzle.test.ts',
    'client/src/landing/Hero.tsx',
    'client/src/visualiser/Stage.tsx',
    'client/src/Services/puzzles/puzzles.ts',
    'client/src/Services/puzzles/puzzles.test.ts',
    'client/src/visualiser-src/controller/VisualiserController.ts',
    'client/src/visualiser-src/controller/TimelineTrack.ts',
    'client/src/visualiser-src/controller/operationArgs.ts',
    'client/src/test/FakeSession.ts',
    'crates/structs-puzzles/src/lib.rs',
    'crates/structs-puzzles/src/wire.rs',
    'crates/structs-puzzles/tests/quicksort.rs',
    'crates/structs-game-server/src/main.rs',
    'crates/structs-game-server/tests/api.rs',
    'instrumenter/build.rs',
    'crates/structs-puzzles/build.rs',
  ];

  for (const path of included) {
    it(`includes ${path}`, () => {
      assert.equal(inScope(path), true, `inScope(${fmt(path)}) should be true for every code file`);
    });
  }

  const excluded = [
    ['client/src/daily/Daily.module.css', 'a CSS module'],
    ['client/src/Services/puzzles/generated/puzzles.wasm', 'a generated wasm file'],
    ['client/src/Services/puzzles/generated/glue.ts', 'a file in generated/'],
    ['client/__mocks__/styleMock.js', 'a file in __mocks__/'],
    ['crates/structs-puzzles/Cargo.toml', 'a Cargo manifest'],
    ['crates/structs-puzzles/tests/fixtures/helper.rs', 'a file in fixtures/'],
    ['crates/structs-puzzles/src/generated/tables.rs', 'a file in generated/'],
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
    ['client/src/daily/puzzle.test.ts', 'test'],
    ['client/src/test/FakeSession.ts', 'test'],
    ['client/src/Services/puzzles/puzzles.ts', 'source'],
    ['client/src/Services/puzzles/puzzles.test.ts', 'test'],
    ['crates/structs-puzzles/src/lib.rs', 'source'],
    ['crates/structs-puzzles/tests/quicksort.rs', 'test'],
    ['crates/structs-puzzles/tests/common/mod.rs', 'test'],
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
      { path: 'client/src/Services/puzzles/puzzles.test.ts', lines: 500 },
      { path: 'client/src/daily/puzzle.test.ts', lines: 501 },
      { path: 'crates/structs-puzzles/src/lib.rs', lines: 301 },
      { path: 'crates/structs-puzzles/tests/quicksort.rs', lines: 501 },
    ];
    assert.deepStrictEqual(oversized(files, {}), [
      { path: 'client/src/App.tsx', lines: 301, limit: 300, kind: 'source' },
      { path: 'client/src/daily/DailyCards.tsx', lines: 301, limit: 300, kind: 'source' },
      { path: 'client/src/daily/puzzle.test.ts', lines: 501, limit: 500, kind: 'test' },
      { path: 'crates/structs-puzzles/src/lib.rs', lines: 301, limit: 300, kind: 'source' },
      { path: 'crates/structs-puzzles/tests/quicksort.rs', lines: 501, limit: 500, kind: 'test' },
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
