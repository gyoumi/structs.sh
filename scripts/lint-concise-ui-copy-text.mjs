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

// Dedupe, then bound the list while never evicting the worst cases: per guard
// signature, the most words, the most sentences, and a narrating variant.
function prune(list) {
  const seen = new Map();
  for (const variant of list) {
    const id = `${signature(variant.guards)}|${variant.text}`;
    if (!seen.has(id)) seen.set(id, variant);
  }
  const deduped = [...seen.values()];
  if (deduped.length <= MAX_VARIANTS) return deduped;
  const scored = deduped.map((variant) => {
    const text = flatText(variant.text);
    return { variant, sig: signature(variant.guards), words: wordCount(text), sentences: sentenceCount(text), narrates: narrationIn(variant.text).length > 0 };
  });
  const keep = new Set();
  const bySig = new Map();
  for (const item of scored) {
    const best = bySig.get(item.sig) ?? {};
    if (!best.words || item.words > best.words.words) best.words = item;
    if (!best.sentences || item.sentences > best.sentences.sentences) best.sentences = item;
    if (!best.narrates && item.narrates) best.narrates = item;
    bySig.set(item.sig, best);
  }
  for (const best of bySig.values()) Object.values(best).forEach((item) => keep.add(item));
  const rest = scored.filter((item) => !keep.has(item)).sort((a, b) => b.words - a.words || b.sentences - a.sentences);
  for (const item of rest) {
    if (keep.size >= MAX_VARIANTS) break;
    keep.add(item);
  }
  return scored.filter((item) => keep.has(item)).map((item) => item.variant);
}

// One of the lists renders: the union of their variants.
const either = (...lists) => prune(lists.flat());
// Each list renders in turn: every compatible combination of their variants.
const sequence = (lists) =>
  lists.reduce(
    (acc, list) =>
      prune(acc.flatMap((a) => list.filter((b) => compatible(a.guards, b.guards)).map((b) => ({ text: a.text + b.text, guards: mergeGuards(a.guards, b.guards) })))),
    [plain('')],
  );
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
      return (all ? !isExemptSelf(expr) : isInline(expr)) ? staticVariants(expr, all) : [plain(BREAK)];
    case 'JSXFragment':
      return staticVariants(expr, all);
    case 'JSXEmptyExpression':
      return [plain('')];
    case 'LogicalExpression': {
      const right = expressionVariants(expr.right, all);
      if (expr.operator !== '&&') return either(expressionVariants(expr.left, all), right);
      // A pure guard renders nothing when false; otherwise check the rendered case.
      const guard = guardInfo(expr.left);
      if (!guard) return right;
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

// Possible renderings of an element's children, skipping exempt ones.
// Block children become a BREAK unless `all` is set (used for word counts).
export function staticVariants(node, all = false) {
  return sequence(
    node.children.map((child) => {
      if (child.type === 'JSXText') return [plain(child.value)];
      if (child.type === 'JSXExpressionContainer') return expressionVariants(child.expression, all);
      return expressionVariants(child, all);
    }),
  );
}

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
