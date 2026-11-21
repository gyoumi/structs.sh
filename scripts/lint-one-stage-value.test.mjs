import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';

// Tests of the ESLint rule `one-stage-value` (scripts/lint-one-stage-value.mjs):
// a thing that moves through stages keeps its stage in one value with a named
// type, not in several booleans that have to agree.
//
// Each case's name says what it checks and where the report should be, so a
// failure names its input. RuleTester prints the expected and actual errors.

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const MESSAGE =
  '{{names}} are separate boolean flags that have to agree. Give the stage one value with a named type (for example a union of string literals).';

// Load the rule lazily, so a missing module fails each case with a message
// instead of stopping the whole file.
let rule;
let loadError;
try {
  rule = (await import('./lint-one-stage-value.mjs')).default;
} catch (error) {
  loadError = error;
}

const lines = (...rows) => rows.join('\n');
const flags = (names, where) => ({ messageId: 'looseFlags', data: { names }, ...where });

const valid = [
  {
    name: 'interface with one boolean (ready) and non-boolean properties is not reported',
    code: 'interface Run { ready: boolean; count: number; name: string }',
  },
  {
    name: 'the recommended shape, a string-literal union stage plus one boolean, is not reported',
    code: lines("type Stage = 'loading' | 'ready' | 'ended';", 'interface Run { stage: Stage; visible: boolean }'),
  },
  {
    name: 'union tags typed as the literals true/false ({ ok: true; value: T } | { ok: false; error: string }) are not booleans',
    code: 'type Result<T> = { ok: true; value: T } | { ok: false; error: string };',
  },
  {
    name: 'interface whose two properties are typed as the literals true and false (a: true; b: false) is not reported',
    code: 'interface Tags { a: true; b: false }',
  },
  {
    name: 'each member of a union is judged alone: { ok: true; ready: boolean } | { ok: false; ended: boolean } has one boolean per literal',
    code: 'type R = { ok: true; ready: boolean } | { ok: false; ended: boolean };',
  },
  {
    name: 'interface methods returning boolean (isReady(): boolean; isEnded(): boolean) are not boolean properties',
    code: 'interface Run { isReady(): boolean; isEnded(): boolean }',
  },
  {
    name: 'function-typed properties returning boolean (isReady: () => boolean; isEnded: (at: number) => boolean) are not boolean properties',
    code: 'interface Run { isReady: () => boolean; isEnded: (at: number) => boolean }',
  },
  {
    name: 'class getters and methods returning boolean are not boolean properties',
    code: lines(
      'class Run {',
      '  get ready(): boolean { return true; }',
      '  get ended(): boolean { return false; }',
      '  isPaused(): boolean { return false; }',
      '}',
    ),
  },
  {
    name: 'class with one boolean property (ready = false) and ended initialised to an expression (this.count > 0), not a literal, is not reported',
    code: lines(
      'class Run {',
      '  ready = false;',
      '  count = 0;',
      '  ended = this.count > 0;',
      '  isDone(): boolean { return true; }',
      '}',
    ),
  },
  {
    name: 'boolean function parameters (ready: boolean, ended: boolean, paused = false) are not counted',
    code: 'function step(ready: boolean, ended: boolean, paused = false) { return ready && ended && paused; }',
  },
  {
    name: 'boolean constructor parameter properties (private ready: boolean, private ended: boolean) are function parameters, not counted',
    code: 'class Run { constructor(private ready: boolean, private ended: boolean) {} }',
  },
  {
    name: 'const booleans (const ready = false; const ended = true; const paused: boolean = false) are not counted, at top level or in a function',
    code: lines(
      'const ready = false;',
      'const ended = true;',
      'const paused: boolean = false;',
      'function step() {',
      '  const a = true;',
      '  const b: boolean = false;',
      '  return a && b;',
      '}',
    ),
  },
  {
    name: 'one boolean let in a function body and one in a nested if block are in different scopes, not reported',
    code: lines(
      'function step(go: number) {',
      '  let ready = false;',
      '  if (go) {',
      '    let ended = true;',
      '    return ended;',
      '  }',
      '  return ready;',
      '}',
    ),
  },
  {
    name: 'boolean lets in two sibling blocks ({ let a = true; } { let b = false; }) are in different scopes, not reported',
    code: lines('function step() {', '  { let a = true; }', '  { let b = false; }', '}'),
  },
  {
    name: 'one boolean let in each of two functions is not reported',
    code: lines('function one() { let ready = false; return ready; }', 'function two() { let ended = true; return ended; }'),
  },
  {
    name: 'lets that are neither annotated : boolean nor initialised to true/false (let ready = isReady(); let ended = !ready) are not counted',
    code: lines('function step(isReady: () => boolean) {', '  let ready = isReady();', '  let ended = !ready;', '  return ended;', '}'),
  },
  {
    name: 'a boolean let next to a number let and a const boolean (let ready = true; let count = 0; const done = false) is not reported',
    code: lines('function step() {', '  let ready = true;', '  let count = 0;', '  const done = false;', '  return [ready, count, done];', '}'),
  },
  {
    name: 'nested type literals are judged alone: interface Run { ready: boolean; stage: { ended: boolean } } has one boolean in each',
    code: 'interface Run { ready: boolean; stage: { ended: boolean } }',
  },
];

const invalid = [
  {
    name: "interface Run { ready: boolean; ended: boolean } is reported once on the interface (line 1, column 1) with names 'ready, ended'",
    code: 'interface Run { ready: boolean; ended: boolean }',
    errors: [flags('ready, ended', { type: 'TSInterfaceDeclaration', line: 1, column: 1 })],
  },
  {
    name: "export interface Run { ready: boolean; ended: boolean } is reported on the interface node itself (line 1, column 8, after 'export ')",
    code: 'export interface Run { ready: boolean; ended: boolean }',
    errors: [flags('ready, ended', { type: 'TSInterfaceDeclaration', line: 1, column: 8 })],
  },
  {
    name: "readonly ready: boolean and optional ended?: boolean both count as booleans: names 'ready, ended', on the interface (line 1, column 1)",
    code: lines('interface Run {', '  readonly ready: boolean;', '  ended?: boolean;', '}'),
    errors: [flags('ready, ended', { type: 'TSInterfaceDeclaration', line: 1, column: 1 })],
  },
  {
    name: "ready: boolean | undefined and ended: boolean | null both count as booleans: names 'ready, ended'",
    code: 'interface Run { ready: boolean | undefined; ended: boolean | null }',
    errors: [flags('ready, ended', { type: 'TSInterfaceDeclaration', line: 1, column: 1 })],
  },
  {
    name: "three booleans with a number between (paused, count: number, ended, failed?) give one report with names 'paused, ended, failed' in source order",
    code: 'interface Run { paused: boolean; count: number; ended: boolean; failed?: boolean }',
    errors: [flags('paused, ended, failed', { type: 'TSInterfaceDeclaration', line: 1, column: 1 })],
  },
  {
    name: "type alias type Run = { ready: boolean; ended: boolean } is reported on the type literal (line 1, column 12, the '{')",
    code: 'type Run = { ready: boolean; ended: boolean };',
    errors: [flags('ready, ended', { type: 'TSTypeLiteral', line: 1, column: 12 })],
  },
  {
    name: "a literal tag does not count: type Ok = { ok: true; ready: boolean; ended: boolean } has names 'ready, ended' (not ok)",
    code: 'type Ok = { ok: true; ready: boolean; ended: boolean };',
    errors: [flags('ready, ended', { type: 'TSTypeLiteral', line: 1, column: 11 })],
  },
  {
    name: "inline type literal in a variable annotation (const run: { ready: boolean; ended: boolean } = ...) is reported on the literal (line 1, column 12)",
    code: 'const run: { ready: boolean; ended: boolean } = { ready: false, ended: false };',
    errors: [flags('ready, ended', { type: 'TSTypeLiteral', line: 1, column: 12 })],
  },
  {
    name: "only the nested literal is reported for interface Run { stage: { ready: boolean; ended: boolean } }: on the literal (line 2, column 10), not the interface",
    code: lines('interface Run {', '  stage: { ready: boolean; ended: boolean };', '}'),
    errors: [flags('ready, ended', { type: 'TSTypeLiteral', line: 2, column: 10 })],
  },
  {
    name: "outer and nested containers are reported separately: interface (line 1, column 1) 'a, b' and its inner literal (line 4, column 10) 'c, d'",
    code: lines('interface Run {', '  a: boolean;', '  b: boolean;', '  inner: { c: boolean; d: boolean };', '}'),
    errors: [
      flags('a, b', { type: 'TSInterfaceDeclaration', line: 1, column: 1 }),
      flags('c, d', { type: 'TSTypeLiteral', line: 4, column: 10 }),
    ],
  },
  {
    name: "class Run { ready = false; ended = true } (no annotations, literal initialisers) is reported on the class (line 1, column 1)",
    code: lines('class Run {', '  ready = false;', '  ended = true;', '}'),
    errors: [flags('ready, ended', { type: 'ClassDeclaration', line: 1, column: 1 })],
  },
  {
    name: "class with private ready: boolean and ended = false (one annotated, one initialised) is reported on the class with names 'ready, ended'",
    code: lines('class Run {', '  private ready: boolean;', '  ended = false;', '  constructor() { this.ready = true; }', '}'),
    errors: [flags('ready, ended', { type: 'ClassDeclaration', line: 1, column: 1 })],
  },
  {
    name: "class with readonly ready?: boolean and ended: boolean | undefined is reported with names 'ready, ended'",
    code: lines('class Run {', '  readonly ready?: boolean;', '  ended: boolean | undefined;', '}'),
    errors: [flags('ready, ended', { type: 'ClassDeclaration', line: 1, column: 1 })],
  },
  {
    name: "class expression const Run = class { ready = false; ended = false } is reported on the class expression (line 1, column 13)",
    code: lines('const Run = class {', '  ready = false;', '  ended = false;', '};'),
    errors: [flags('ready, ended', { type: 'ClassExpression', line: 1, column: 13 })],
  },
  {
    name: "two boolean lets in a function (let ready = false; let ended: boolean) are reported on the second let (line 3, column 3)",
    code: lines('function step() {', '  let ready = false;', '  let ended: boolean;', '  return [ready, ended];', '}'),
    errors: [flags('ready, ended', { type: 'VariableDeclaration', line: 3, column: 3 })],
  },
  {
    name: "boolean lets paused, ended, failed (with let count = 0 and const done = false between) give one report on the second boolean let, ended (line 5, column 3)",
    code: lines(
      'function step() {',
      '  let paused = true;',
      '  let count = 0;',
      '  const done = false;',
      '  let ended = false;',
      '  let failed: boolean = false;',
      '  return [paused, count, done, ended, failed];',
      '}',
    ),
    errors: [flags('paused, ended, failed', { type: 'VariableDeclaration', line: 5, column: 3 })],
  },
  {
    name: "two boolean lets in a nested if block are reported on the second (line 5, column 5); the function body's one let (outer) is a separate scope",
    code: lines(
      'function step(go: number) {',
      '  let outer = true;',
      '  if (go) {',
      '    let a = true;',
      '    let b = false;',
      '    return a && b;',
      '  }',
      '  return outer;',
      '}',
    ),
    errors: [flags('a, b', { type: 'VariableDeclaration', line: 5, column: 5 })],
  },
  {
    name: "two boolean lets in an arrow function body are reported on the second let (line 3, column 3)",
    code: lines('const step = () => {', '  let ready = true;', '  let ended = false;', '  return ready && ended;', '};'),
    errors: [flags('ready, ended', { type: 'VariableDeclaration', line: 3, column: 3 })],
  },
  {
    name: "two boolean lets at module top level (let ready = false; let ended = false) are reported on the second let (line 2, column 1)",
    code: lines('let ready = false;', 'let ended = false;'),
    errors: [flags('ready, ended', { type: 'VariableDeclaration', line: 2, column: 1 })],
  },
  {
    name: "one let declaring two booleans (let ready = false, ended = false) counts as two let variables: names 'ready, ended' (location not checked)",
    code: lines('function step() {', '  let ready = false, ended = false;', '  return ready && ended;', '}'),
    errors: [flags('ready, ended')],
  },
  {
    name: "two boolean lets in a class method are reported on the second let (line 4, column 5); the class itself has no boolean properties",
    code: lines('class Run {', '  step() {', '    let a = true;', '    let b = false;', '    return a && b;', '  }', '}'),
    errors: [flags('a, b', { type: 'VariableDeclaration', line: 4, column: 5 })],
  },
];

describe('one-stage-value rule object', () => {
  it('default export is an ESLint rule object with create() and a looseFlags message worded as the spec says', () => {
    if (loadError) assert.fail(`could not import scripts/lint-one-stage-value.mjs: ${loadError.message}`);
    assert.equal(typeof rule, 'object', `scripts/lint-one-stage-value.mjs default export should be a rule object, got ${typeof rule}`);
    assert.equal(typeof rule.create, 'function', `the rule's create should be a function, got ${typeof rule?.create}`);
    assert.equal(
      rule.meta?.messages?.looseFlags,
      MESSAGE,
      `the rule's meta.messages.looseFlags text\n  expected: ${MESSAGE}\n  actual:   ${rule.meta?.messages?.looseFlags}`,
    );
  });
});

if (loadError) {
  describe('one-stage-value', () => {
    for (const { name } of [...valid, ...invalid]) {
      it(name, () => assert.fail(`could not import scripts/lint-one-stage-value.mjs, so this case could not run: ${loadError.message}`));
    }
  });
} else {
  const ruleTester = new RuleTester({ languageOptions: { parser: tseslint.parser } });
  ruleTester.run('one-stage-value', rule, { valid, invalid });
}
