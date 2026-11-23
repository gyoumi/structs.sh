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

const isUseStateCallee = (callee) =>
  (callee?.type === 'Identifier' && callee.name === 'useState') ||
  (callee?.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier' && callee.property.name === 'useState');

const isBooleanUseStateCall = (init) => {
  if (init?.type !== 'CallExpression' || !isUseStateCallee(init.callee)) return false;
  const typeArg = (init.typeArguments ?? init.typeParameters)?.params?.[0];
  if (typeArg) return isBooleanTypeNode(typeArg);
  const firstArg = init.arguments?.[0];
  if (isBooleanLiteral(firstArg)) return true;
  return firstArg?.type === 'ArrowFunctionExpression' && isBooleanLiteral(firstArg.body);
};

const useStateFlagName = (declarator) => {
  if (!isBooleanUseStateCall(declarator.init)) return undefined;
  if (declarator.id.type === 'ArrayPattern' && declarator.id.elements[0]?.type === 'Identifier') {
    return declarator.id.elements[0].name;
  }
  return declarator.id.type === 'Identifier' ? declarator.id.name : undefined;
};

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

    const letsByScope = new Map();
    return {
      TSInterfaceDeclaration: (node) => checkMembers(node, node.body.body, isBooleanSignature),
      TSTypeLiteral: (node) => checkMembers(node, node.members, isBooleanSignature),
      ClassDeclaration: checkClass,
      ClassExpression: checkClass,
      VariableDeclaration(node) {
        const names =
          node.kind === 'let'
            ? node.declarations.filter(isBooleanDeclarator).map((d) => d.id.name)
            : node.declarations.map(useStateFlagName).filter(Boolean);
        if (names.length === 0) return;
        const scope = scopeOf(node);
        const flags = letsByScope.get(scope) ?? [];
        for (const name of names) flags.push({ name, declaration: node });
        letsByScope.set(scope, flags);
      },
      'Program:exit'() {
        for (const lets of letsByScope.values()) {
          if (lets.length >= 2) reportFlags(lets[1].declaration, lets.map(({ name }) => name));
        }
      },
    };
  },
};
