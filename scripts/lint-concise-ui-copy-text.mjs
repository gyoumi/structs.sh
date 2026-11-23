// Rendered-text analysis for the concise-ui-copy lint rule: which static texts
// a JSX node can render, and under which pure guard conditions.

const EXEMPT_CONTAINERS = new Set(['details', 'article']);
// Phrasing elements whose text reads as part of the surrounding sentence.
const INLINE_ELEMENTS = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'data', 'dfn', 'em', 'i', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var']);
// Separates text that never reads as one phrase (block children, `${...}`, unknown values).
// A control character, so ordinary line breaks in JSX text stay plain whitespace.
export const BREAK = '\0';
// Variants kept per list once pruned; the worst-case ones are always kept on top.
const MAX_VARIANTS = 16;
const SR_ONLY_TOKEN = /^(?:sr[-_]?only|visually[-_]?hidden)$/i;
export const NARRATION_PATTERNS = [
  /\b(?:tap or click|click or tap)\b/i,
  /\bpress\s+(?:enter|space|tab|escape)\b/i,
  /\byou have\s+\d+\s+(?:tries|attempts)\b/i,
];
const NARRATION_HINT = /\b(?:tap|click|press|enter|space|tab|escape|you|have|tries|attempts)\b/i;

export const elementName = (node) => (node?.type === 'JSXElement' && node.openingElement.name.type === 'JSXIdentifier' ? node.openingElement.name.name : null);

const hasSrOnlyToken = (text) => text.split(/\s+/).some((token) => SR_ONLY_TOKEN.test(token));

// True only when the class expression always applies a screen-reader-only class.
function alwaysSrOnly(expr) {
  switch (expr?.type) {
    case 'Literal':
      return typeof expr.value === 'string' && hasSrOnlyToken(expr.value);
    case 'TemplateLiteral':
      // Static parts only; a token touching `${...}` is not a whole class name.
      return expr.quasis.some((quasi, index) => {
        const tokens = (quasi.value.cooked ?? quasi.value.raw).split(/\s+/);
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
export function isExempt(node) {
  for (let current = node; current; current = current.parent) {
    if (current.type === 'JSXElement' && isExemptSelf(current)) return true;
  }
  return false;
}

const isInline = (element) => INLINE_ELEMENTS.has(elementName(element)) && !isExemptSelf(element);

// A plain reference such as `ready` or `state.items[0]`: reading it twice gives the same value.
const isPureRef = (expr) => {
  if (expr?.type === 'Identifier') return true;
  if (expr?.type !== 'MemberExpression') return false;
  const propertyOk = !expr.computed || expr.property.type === 'Literal' || isPureRef(expr.property);
  return propertyOk && isPureRef(expr.object);
};

const refKey = (expr) => {
  if (expr.type === 'Identifier') return expr.name;
  if (!expr.computed) return `${refKey(expr.object)}.${expr.property.name}`;
  const inner = expr.property.type === 'Literal' ? JSON.stringify(expr.property.value) : refKey(expr.property);
  return `${refKey(expr.object)}[${inner}]`;
};

// `C` is a guard on C being truthy and `!C` one on C being falsy.
export const guardInfo = (cond) => {
  if (isPureRef(cond)) return { key: refKey(cond), polarity: true };
  if (cond?.type === 'UnaryExpression' && cond.operator === '!' && isPureRef(cond.argument)) {
    return { key: refKey(cond.argument), polarity: false };
  }
  return null;
};

// --- Variants: one possible rendering, `{ text, guards }` with guards as key -> truthy. ---

const NO_GUARDS = new Map();
const plain = (text) => ({ text, guards: NO_GUARDS });

const compatible = (a, b) => {
  for (const [key, value] of a) if (b.has(key) && b.get(key) !== value) return false;
  return true;
};
const mergeGuards = (a, b) => (b.size === 0 ? a : a.size === 0 ? b : new Map([...a, ...b]));
const signature = (guards) => [...guards].map(([k, v]) => `${v ? '' : '!'}${k}`).sort().join('&');

export const collapse = (text) => text.replace(/\s+/g, ' ').trim();
export const wordCount = (text) => (text ? text.split(' ').length : 0);
export const sentenceCount = (text) => (text.replace(/\b(?:e\.g|i\.e)\./gi, '').match(/[.!?]+["'”’)\]]*(?=\s|$)/g) ?? []).length;
export const flatText = (text) => collapse(text.replaceAll(BREAK, ' '));
// Narrating phrases, checked one BREAK-separated segment at a time.
export const narrationIn = (text) =>
  text
    .split(BREAK)
    .map(collapse)
    .flatMap((segment) => NARRATION_PATTERNS.map((pattern) => pattern.exec(segment)?.[0]).filter(Boolean));

const guardsOf = (list) => new Set(list.flatMap((variant) => [...variant.guards.keys()]));
const restrictGuards = (guards, live) => {
  if (!live || guards.size === 0 || [...guards.keys()].every((key) => live.has(key))) return guards;
  const kept = new Map([...guards].filter(([key]) => live.has(key)));
  return kept.size ? kept : NO_GUARDS;
};
const scoreVariant = (variant) => {
  const text = flatText(variant.text);
  const segments = variant.text.split(BREAK).map(collapse);
  const patterns = NARRATION_PATTERNS.flatMap((pattern, i) => (segments.some((segment) => pattern.test(segment)) ? [i] : []));
  return { variant, words: wordCount(text), sentences: sentenceCount(text), patterns, hasHint: segments.some((s) => NARRATION_HINT.test(s)) };
};

// Dedupe, then cap at MAX_VARIANTS using lookahead over remaining siblings so
// shorter prefixes whose guards unlock longer or narrating continuations survive.
function prune(list, future = []) {
  const seen = new Map();
  for (const variant of list) seen.set(`${signature(variant.guards)}|${variant.text}`, variant);
  const unique = [...seen.values()];
  if (unique.length <= MAX_VARIANTS) return unique;
  const futureScored = future.map((entries) => entries.map(scoreVariant));
  const scored = [];
  for (const variant of unique) {
    const base = scoreVariant(variant);
    let potWords = base.words;
    let potSentences = base.sentences;
    const potPatterns = new Set(base.patterns);
    let potHints = base.hasHint ? 1 : 0;
    let reachable = true;
    for (const entries of futureScored) {
      const compat = entries.filter((next) => compatible(variant.guards, next.variant.guards));
      if (compat.length === 0) { reachable = false; break; }
      potWords += Math.max(...compat.map((next) => next.words));
      potSentences += Math.max(...compat.map((next) => next.sentences));
      if (compat.some((next) => next.hasHint)) potHints += 1;
      for (const next of compat) for (const p of next.patterns) potPatterns.add(p);
    }
    if (reachable) scored.push({ ...base, sig: signature(variant.guards), potWords, potSentences, potPatterns, potHints });
  }
  const byWords = (a, b) => b.potWords - a.potWords || b.words - a.words || b.potSentences - a.potSentences;
  const bySentences = (a, b) => b.potSentences - a.potSentences || b.sentences - a.sentences || b.potWords - a.potWords;
  const byHints = (a, b) => b.potHints - a.potHints || b.potWords - a.potWords;
  const keep = new Set();
  const add = (item) => item && keep.size < MAX_VARIANTS && keep.add(item);
  add([...scored].sort(byWords)[0]);
  add([...scored].sort(bySentences)[0]);
  NARRATION_PATTERNS.forEach((_, i) => add(scored.filter((item) => item.potPatterns.has(i)).sort(byWords)[0]));
  add(scored.filter((item) => item.potHints > 0).sort(byHints)[0]);
  const bySig = new Map();
  for (const item of scored) {
    const best = bySig.get(item.sig) ?? {};
    if (!best.words || byWords(item, best.words) < 0) best.words = item;
    if (!best.sentences || bySentences(item, best.sentences) < 0) best.sentences = item;
    bySig.set(item.sig, best);
  }
  const total = (item) => item.potWords + item.potSentences;
  [...bySig.values()].flatMap((best) => [best.words, best.sentences]).sort((a, b) => total(b) - total(a)).forEach(add);
  [...scored].sort(byWords).forEach(add);
  return scored.filter((item) => keep.has(item)).map((item) => item.variant);
}

// One of the lists renders: the union of their variants.
const either = (...lists) => prune(lists.flat());
// Each list renders in turn: every compatible combination of their variants.
// At the root element, guards unused by remaining siblings are dropped early.
function sequence(lists, isRoot = false) {
  let acc = [plain('')];
  for (let i = 0; i < lists.length; i += 1) {
    const future = lists.slice(i + 1);
    const live = isRoot ? new Set(future.flatMap((next) => [...guardsOf(next)])) : null;
    const combined = acc.flatMap((a) =>
      lists[i]
        .filter((b) => compatible(a.guards, b.guards))
        .map((b) => ({ text: a.text + b.text, guards: restrictGuards(mergeGuards(a.guards, b.guards), live) })),
    );
    acc = prune(combined, future);
  }
  return acc;
}
// The variants that can render while `key` has the given truthiness.
const underGuard = (list, key, polarity) => {
  const guard = new Map([[key, polarity]]);
  return list.filter((variant) => compatible(variant.guards, guard)).map((variant) => ({ text: variant.text, guards: mergeGuards(variant.guards, guard) }));
};

// Possible renderings of an expression; `all` also reads non-inline elements.
function expressionVariants(expr, all) {
  switch (expr?.type) {
    case 'Literal':
      return [plain(typeof expr.value === 'string' ? expr.value : BREAK)];
    case 'TemplateLiteral':
      return [plain(expr.quasis.map((quasi) => quasi.value.cooked ?? quasi.value.raw).join(BREAK))];
    case 'JSXElement':
      if (isSrOnly(expr)) return [plain('')];
      return (all ? !EXEMPT_CONTAINERS.has(elementName(expr)) : isInline(expr)) ? collectVariants(expr, all, false) : [plain(BREAK)];
    case 'JSXFragment':
      return collectVariants(expr, all, false);
    case 'JSXEmptyExpression':
      return [plain('')];
    case 'LogicalExpression': {
      const right = expressionVariants(expr.right, all);
      const guard = guardInfo(expr.left);
      if (expr.operator === '||') {
        const left = expressionVariants(expr.left, all);
        if (!guard) return either(left, right);
        return either(underGuard(left, guard.key, guard.polarity), underGuard(right, guard.key, !guard.polarity));
      }
      if (expr.operator !== '&&') return either(expressionVariants(expr.left, all), right);
      // A pure guard splits true/false; an unknown guard may render right or nothing.
      if (!guard) return either([plain('')], right);
      return either([{ text: '', guards: new Map([[guard.key, !guard.polarity]]) }], underGuard(right, guard.key, guard.polarity));
    }
    case 'ConditionalExpression': {
      const consequent = expressionVariants(expr.consequent, all);
      const alternate = expressionVariants(expr.alternate, all);
      const guard = guardInfo(expr.test);
      if (!guard) return either(consequent, alternate);
      return either(underGuard(consequent, guard.key, guard.polarity), underGuard(alternate, guard.key, !guard.polarity));
    }
    default:
      return [plain(BREAK)];
  }
}

const collectVariants = (node, all, isRoot) =>
  sequence(
    node.children.map((child) => {
      if (child.type === 'JSXText') return [plain(child.value)];
      if (child.type === 'JSXExpressionContainer') return expressionVariants(child.expression, all);
      return expressionVariants(child, all);
    }),
    isRoot,
  );

// Possible renderings of an element's children, skipping exempt ones.
// Block children become a BREAK unless `all` is set (used for word counts).
export const staticVariants = (node, all = false) => collectVariants(node, all, true);

// Non-exempt inline child elements, looking through fragments and conditional expressions.
export function inlineChildren(node) {
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

// Narrating phrases in a node's own inline text, across its renderings.
export const narrationPhrases = (node) => staticVariants(node).flatMap((variant) => narrationIn(variant.text));
