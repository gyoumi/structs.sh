const NULLISH = new Set(['TSUndefinedKeyword', 'TSNullKeyword']);

function isBooleanTypeNode(type) {
  if (!type) return false;
  if (type.type === 'TSBooleanKeyword') return true;
  if (type.type !== 'TSUnionType') return false;
  return type.types.some((t) => t.type === 'TSBooleanKeyword') && type.types.every((t) => t.type === 'TSBooleanKeyword' || NULLISH.has(t.type));
}

const isBooleanType = (annotation) => isBooleanTypeNode(annotation?.typeAnnotation);

const isBooleanLiteral = (node) => node?.type === 'Literal' && typeof node.value === 'boolean';

function keyName(key, sourceCode) {
  if (key.type === 'Identifier' || key.type === 'PrivateIdentifier') return key.name;
  if (key.type === 'Literal') return String(key.value);
  return sourceCode.getText(key);
}

const isBooleanSignature = (member) => member.type === 'TSPropertySignature' && isBooleanType(member.typeAnnotation);

function isBooleanClassProperty(member) {
  if (member.type !== 'PropertyDefinition' && member.type !== 'TSAbstractPropertyDefinition') return false;
  return member.typeAnnotation ? isBooleanType(member.typeAnnotation) : isBooleanLiteral(member.value);
}

const isBooleanDeclarator = (declarator) =>
  declarator.id.type === 'Identifier' && (isBooleanType(declarator.id.typeAnnotation) || isBooleanLiteral(declarator.init));

const BOOLEAN_HOOKS = new Set(['useState', 'useRef']);

function hookName(callee) {
  if (callee.type === 'Identifier') return callee.name;
  if (callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier' && callee.object.name === 'React') return callee.property.name;
  return undefined;
}

const returnsBooleanLiteral = (node) =>
  node?.type === 'ArrowFunctionExpression' && !node.async && node.expression && isBooleanLiteral(node.body);

function isBooleanHookCall(init) {
  if (init?.type !== 'CallExpression' || !BOOLEAN_HOOKS.has(hookName(init.callee))) return false;
  const typeArgument = init.typeArguments?.params[0];
  if (typeArgument) return isBooleanTypeNode(typeArgument);
  const [initial] = init.arguments;
  return isBooleanLiteral(initial) || (hookName(init.callee) === 'useState' && returnsBooleanLiteral(initial));
}

function booleanHookFlagName(declarator) {
  if (!isBooleanHookCall(declarator.init)) return undefined;
  const { id } = declarator;
  if (id.type === 'Identifier') return id.name;
  if (id.type === 'ArrayPattern' && hookName(declarator.init.callee) === 'useState' && id.elements[0]?.type === 'Identifier') return id.elements[0].name;
  return undefined;
}

function flagName(declarator, kind) {
  if (kind === 'let' && isBooleanDeclarator(declarator)) return declarator.id.name;
  return booleanHookFlagName(declarator);
}

const SCOPES = new Set(['Program', 'BlockStatement', 'StaticBlock', 'SwitchStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'TSModuleBlock']);

function scopeOf(node) {
  let scope = node.parent;
  while (scope && !SCOPES.has(scope.type)) scope = scope.parent;
  return scope;
}

export default {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'A thing that moves through stages keeps its stage in one value with a named type, not in several booleans that have to agree.',
    },
    messages: {
      looseFlags: '{{names}} are separate boolean flags that have to agree. Give the stage one value with a named type (for example a union of string literals).',
    },
    schema: [],
  },
  create(context) {
    const { sourceCode } = context;
    const reportFlags = (node, names) => {
      if (names.length >= 2) context.report({ node, messageId: 'looseFlags', data: { names: names.join(', ') } });
    };
    const checkMembers = (node, members, isBoolean) =>
      reportFlags(
        node,
        members.filter(isBoolean).map((member) => keyName(member.key, sourceCode)),
      );
    const checkClass = (node) => checkMembers(node, node.body.body, isBooleanClassProperty);

    const flagsByScope = new Map();
    return {
      TSInterfaceDeclaration: (node) => checkMembers(node, node.body.body, isBooleanSignature),
      TSTypeLiteral: (node) => checkMembers(node, node.members, isBooleanSignature),
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
      VariableDeclaration(node) {
        if (node.kind !== 'let' && node.kind !== 'const') return;
        const scope = scopeOf(node);
        const flags = flagsByScope.get(scope) ?? [];
        for (const declarator of node.declarations) {
          const name = flagName(declarator, node.kind);
          if (name !== undefined) flags.push({ name, declaration: node });
        }
        flagsByScope.set(scope, flags);
      },
      'Program:exit'() {
        for (const flags of flagsByScope.values()) {
          if (flags.length >= 2) reportFlags(flags[1].declaration, flags.map(({ name }) => name));
        }
      },
    };
  },
};
