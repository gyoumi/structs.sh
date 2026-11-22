const MAX_WORDS = 25;
const MAX_SENTENCES = 2;
const MAX_STACKED = 2;

const EXEMPT_CONTAINERS = new Set(['details', 'article']);
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
  const className = element.openingElement.attributes.find(
    (attr) => attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier' && attr.name.name === 'className',
  );
  const value = className?.value;
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

function expressionText(expr) {
  if (expr.type === 'Literal' && typeof expr.value === 'string') return expr.value;
  if (expr.type === 'TemplateLiteral') return expr.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(' ');
  return ' ';
}

// Rendered static text, walking inline children but skipping exempt ones.
function staticText(node) {
  let text = '';
  for (const child of node.children) {
    if (child.type === 'JSXText') text += child.value;
    else if (child.type === 'JSXExpressionContainer') text += expressionText(child.expression);
    else if (child.type === 'JSXFragment') text += staticText(child);
    else if (child.type === 'JSXElement' && !isExemptSelf(child)) text += staticText(child);
    else text += ' ';
  }
  return text;
}

// Non-exempt child elements, looking through fragments and conditional expressions.
function childElements(node) {
  const found = [];
  const visit = (item) => {
    if (!item) return;
    if (item.type === 'JSXElement') {
      if (!isExemptSelf(item)) found.push(item);
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
const narrationMatch = (node) => {
  const text = collapse(staticText(node));
  for (const pattern of NARRATION) {
    const match = pattern.exec(text);
    if (match) return match[0];
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
    const checkParagraph = (node) => {
      const text = collapse(staticText(node));
      const words = wordCount(text);
      const sentences = sentenceCount(text);
      if (words > MAX_WORDS || sentences > MAX_SENTENCES) {
        context.report({ node, messageId: 'longParagraph', data: { words, sentences } });
      }
    };

    // Report on the innermost element whose own text narrates the interface.
    const checkNarration = (node) => {
      const phrase = narrationMatch(node);
      if (!phrase || childElements(node).some((child) => narrationMatch(child))) return;
      context.report({ node, messageId: 'uiNarration', data: { phrase } });
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
    const countNode = (node, count) => {
      if (node.type === 'JSXFragment') return node.children.reduce((total, child) => countNode(child, total), count);
      if (node.type === 'JSXExpressionContainer') return countExpression(node.expression, count);
      if (elementName(node) !== 'p' || isExempt(node)) return count;
      if (count + 1 > MAX_STACKED) context.report({ node, messageId: 'stackedParagraphs' });
      return count + 1;
    };
    const checkStacked = (node) => node.children.reduce((total, child) => countNode(child, total), 0);

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
