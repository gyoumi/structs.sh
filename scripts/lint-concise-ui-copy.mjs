import { elementName, flatText, guardInfo, inlineChildren, isExempt, narrationPhrases, sentenceCount, staticVariants, wordCount } from './lint-concise-ui-copy-text.mjs';

const MAX_WORDS = 25;
const MAX_SENTENCES = 2;
const MAX_STACKED = 2;

// Wrappers that sit between a JSX parent and the JSX it renders.
const TRANSPARENT_PARENTS = new Set(['JSXExpressionContainer', 'LogicalExpression', 'ConditionalExpression']);

const MAX_STATES = 16;

// --- Execution states for counting <p>s: `{ count, guards }`, guards as key -> truthy. ---

const signature = (guards) => [...guards].map(([k, v]) => `${v ? '' : '!'}${k}`).sort().join('&');

// The states that can run while `key` has the given truthiness, with that recorded.
const applyGuard = (states, { key, polarity }) =>
  states.filter((state) => state.guards.get(key) !== !polarity).map((state) => ({ count: state.count, guards: new Map(state.guards).set(key, polarity) }));

// Keep the highest count per guard signature (it dominates the rest), then the top MAX_STATES.
const pruneStates = (states) => {
  const best = new Map();
  for (const state of states) {
    const sig = signature(state.guards);
    if (!best.has(sig) || best.get(sig).count < state.count) best.set(sig, state);
  }
  return [...best.values()].sort((a, b) => b.count - a.count).slice(0, MAX_STATES);
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

    // Walks the direct children, flattening fragments and conditionals but not
    // nested elements, and returns the possible states after them. A <p> adds
    // one to every state that can reach it; each <p> past the limit is reported.
    // A pure guard (`C`, `!C`) splits the states, so `{C && ...}` and
    // `{!C && ...}` never count together, even across a ternary.
    const reported = new Set();
    const countExpr = (expr, states) => {
      if (!expr || states.length === 0) return states;
      switch (expr.type) {
        case 'JSXExpressionContainer':
          return countExpr(expr.expression, states);
        case 'JSXFragment':
          return countChildren(expr.children, states);
        case 'JSXElement': {
          if (elementName(expr) !== 'p' || isExempt(expr)) return states;
          const next = states.map((state) => ({ count: state.count + 1, guards: state.guards }));
          if (Math.max(...next.map((state) => state.count)) > MAX_STACKED && !reported.has(expr)) {
            reported.add(expr);
            context.report({ node: expr, messageId: 'stackedParagraphs' });
          }
          return next;
        }
        case 'ConditionalExpression': {
          const guard = guardInfo(expr.test);
          if (!guard) return pruneStates([...countExpr(expr.consequent, states), ...countExpr(expr.alternate, states)]);
          const whenTrue = countExpr(expr.consequent, applyGuard(states, guard));
          const whenFalse = countExpr(expr.alternate, applyGuard(states, { key: guard.key, polarity: !guard.polarity }));
          return pruneStates([...whenTrue, ...whenFalse]);
        }
        case 'LogicalExpression': {
          if (expr.operator !== '&&') return pruneStates([...countExpr(expr.left, states), ...countExpr(expr.right, states)]);
          const guard = guardInfo(expr.left);
          if (!guard) return pruneStates([...countExpr(expr.right, states), ...states]);
          const taken = countExpr(expr.right, applyGuard(states, guard));
          const skipped = applyGuard(states, { key: guard.key, polarity: !guard.polarity });
          return pruneStates([...taken, ...skipped]);
        }
        default:
          return states;
      }
    };
    const countChildren = (children, states) => children.reduce((acc, child) => countExpr(child, acc), states);
    const checkStacked = (node) => countChildren(node.children, [{ count: 0, guards: new Map() }]);

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
