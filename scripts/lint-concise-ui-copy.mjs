import { elementName, flatText, guardInfo, inlineChildren, isExempt, narrationPhrases, sentenceCount, staticVariants, wordCount } from './lint-concise-ui-copy-text.mjs';

const MAX_WORDS = 25;
const MAX_SENTENCES = 2;
const MAX_STACKED = 2;

// Wrappers that sit between a JSX parent and the JSX it renders.
const TRANSPARENT_PARENTS = new Set(['JSXExpressionContainer', 'LogicalExpression', 'ConditionalExpression']);

// `C && ...` is a positive guard on C and `!C && ...` a negative one.
const guardOf = (expr) => (expr?.type === 'LogicalExpression' && expr.operator === '&&' ? guardInfo(expr.left) : null);

// Unconditional fragments render their children in place, so they share the parent's guards.
const flattenFragments = (children) =>
  children.flatMap((child) => {
    const inner = child.type === 'JSXExpressionContainer' ? child.expression : child;
    return inner.type === 'JSXFragment' ? flattenFragments(inner.children) : [child];
  });

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
    // Each rendered variant is checked; the longest one over the limit is reported.
    const checkParagraph = (node) => {
      const worst = staticVariants(node, true)
        .map((variant) => flatText(variant.text))
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
      return flattenFragments(children).reduce((count, child) => {
        const guard = child.type === 'JSXExpressionContainer' ? guardOf(child.expression) : null;
        if (!guard) return countNode(child, count);
        const pair = guards.get(guard.key) ?? { pos: 0, neg: 0 };
        guards.set(guard.key, pair);
        const side = guard.polarity ? 'pos' : 'neg';
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
        // Fragments inside JSX are checked as part of the enclosing element or fragment.
        if (parent?.type === 'JSXElement' || parent?.type === 'JSXFragment' || isExempt(node)) return;
        checkStacked(node);
        checkNarration(node);
      },
    };
  },
};
