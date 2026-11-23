import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';

let rule;
let loadError;
try {
  rule = (await import('./lint-one-stage-value.mjs')).default;
} catch (error) {
  loadError = error;
}

const lines = (...rows) => rows.join('\n');
const insideComponent = (...body) => lines('function View() {', ...body.map((row) => `  ${row}`), '  return null;', '}');

const MESSAGE_TAIL = ' are separate boolean flags that have to agree.';

function spanOfDeclarationText(code, declaration) {
  const index = code.indexOf(declaration);
  if (index === -1 || code.indexOf(declaration, index + 1) !== -1) {
    throw new Error(`test setup: ${JSON.stringify(declaration)} must occur exactly once in the case's code`);
  }
  const before = code.slice(0, index).split('\n');
  const line = before.length;
  const column = before.at(-1).length + 1;
  const inside = declaration.split('\n');
  const endLine = line + inside.length - 1;
  const endColumn = inside.length === 1 ? column + declaration.length : inside.at(-1).length + 1;
  return { line, column, endLine, endColumn };
}

const report = (code, names, declaration) => ({ names, nodeType: 'VariableDeclaration', ...spanOfDeclarationText(code, declaration) });

function lint(code) {
  const linter = new Linter();
  const config = [
    {
      files: ['**/*.tsx'],
      languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { structs: { rules: { 'one-stage-value': rule } } },
      rules: { 'structs/one-stage-value': 'error' },
    },
  ];
  return linter.verify(code, config, 'View.tsx').map((message) => {
    if (message.ruleId !== 'structs/one-stage-value') return { parseOrConfigError: message.message, line: message.line };
    const tail = message.message.indexOf(MESSAGE_TAIL);
    return {
      names: tail === -1 ? `(message not in the looseFlags wording: ${message.message})` : message.message.slice(0, tail),
      nodeType: message.nodeType,
      line: message.line,
      column: message.column,
      endLine: message.endLine,
      endColumn: message.endColumn,
    };
  });
}

const numbered = (code) =>
  code
    .split('\n')
    .map((row, i) => `    ${String(i + 1).padStart(2)} | ${row}`)
    .join('\n');
const show = (reports) => (reports.length === 0 ? '    (none)' : reports.map((r) => `    ${JSON.stringify(r)}`).join('\n'));

function check({ name, code, expected }) {
  if (loadError) assert.fail(`could not import scripts/lint-one-stage-value.mjs, so this case could not run: ${loadError.message}`);
  const received = lint(code);
  assert.deepEqual(
    received,
    expected,
    [
      `one-stage-value on this code: ${name}`,
      numbered(code),
      `  expected ${expected.length} report(s):`,
      show(expected),
      `  received ${received.length} report(s):`,
      show(received),
    ].join('\n'),
  );
}

const cases = [];
const reported = (name, code, ...reports) => cases.push({ name, code, expected: reports.map((r) => report(code, ...r)) });
const accepted = (name, code) => cases.push({ name, code, expected: [] });

{
  const code = insideComponent('const [open, setOpen] = useState(false);', 'const [busy, setBusy] = useState(true);');
  reported(
    "two useState with literal false/true (const [open, setOpen] = useState(false); const [busy, setBusy] = useState(true)): names 'open, busy', on the second declaration",
    code,
    ['open, busy', 'const [busy, setBusy] = useState(true);'],
  );
}
{
  const code = insideComponent('const [ready, setReady] = useState<boolean>(load());', 'const [ended, setEnded] = useState<boolean>(check());');
  reported(
    "useState<boolean>(call()) twice counts by the type argument alone: names 'ready, ended', on the second declaration",
    code,
    ['ready, ended', 'const [ended, setEnded] = useState<boolean>(check());'],
  );
}
{
  const code = insideComponent(
    'const [ready, setReady] = useState<boolean | undefined>(undefined);',
    'const [ended, setEnded] = useState<boolean | null>(null);',
  );
  reported(
    "useState<boolean | undefined>(undefined) and useState<boolean | null>(null) count like boolean | undefined/null annotations: names 'ready, ended'",
    code,
    ['ready, ended', 'const [ended, setEnded] = useState<boolean | null>(null);'],
  );
}
{
  const code = insideComponent('const [ready, setReady] = useState<boolean>(() => read());', 'const [ended, setEnded] = useState(false);');
  reported(
    "a lazy initialiser with a boolean type argument (useState<boolean>(() => read())) counts: with useState(false), names 'ready, ended'",
    code,
    ['ready, ended', 'const [ended, setEnded] = useState(false);'],
  );
}
{
  const code = insideComponent('const [open, setOpen] = React.useState(false);', 'const [busy, setBusy] = React.useState<boolean>(initial);');
  reported(
    "React.useState(false) and React.useState<boolean>(initial) count like useState: names 'open, busy', on the second declaration",
    code,
    ['open, busy', 'const [busy, setBusy] = React.useState<boolean>(initial);'],
  );
}
{
  const code = insideComponent('const pending = useRef(false);', 'const mounted = useRef<boolean>(isMounted());');
  reported(
    "boolean refs useRef(false) and useRef<boolean>(isMounted()) count, named by the variable: names 'pending, mounted'",
    code,
    ['pending, mounted', 'const mounted = useRef<boolean>(isMounted());'],
  );
}
{
  const code = insideComponent('const pending = React.useRef(true);', 'const mounted = React.useRef<boolean | null>(null);');
  reported(
    "React.useRef(true) and React.useRef<boolean | null>(null) count: names 'pending, mounted', on the second declaration",
    code,
    ['pending, mounted', 'const mounted = React.useRef<boolean | null>(null);'],
  );
}
{
  const code = insideComponent('const open = useState(false);', 'const [busy, setBusy] = useState(true);');
  reported(
    "a non-destructured useState (const open = useState(false)) is named by the variable: with [busy] = useState(true), names 'open, busy'",
    code,
    ['open, busy', 'const [busy, setBusy] = useState(true);'],
  );
}
{
  const code = insideComponent('let [open, setOpen] = useState(false);', 'let busy = useState<boolean>(initial);');
  reported(
    "state declared with let counts once (let [open] = useState(false); let busy = useState<boolean>(initial)): names 'open, busy', not repeated",
    code,
    ['open, busy', 'let busy = useState<boolean>(initial);'],
  );
}

{
  const code = insideComponent('let ready = false;', 'const [open, setOpen] = useState(false);');
  reported(
    "a boolean let then a boolean state in one function body share the count: names 'ready, open', on the state's declaration",
    code,
    ['ready, open', 'const [open, setOpen] = useState(false);'],
  );
}
{
  const code = insideComponent('const [open, setOpen] = useState(false);', 'let ready: boolean = compute();');
  reported(
    "a boolean state then a boolean let in one function body: names 'open, ready' in source order, on the let",
    code,
    ['open, ready', 'let ready: boolean = compute();'],
  );
}
{
  const code = insideComponent(
    'const [open, setOpen] = useState(false);',
    'const [count, setCount] = useState(0);',
    'const pending = useRef(false);',
    'let ready = true;',
  );
  reported(
    "state, ref and let together (open, pending, ready, with useState(0) between) give one report: names 'open, pending, ready', on pending's declaration",
    code,
    ['open, pending, ready', 'const pending = useRef(false);'],
  );
}

accepted(
  'one boolean state in each of two components (View: open; Panel: busy) is not reported',
  lines(
    'function View() {',
    '  const [open, setOpen] = useState(false);',
    '  return null;',
    '}',
    'function Panel() {',
    '  const [busy, setBusy] = useState(true);',
    '  return null;',
    '}',
  ),
);
accepted(
  'a boolean state in a component and one in a nested function (a custom hook inside it) are separate scopes, not reported',
  insideComponent('const [open, setOpen] = useState(false);', 'function useInner() {', '  const [busy, setBusy] = useState(true);', '  return busy;', '}'),
);
{
  const code = insideComponent(
    'const [open, setOpen] = useState(false);',
    'const Inner = () => {',
    '  const [busy, setBusy] = useState(true);',
    '  const pending = useRef(false);',
    '  return busy && pending.current;',
    '};',
  );
  reported(
    "two flags in a nested arrow function are reported there alone: names 'busy, pending' (not open from the outer component), on pending's declaration",
    code,
    ['busy, pending', 'const pending = useRef(false);'],
  );
}

accepted(
  'useState(0) next to one boolean state (useState(false)) is not counted: not reported',
  insideComponent('const [open, setOpen] = useState(false);', 'const [count, setCount] = useState(0);'),
);
accepted(
  "useState<Stage>('idle') next to one boolean state is not counted: not reported",
  insideComponent("const [stage, setStage] = useState<Stage>('idle');", 'const [open, setOpen] = useState(false);'),
);
accepted(
  'useRef<HTMLInputElement>(null) next to one boolean state is not counted: not reported',
  insideComponent('const input = useRef<HTMLInputElement>(null);', 'const [open, setOpen] = useState(false);'),
);
accepted(
  'useState() with no argument and no type argument next to one boolean state is not counted: not reported',
  insideComponent('const [value, setValue] = useState();', 'const [open, setOpen] = useState(false);'),
);
accepted(
  "useState<boolean | 'auto'>('auto') is not a boolean type argument (not only boolean and nullish): with one boolean state, not reported",
  insideComponent("const [mode, setMode] = useState<boolean | 'auto'>('auto');", 'const [open, setOpen] = useState(false);'),
);
accepted(
  'an array pattern starting with a hole (const [, setOpen] = useState(false)) is not counted: with one boolean state, not reported',
  insideComponent('const [, setOpen] = useState(false);', 'const [busy, setBusy] = useState(true);'),
);
accepted(
  'an array pattern starting with a non-identifier (const [{ open }] = useState(false)) is not counted: with one boolean state, not reported',
  insideComponent('const [{ open }] = useState(false);', 'const [busy, setBusy] = useState(true);'),
);
accepted(
  'other calls with false (useFlag(false), useMemo(() => false, []), Boolean(false)) are not counted: with one boolean state, not reported',
  insideComponent(
    'const shown = useFlag(false);',
    'const hidden = useMemo(() => false, []);',
    'const off = Boolean(false);',
    'const [open, setOpen] = useState(false);',
  ),
);
accepted(
  'const booleans that are not hook calls (const a = false; const b: boolean = true) are not counted: with one boolean state, not reported',
  insideComponent('const a = false;', 'const b: boolean = true;', 'const [open, setOpen] = useState(false);'),
);

describe('one-stage-value counts boolean React state and refs', () => {
  for (const testCase of cases) it(testCase.name, () => check(testCase));
});
