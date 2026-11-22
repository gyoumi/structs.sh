const MAX_WORDS = 25;
const MAX_SENTENCES = 2;
const MAX_STACKED = 2;

const EXEMPT_CONTAINERS = new Set(['details', 'article']);
const NARRATED = new Set(['p', 'span', 'div']);
const SR_ONLY = /sr[-_]?only|visually[-_]?hidden/i;
const NARRATION = [
  /\b(?:tap or click|click or tap)\b/i,
  /\bpress\s+(?:enter|space|tab|escape)\b/i,
  /\byou have\s+\d+\s+(?:tries|attempts)\b/i,
];

const elementName = (node) => (node?.type === 'JSXElement' && node.openingElement.name.type === 'JSXIdentifier' ? node.openingElement.name.name : null);

function isSrOnly(element, sourceCode) {
  const className = element.openingElement.attributes.find(
    (attr) => attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier' && attr.name.name === 'className',
  );
  return Boolean(className?.value) && SR_ONLY.test(sourceCode.getText(className.value));
}

// Copy in <details>/<article>, or hidden from sighted users, is not checked.
function isExempt(element, sourceCode) {
  for (let node = element; node; node = node.parent) {
    if (node.type !== 'JSXElement') continue;
    if (EXEMPT_CONTAINERS.has(elementName(node)) || isSrOnly(node, sourceCode)) return true;
  }
  return false;
}

function stringOf(expression) {
  if (expression.type === 'Literal' && typeof expression.value === 'string') return expression.value;
  if (expression.type === 'TemplateLiteral' && expression.expressions.length === 0) return expression.quasis[0].value.cooked ?? '';
  return null;
}

// Static text of an element. `deep` also walks inline child elements.
function staticText(node, deep) {
  let text = '';
  for (const child of node.children) {
    if (child.type === 'JSXText') text += child.value;
    else if (child.type === 'JSXExpressionContainer') text += stringOf(child.expression) ?? ' ';
    else if (deep && (child.type === 'JSXElement' || child.type === 'JSXFragment')) text += staticText(child, deep);
    else text += ' ';
  }
  return text;
}

const collapse = (text) => text.replace(/\s+/g, ' ').trim();
const wordCount = (text) => (text ? text.split(' ').length : 0);
const sentenceCount = (text) => (text.match(/[.!?]+(?=\s|$)/g) ?? []).length;

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
    const { sourceCode } = context;

    const checkParagraph = (node) => {
      const text = collapse(staticText(node, true));
      const words = wordCount(text);
      const sentences = sentenceCount(text);
      if (words > MAX_WORDS || sentences > MAX_SENTENCES) {
        context.report({ node, messageId: 'longParagraph', data: { words, sentences } });
      }
    };

    const checkNarration = (node) => {
      const text = collapse(staticText(node, false));
      for (const pattern of NARRATION) {
        const match = pattern.exec(text);
        if (match) {
          context.report({ node, messageId: 'uiNarration', data: { phrase: match[0] } });
          return;
        }
      }
    };

    const checkStacked = (node) => {
      if (EXEMPT_CONTAINERS.has(elementName(node))) return;
      const paragraphs = node.children.filter((child) => elementName(child) === 'p' && !isExempt(child, sourceCode));
      for (const paragraph of paragraphs.slice(MAX_STACKED)) context.report({ node: paragraph, messageId: 'stackedParagraphs' });
    };

    return {
      JSXElement(node) {
        checkStacked(node);
        const name = elementName(node);
        if (!NARRATED.has(name) || isExempt(node, sourceCode)) return;
        if (name === 'p') checkParagraph(node);
        checkNarration(node);
      },
      JSXFragment: checkStacked,
    };
  },
};
