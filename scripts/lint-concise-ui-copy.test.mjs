import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';

// Tests of the ESLint rule `concise-ui-copy` (scripts/lint-concise-ui-copy.mjs):
// visible UI copy stays short. A visible <p> holds at most 25 words and at most
// 2 sentences, a container holds at most 2 visible <p> children, and visible
// text does not narrate the controls ("tap or click", "press Enter", "you have
// 3 tries"). Text inside <details>, <article>, or a screen-reader-only element
// (className sr-only / visually-hidden / styles.srOnly) is exempt.
//
// Each case's name says what it checks and where the report should be, so a
// failure names its input. RuleTester prints the expected and actual errors.

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

// Load the rule lazily, so a missing module fails each case with a message
// instead of stopping the whole file.
let rule;
let loadError;
try {
  rule = (await import('./lint-concise-ui-copy.mjs')).default;
} catch (error) {
  loadError = error;
}

const lines = (...rows) => rows.join('\n');
// n plain words with no sentence ending: "word word word ...".
const words = (n) => Array.from({ length: n }, () => 'word').join(' ');

// Line and column (1-based, as ESLint reports them) of the nth (1-based)
// occurrence of needle in code.
const at = (code, needle, nth = 1) => {
  let index = -1;
  for (let i = 0; i < nth; i += 1) {
    index = code.indexOf(needle, index + 1);
    if (index === -1) throw new Error(`test setup: occurrence ${nth} of ${needle} not found`);
  }
  const before = code.slice(0, index).split('\n');
  return { line: before.length, column: before[before.length - 1].length + 1 };
};

const long = (code, needle = '<p', nth = 1) => ({ messageId: 'longParagraph', type: 'JSXElement', ...at(code, needle, nth) });
const stacked = (code, nth) => ({ messageId: 'stackedParagraphs', type: 'JSXElement', ...at(code, '<p', nth) });
const narration = (code, needle) => ({ messageId: 'uiNarration', line: at(code, needle).line });

// Wrap JSX in a component so each case is a whole .tsx module.
const tsx = (...jsx) => lines('export function View() {', '  return (', ...jsx.map((row) => `    ${row}`), '  );', '}');

const valid = [
  {
    name: 'a short <p> (7 words, 1 sentence) is not reported',
    code: tsx('<p>Swap two numbers to sort the row.</p>'),
  },
  {
    name: 'a <p> of exactly 25 words and no sentence ending is not reported (the limit is more than 25)',
    code: tsx(`<p>${words(25)}</p>`),
  },
  {
    name: 'a <p> of exactly 2 sentences is not reported (the limit is more than 2)',
    code: tsx('<p>Sort the row. Fewer swaps score higher.</p>'),
  },
  {
    name: "the dot inside structs.sh is not a sentence end: 'Practise on structs.sh daily. A new puzzle opens at midnight.' is 2 sentences",
    code: tsx('<p>Practise on structs.sh daily. A new puzzle opens at midnight.</p>'),
  },
  {
    name: "'?' and '!' end sentences, but two of them ('Ready? Go!') are only 2 sentences",
    code: tsx('<p>Ready? Go!</p>'),
  },
  {
    name: 'exactly 2 visible <p> in a <section> (lede + pivot rule) is not reported',
    code: tsx('<section>', '  <h2>Quick sort</h2>', '  <p>Pick a pivot and split the row.</p>', '  <p>Smaller values go left.</p>', '</section>'),
  },
  {
    name: '2 visible <p> plus a className={styles.srOnly} <p> in one <section> is not reported (srOnly does not count)',
    code: tsx(
      '<section>',
      '  <p>Pick a pivot.</p>',
      '  <p>Smaller values go left.</p>',
      '  <p className={styles.srOnly}>The pivot is highlighted in orange.</p>',
      '</section>',
    ),
  },
  {
    name: "2 visible <p> plus className='sr-only' and className='visually-hidden' <p> in one <div> is not reported",
    code: tsx(
      '<div>',
      '  <p className="sr-only">Board, 5 by 5.</p>',
      '  <p>Pick a pivot.</p>',
      '  <p className="visually-hidden">Focus starts on the first tile.</p>',
      '  <p>Smaller values go left.</p>',
      '</div>',
    ),
  },
  {
    name: '<p> children are counted per direct parent: a <section> with 2 <p> and a nested <div> with 2 <p> is not reported',
    code: tsx('<section>', '  <p>One.</p>', '  <p>Two.</p>', '  <div>', '    <p>Three.</p>', '    <p>Four.</p>', '  </div>', '</section>'),
  },
  {
    name: "a long <p> (over 25 words, 3+ sentences) and 'Press Enter or Space' inside <details><summary>Keyboard controls</summary> are not reported",
    code: tsx(
      '<details>',
      '  <summary>Keyboard controls</summary>',
      '  <p>',
      '    Press Enter or Space to select a tile. Use the arrow keys to move between tiles in the row.',
      '    Press Escape to clear the selection. Tap or click a tile to pick it with a pointer instead of the keyboard.',
      '  </p>',
      '</details>',
    ),
  },
  {
    name: 'a long <p> nested deeper inside <details> (details > div > p) is still exempt',
    code: tsx('<details>', '  <summary>More</summary>', '  <div>', `    <p>${words(40)}. Two. Three. Four.</p>`, '  </div>', '</details>'),
  },
  {
    name: 'more than 2 <p> and long <p> inside <article> are not reported',
    code: tsx(
      '<article>',
      '  <h1>How merge sort works</h1>',
      `  <p>${words(30)}.</p>`,
      '  <p>Split the row in half. Sort each half. Merge the halves back together.</p>',
      '  <p>Merging takes linear time.</p>',
      '  <p>You have 3 tries to guess the next merge.</p>',
      '</article>',
    ),
  },
  {
    name: 'a long className={styles.srOnly} <p> (over 25 words, 3 sentences) is not reported',
    code: tsx(`<p className={styles.srOnly}>${words(30)}. Press Enter to select. Tap or click to swap.</p>`),
  },
  {
    name: "narration inside a className='sr-only' <span> ('Press Enter to select') is not reported",
    code: tsx('<span className="sr-only">Press Enter to select.</span>'),
  },
  {
    name: 'a <p> whose only content is a dynamic expression ({message}) cannot be counted and is not reported',
    code: tsx('<p>{message}</p>'),
  },
  {
    name: 'a short <p> mixing text and dynamic expressions ({count} moves, {best} best) is not reported',
    code: tsx('<p>{count} moves so far. Your best is {best}.</p>'),
  },
  {
    name: "a plain 'Tap to start' (not 'tap or click') is not narration",
    code: tsx('<p>Tap to start</p>'),
  },
  {
    name: "'Press the pivot' and 'You have solved 3 puzzles' do not match the narration phrases",
    code: tsx('<div>', '  <p>Press the pivot to lock it.</p>', '  <span>You have solved 3 puzzles.</span>', '</div>'),
  },
];

const invalid = [
  (() => {
    const code = tsx(`<p>${words(26)}</p>`);
    return {
      name: 'a <p> of 26 words with no sentence ending is longParagraph, on the <p> (line 3)',
      code,
      errors: [long(code)],
    };
  })(),
  (() => {
    const code = tsx(
      '<p>Each round shows a new row of numbers that you sort by swapping pairs, and the score counts every single swap you make. Fewer is better.</p>',
    );
    return {
      name: 'a <p> of 26 words in 2 sentences is longParagraph, on the <p>',
      code,
      errors: [long(code)],
    };
  })(),
  (() => {
    const code = tsx('<p>Sort the row. Swap pairs. Finish fast.</p>');
    return {
      name: 'a <p> of 3 short sentences (7 words) is longParagraph, on the <p>',
      code,
      errors: [long(code)],
    };
  })(),
  (() => {
    const code = tsx('<p>Ready? Set! Go.</p>');
    return {
      name: "'?', '!' and '.' all end sentences: 'Ready? Set! Go.' is 3 sentences, longParagraph",
      code,
      errors: [long(code)],
    };
  })(),
  (() => {
    const code = tsx(
      '<p>',
      '  Guess the hidden array in {MAX_TRIES} tries.{\' \'}Each guess shows which values are in place.',
      '  Use them to narrow it down.',
      '</p>',
    );
    return {
      name: "the old Daily.tsx body: JSX text joined through {' '} ('tries.{' '}Each') and around {MAX_TRIES} is 3 sentences, longParagraph on the <p>",
      code,
      errors: [long(code)],
    };
  })(),
  (() => {
    const code = tsx(`<p>{'${words(20)} '}${words(6)}</p>`);
    return {
      name: "a string-literal container's words count: {'20 words '} + 6 words of JSX text is 26 words, longParagraph",
      code,
      errors: [long(code)],
    };
  })(),
  (() => {
    const code = tsx('<p>{\'Sort the row.\'} Swap pairs.{\' \'}{\'Finish fast.\'}</p>');
    return {
      name: "sentences in string-literal containers count: {'Sort the row.'} Swap pairs.{' '}{'Finish fast.'} is 3 sentences, longParagraph",
      code,
      errors: [long(code)],
    };
  })(),
  (() => {
    const code = tsx('<section>', `  <p>${words(30)}</p>`, '</section>');
    return {
      name: 'a long <p> inside a <section> (not details/article) is longParagraph, on the <p> (line 4)',
      code,
      errors: [long(code)],
    };
  })(),
  (() => {
    const code = tsx('<p className="lede">One. Two. Three.</p>');
    return {
      name: "a className that is not sr-only ('lede') does not exempt the <p>: longParagraph",
      code,
      errors: [long(code)],
    };
  })(),
  (() => {
    const code = tsx('<section>', '  <p>Pick a pivot.</p>', '  <p>Smaller values go left.</p>', '  <p>Larger values go right.</p>', '</section>');
    return {
      name: 'a <section> with 3 visible <p> is stackedParagraphs, on the 3rd <p> (line 7)',
      code,
      errors: [stacked(code, 3)],
    };
  })(),
  (() => {
    const code = tsx('<div>', '  <p>One.</p>', '  <p>Two.</p>', '  <p>Three.</p>', '  <p>Four.</p>', '</div>');
    return {
      name: 'a <div> with 4 visible <p> gives stackedParagraphs on the 3rd and the 4th <p>',
      code,
      errors: [stacked(code, 3), stacked(code, 4)],
    };
  })(),
  (() => {
    const code = tsx('<>', '  <p>One.</p>', '  <p>Two.</p>', '  <p>Three.</p>', '</>');
    return {
      name: 'a <> fragment with 3 visible <p> is stackedParagraphs, on the 3rd <p>',
      code,
      errors: [stacked(code, 3)],
    };
  })(),
  (() => {
    const code = tsx(
      '<header>',
      '  <p className={styles.srOnly}>Hidden.</p>',
      '  <p>One.</p>',
      '  <h2>Title</h2>',
      '  <p>Two.</p>',
      '  <p>Three.</p>',
      '</header>',
    );
    return {
      name: 'srOnly <p> and non-<p> siblings are skipped: a <header> with srOnly <p>, then 3 visible <p>, reports on the 3rd visible (4th <p> overall)',
      code,
      errors: [stacked(code, 4)],
    };
  })(),
  (() => {
    const code = tsx('<aside>', `  <p>${words(30)}</p>`, '  <p>Two.</p>', '  <p>Three.</p>', '</aside>');
    return {
      name: 'a long first <p> in an <aside> of 3 <p> gives longParagraph on the 1st <p> and stackedParagraphs on the 3rd',
      code,
      errors: [long(code), stacked(code, 3)],
    };
  })(),
  (() => {
    const code = tsx('<p>Tap or click two numbers to swap them.</p>');
    return {
      name: "'Tap or click two numbers to swap them.' in a <p> is uiNarration",
      code,
      errors: [narration(code, 'Tap or click')],
    };
  })(),
  (() => {
    const code = tsx('<p>Click or tap a tile.</p>');
    return {
      name: "'Click or tap a tile.' in a <p> is uiNarration",
      code,
      errors: [narration(code, 'Click or tap')],
    };
  })(),
  (() => {
    const code = tsx('<p>Press Enter or Space to select.</p>');
    return {
      name: "'Press Enter or Space to select.' in a <p> outside <details> is uiNarration",
      code,
      errors: [narration(code, 'Press Enter')],
    };
  })(),
  (() => {
    const code = tsx('<p>You have 3 tries left.</p>');
    return {
      name: "'You have 3 tries left.' in a <p> is uiNarration",
      code,
      errors: [narration(code, 'You have')],
    };
  })(),
  (() => {
    const code = tsx('<div>You have 5 attempts left</div>');
    return {
      name: "'You have 5 attempts left' in a <div> is uiNarration",
      code,
      errors: [narration(code, 'You have')],
    };
  })(),
  (() => {
    const code = tsx('<span>press tab to move on</span>');
    return {
      name: "lower-case 'press tab' in a <span> is uiNarration (case-insensitive)",
      code,
      errors: [narration(code, 'press tab')],
    };
  })(),
  (() => {
    const code = tsx('<span>PRESS ESCAPE to close</span>');
    return {
      name: "upper-case 'PRESS ESCAPE' in a <span> is uiNarration (case-insensitive)",
      code,
      errors: [narration(code, 'PRESS ESCAPE')],
    };
  })(),
  (() => {
    const code = tsx('<div>', '  <p>TAP OR CLICK a tile.</p>', '</div>');
    return {
      name: 'narration in a <p> inside a <div> is reported once, not again for the <div>',
      code,
      errors: [narration(code, 'TAP OR CLICK')],
    };
  })(),
  (() => {
    const code = tsx('<section>', '  <p className="sr-only">Board.</p>', '  <p>Press Enter to swap.</p>', '</section>');
    return {
      name: 'a srOnly sibling does not exempt a visible <p>: Press Enter in the visible <p> is uiNarration',
      code,
      errors: [narration(code, 'Press Enter')],
    };
  })(),
];

describe('concise-ui-copy rule object', () => {
  it('default export is an ESLint rule object with create() and messages longParagraph, stackedParagraphs, uiNarration', () => {
    if (loadError) assert.fail(`could not import scripts/lint-concise-ui-copy.mjs: ${loadError.message}`);
    assert.equal(typeof rule, 'object', `scripts/lint-concise-ui-copy.mjs default export should be a rule object, got ${typeof rule}`);
    assert.equal(typeof rule.create, 'function', `the rule's create should be a function, got ${typeof rule?.create}`);
    for (const id of ['longParagraph', 'stackedParagraphs', 'uiNarration']) {
      assert.equal(
        typeof rule.meta?.messages?.[id],
        'string',
        `the rule's meta.messages.${id} should be a string, got ${typeof rule.meta?.messages?.[id]}`,
      );
    }
  });
});

if (loadError) {
  describe('concise-ui-copy', () => {
    for (const { name } of [...valid, ...invalid]) {
      it(name, () => assert.fail(`could not import scripts/lint-concise-ui-copy.mjs, so this case could not run: ${loadError.message}`));
    }
  });
} else {
  const ruleTester = new RuleTester({
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
  });
  ruleTester.run('concise-ui-copy', rule, { valid, invalid });
}
