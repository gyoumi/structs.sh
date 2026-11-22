const MAX_WORDS = 25;
const MAX_SENTENCES = 2;
const MAX_STACKED = 2;

const EXEMPT_CONTAINERS = new Set(['details', 'article']);
// Phrasing elements whose text reads as part of the surrounding sentence.
const INLINE_ELEMENTS = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var']);
// Separates text that never reads as one phrase (block children, `${...}`, unknown values).
// A control character, so ordinary line breaks in JSX text stay plain whitespace.
const BREAK = '\0';
// Cap on the rendered variants tracked per element, so nested ternaries stay cheap.
const MAX_VARIANTS = 8;
const SR_ONLY_TOKEN = /^(?:sr[-_]?only|visually[-_]?hidden)$/i;
const NARRATION = [
  /\b(?:tap or click|click or tap)\b/i,
  /\bpress\s+(?:enter|space|tab|escape)\b/i,
  /\byou have\s+\d+\s+(?:tries|attempts)\b/i,
];
// Wrappers that sit between a JSX parent and the JSX it renders.
const TRANSPARENT_PARENTS = new Set(['JSXExpressionContainer', 'LogicalExpression', 'ConditionalExpression']);

const elementName = (node) => (node?.type === 'JSXElement' && node.openingElement.name.type === 'JSXIdentifier' ? node.openingElement.name.name : null);

const hasSrOnlyToken = (text) => text.split(/\s+/).some((token) => SR_ONLY_TOKEN.test(token));

// True only when the class expression always applies a screen-reader-only class.
function alwaysSrOnly(expr) {
  switch (expr?.type) {
    case 'Literal':
      return typeof expr.value === 'string' && hasSrOnlyToken(expr.value);
    case 'TemplateLiteral':
      // Static parts only; a token touching `${...}` is not a whole class name.
      return expr.quasis.some((quasi, index) => {
        const text = quasi.value.cooked ?? quasi.value.raw;
        const tokens = text.split(/\s+/);
        return tokens.some((token, i) => {
          const glued = (i === 0 && index > 0) || (i === tokens.length - 1 && !quasi.tail);
          return !glued && SR_ONLY_TOKEN.test(token);
        });
      });
    case 'Identifier':
      return SR_ONLY_TOKEN.test(expr.name);
    case 'MemberExpression': {
      const { property } = expr;
      const name = expr.computed ? (property.type === 'Literal' ? property.value : null) : property.name;
      return typeof name === 'string' && SR_ONLY_TOKEN.test(name);
    }
    case 'ConditionalExpression':
      return alwaysSrOnly(expr.consequent) && alwaysSrOnly(expr.alternate);
    case 'LogicalExpression':
      return expr.operator !== '&&' && alwaysSrOnly(expr.left) && alwaysSrOnly(expr.right);
    default:
      return false;
  }
}

function isSrOnly(element) {
  // The last of className or a {...spread} wins, and a spread may set any class.
  let value = null;
  for (const attr of element.openingElement.attributes) {
    if (attr.type === 'JSXSpreadAttribute') value = null;
    else if (attr.name.type === 'JSXIdentifier' && attr.name.name === 'className') value = attr.value;
  }
  if (!value) return false;
  return alwaysSrOnly(value.type === 'JSXExpressionContainer' ? value.expression : value);
}

const isExemptSelf = (element) => EXEMPT_CONTAINERS.has(elementName(element)) || isSrOnly(element);

// Copy in <details>/<article>, or hidden from sighted users, is not checked.
function isExempt(element) {
  for (let node = element; node; node = node.parent) {
    if (node.type === 'JSXElement' && isExemptSelf(node)) return true;
  }
  return false;
}

const isInline = (element) => INLINE_ELEMENTS.has(elementName(element)) && !isExemptSelf(element);

const unique = (list) => [...new Set(list)].slice(0, MAX_VARIANTS);
// One of the lists renders: the union of their variants.
const either = (...lists) => unique(lists.flat());
// Each list renders in turn: every combination of their variants.
const sequence = (lists) => lists.reduce((acc, list) => unique(acc.flatMap((a) => list.map((b) => a + b))), ['']);

// Possible rendered static texts of an expression; `all` also reads non-inline elements.
function expressionTexts(expr, all) {
  switch (expr?.type) {
    case 'Literal':
      return [typeof expr.value === 'string' ? expr.value : BREAK];
    case 'TemplateLiteral':
      return [expr.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(BREAK)];
    case 'JSXElement':
      return (all ? !isExemptSelf(expr) : isInline(expr)) ? staticTexts(expr, all) : [BREAK];
    case 'JSXFragment':
      return staticTexts(expr, all);
    case 'JSXEmptyExpression':
      return [''];
    case 'LogicalExpression':
      // `&&` checks the rendered case; `||` and `??` render one side or the other.
      if (expr.operator === '&&') return expressionTexts(expr.right, all);
      return either(expressionTexts(expr.left, all), expressionTexts(expr.right, all));
    case 'ConditionalExpression':
      return either(expressionTexts(expr.consequent, all), expressionTexts(expr.alternate, all));
    default:
      return [BREAK];
  }
}

// Possible rendered static texts of an element's children, skipping exempt ones.
// Block children become a BREAK unless `all` is set (used for word counts).
function staticTexts(node, all = false) {
  return sequence(
    node.children.map((child) => {
      if (child.type === 'JSXText') return [child.value];
      if (child.type === 'JSXExpressionContainer') return expressionTexts(child.expression, all);
      return expressionTexts(child, all);
    }),
  );
}

// Non-exempt inline child elements, looking through fragments and conditional expressions.
function inlineChildren(node) {
  const found = [];
  const visit = (item) => {
    if (!item) return;
    if (item.type === 'JSXElement') {
      if (isInline(item)) found.push(item);
    } else if (item.type === 'JSXFragment') item.children.forEach(visit);
    else if (item.type === 'JSXExpressionContainer') visit(item.expression);
    else if (item.type === 'LogicalExpression') [item.left, item.right].forEach(visit);
    else if (item.type === 'ConditionalExpression') [item.consequent, item.alternate].forEach(visit);
  };
  node.children.forEach(visit);
  return found;
}

const collapse = (text) => text.replace(/\s+/g, ' ').trim();
const wordCount = (text) => (text ? text.split(' ').length : 0);
const sentenceCount = (text) => (text.replace(/\b(?:e\.g|i\.e)\./gi, '').match(/[.!?]+["'”’)\]]*(?=\s|$)/g) ?? []).length;
// Narrating phrases in a node's own inline text, checked one segment of each variant at a time.
const narrationPhrases = (node) =>
  staticTexts(node)
    .flatMap((text) => text.split(BREAK))
    .map(collapse)
    .flatMap((segment) => NARRATION.map((pattern) => pattern.exec(segment)?.[0]).filter(Boolean));

// A plain reference such as `ready` or `state.items[0]`: reading it twice gives the same value.
const isPureRef = (expr) => {
  if (expr?.type === 'Identifier') return true;
  if (expr?.type !== 'MemberExpression') return false;
  const propertyOk = !expr.computed || expr.property.type === 'Literal' || isPureRef(expr.property);
  return propertyOk && isPureRef(expr.object);
};

// `C && ...` is a positive guard on C and `!C && ...` a negative one.
const guardOf = (expr) => {
  if (expr?.type !== 'LogicalExpression' || expr.operator !== '&&') return null;
  const { left } = expr;
  if (isPureRef(left)) return { base: left, positive: true };
  if (left.type === 'UnaryExpression' && left.operator === '!' && isPureRef(left.argument)) {
    return { base: left.argument, positive: false };
  }
  return null;
};

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Interface copy stays short: no long paragraphs, no walls of stacked paragraphs, and no prose that narrates the controls.',
    },
    messages: {
      longParagraph: `This paragraph has {{words}} words and {{sentences}} sentences (limit ${MAX_WORDS} words, ${MAX_SENTENCES} sentences). Cut it down, or move the detail into a <details> element.`,
      stackedParagraphs: `More than ${MAX_STACKED} paragraphs are stacked here. Keep at most ${MAX_STACKED}, and move the rest into a <details> element.`,
      uiNarration: 'This copy narrates the interface ("{{phrase}}"). Let the control, icon or counter say it, or move keyboard help into a <details> element.',
    },
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    // Each rendered variant is checked; the longest one over the limit is reported.
    const checkParagraph = (node) => {
      const worst = staticTexts(node, true)
        .map((variant) => collapse(variant.replaceAll(BREAK, ' ')))
        .map((text) => ({ words: wordCount(text), sentences: sentenceCount(text) }))
        .filter(({ words, sentences }) => words > MAX_WORDS || sentences > MAX_SENTENCES)
        .sort((a, b) => b.words - a.words || b.sentences - a.sentences)[0];
      if (worst) context.report({ node, messageId: 'longParagraph', data: worst });
    };

    // Report on the innermost element whose own text narrates the interface.
    // An inline child that matches the same phrase reports it instead.
    const checkNarration = (node) => {
      const fromChildren = new Set(inlineChildren(node).flatMap(narrationPhrases).map((p) => p.toLowerCase()));
      const phrase = narrationPhrases(node).find((p) => !fromChildren.has(p.toLowerCase()));
      if (phrase) context.report({ node, messageId: 'uiNarration', data: { phrase } });
    };

    // Returns the running <p> count, reporting each one past the limit.
    // Branches of a ternary, `||` or `??` are mutually exclusive, so they start
    // from the same count and the worst case carries on.
    const countExpression = (expr, count) => {
      if (!expr) return count;
      if (expr.type === 'JSXElement' || expr.type === 'JSXFragment') return countNode(expr, count);
      if (expr.type === 'ConditionalExpression') {
        return Math.max(countExpression(expr.consequent, count), countExpression(expr.alternate, count));
      }
      if (expr.type === 'LogicalExpression') {
        if (expr.operator === '&&') return countExpression(expr.right, count);
        return Math.max(countExpression(expr.left, count), countExpression(expr.right, count));
      }
      return count;
    };
    // Siblings `{C && ...}` and `{!C && ...}` never render together: each side
    // counts on from a base without either side's <p>s, and the worst side carries on.
    const countChildren = (children, start) => {
      const guards = new Map();
      return children.reduce((count, child) => {
        const guard = child.type === 'JSXExpressionContainer' ? guardOf(child.expression) : null;
        if (!guard) return countNode(child, count);
        const key = sourceCode.getText(guard.base);
        const pair = guards.get(key) ?? { pos: 0, neg: 0 };
        guards.set(key, pair);
        const side = guard.positive ? 'pos' : 'neg';
        const base = count - Math.max(pair.pos, pair.neg);
        const from = base + pair[side];
        pair[side] += countExpression(child.expression.right, from) - from;
        return base + Math.max(pair.pos, pair.neg);
      }, start);
    };
    const countNode = (node, count) => {
      if (node.type === 'JSXFragment') return countChildren(node.children, count);
      if (node.type === 'JSXExpressionContainer') return countExpression(node.expression, count);
      if (elementName(node) !== 'p' || isExempt(node)) return count;
      if (count + 1 > MAX_STACKED) context.report({ node, messageId: 'stackedParagraphs' });
      return count + 1;
    };
    const checkStacked = (node) => countChildren(node.children, 0);

    return {
      JSXElement(node) {
        if (isExempt(node)) return;
        checkStacked(node);
        if (elementName(node) === 'p') checkParagraph(node);
        checkNarration(node);
      },
      JSXFragment(node) {
        let parent = node.parent;
        while (parent && TRANSPARENT_PARENTS.has(parent.type)) parent = parent.parent;
        if (parent?.type === 'JSXElement' || parent?.type === 'JSXFragment') return;
        checkStacked(node);
      },
    };
  },
};
