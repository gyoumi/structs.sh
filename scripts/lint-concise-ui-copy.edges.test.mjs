import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';

// Edge cases of the ESLint rule `concise-ui-copy` (scripts/lint-concise-ui-copy.mjs),
// kept apart from lint-concise-ui-copy.test.mjs so each file stays under the
// 500-line limit. Same setup and conventions: each case's name says what it
// checks and where the report should be, and RuleTester prints the expected
// and actual errors.

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

let rule;
let loadError;
try {
  rule = (await import('./lint-concise-ui-copy.mjs')).default;
} catch (error) {
  loadError = error;
}

const lines = (...rows) => rows.join('\n');

// 1-based line of the first occurrence of needle in code.
const lineOf = (code, needle) => {
  const index = code.indexOf(needle);
  if (index === -1) throw new Error(`test setup: ${needle} not found`);
  return code.slice(0, index).split('\n').length;
};

const narration = (code, needle) => ({ messageId: 'uiNarration', line: lineOf(code, needle) });

// Wrap JSX in a component so each case is a whole .tsx module.
const tsx = (...jsx) => lines('export function View() {', '  return (', ...jsx.map((row) => `    ${row}`), '  );', '}');

const valid = [
  {
    name: 'complementary guards {ready && <p>} {!ready && <p>} plus 1 plain <p> in a <section>: at most 2 <p> render, so no stackedParagraphs',
    code: tsx('<section><p>Intro.</p>{ready && <p>Go.</p>}{!ready && <p>Wait.</p>}</section>'),
  },
  {
    name: "sibling blocks do not merge: <div><p>Press</p> <p>Enter a value.</p></div> is not uiNarration ('Press' and 'Enter' are in different <p>)",
    code: tsx('<div><p>Press</p> <p>Enter a value.</p></div>'),
  },
  {
    name: 'a template literal does not join text across ${...}: {`Tap ${action} or click a tile.`} in a <p> is not uiNarration',
    code: tsx('<p>{`Tap ${action} or click a tile.`}</p>'),
  },
];

const invalid = [
  (() => {
    const code = tsx('<p className="sr-only" {...props}>Tap or click a tile.</p>');
    return {
      name: "a spread after className='sr-only' ({...props}) can override it, so the <p> is not exempt: 'Tap or click' is uiNarration",
      code,
      errors: [narration(code, 'Tap or click')],
    };
  })(),
  (() => {
    const code = tsx('<p>Press {showKey && <kbd>Enter</kbd>} to start.</p>');
    return {
      name: "a conditional inline <kbd> still reads as text: <p>Press {showKey && <kbd>Enter</kbd>} to start.</p> is uiNarration once, on the <p>",
      code,
      errors: [narration(code, '<p>')],
    };
  })(),
  (() => {
    const code = tsx('<section>', '  Press Enter to continue.', '  <p>Tap or click a tile.</p>', '</section>');
    return {
      name: "the parent's own text is still checked when a child block also matches: uiNarration twice, on <section> ('Press Enter') and on the <p> ('Tap or click')",
      code,
      errors: [narration(code, '<section>'), narration(code, '<p>')],
    };
  })(),
  (() => {
    const code = tsx('<p>{`Tap or click ${target}`}</p>');
    return {
      name: 'contrast with the ${action} case: {`Tap or click ${target}`} in a <p> is uiNarration (the phrase is whole before the ${...})',
      code,
      errors: [narration(code, 'Tap or click')],
    };
  })(),
];

if (loadError) {
  describe('concise-ui-copy edges', () => {
    for (const { name } of [...valid, ...invalid]) {
      it(name, () => assert.fail(`could not import scripts/lint-concise-ui-copy.mjs, so this case could not run: ${loadError.message}`));
    }
  });
} else {
  const ruleTester = new RuleTester({
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
  });
  ruleTester.run('concise-ui-copy edges', rule, { valid, invalid });
}
