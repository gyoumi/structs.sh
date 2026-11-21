const DIRECTIVES = ['eslint-disable', 'eslint-enable', '@ts-expect-error', '@ts-ignore', '@ts-nocheck', 'prettier-ignore', 'c8 ignore', 'istanbul ignore'];

const LANGUAGES = {
  js: { lineDocs: ['///'], blockDocs: ['/**'], nestedBlocks: false },
  rust: { lineDocs: ['///', '//!'], blockDocs: ['/**', '/*!'], nestedBlocks: true },
};

export function languageOf(path) {
  if (path.endsWith('.rs')) return LANGUAGES.rust;
  return ['.ts', '.tsx', '.mjs', '.js'].some((ext) => path.endsWith(ext)) ? LANGUAGES.js : undefined;
}

const isDirective = (body) => DIRECTIVES.some((directive) => body.trimStart().startsWith(directive));
const isPlain = (text, at, docs) => !docs.some((doc) => text.startsWith(doc, at)) && !isDirective(text.slice(at + 2));

const REGEX_AFTER_CHAR = /[(,=:[!&|?{};+\-*%<>~^]$/;
const REGEX_AFTER_WORD = /\b(?:return|typeof|case|in|of|void|yield|await|delete|throw|new|else|do)$/;

function startsRegex(text, at) {
  const before = text.slice(0, at).trimEnd();
  return before === '' || REGEX_AFTER_CHAR.test(before) || REGEX_AFTER_WORD.test(before);
}

function skipRegex(text, at) {
  let inClass = false;
  for (let i = at + 1; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') i++;
    else if (c === '[') inClass = true;
    else if (c === ']') inClass = false;
    else if (c === '/' && !inClass) return i + 1;
  }
  return text.length;
}

function skipQuoted(text, at, quote) {
  for (let i = at + 1; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === quote) return i + 1;
  }
  return text.length;
}

const RUST_RAW_STRING = /^b?r(#*)"/;

function skipRustRawString(text, at) {
  const opening = RUST_RAW_STRING.exec(text.slice(at));
  if (!opening || /\w/.test(text[at - 1] ?? '')) return undefined;
  const closing = `"${opening[1]}`;
  const end = text.indexOf(closing, at + opening[0].length);
  return end === -1 ? text.length : end + closing.length;
}

const RUST_CHAR = /^'(?:\\u\{[0-9a-fA-F]+\}|\\.|[^\\'])'/;

function skipJsLiteral(text, at) {
  const c = text[at];
  if (c === '"' || c === "'" || c === '`') return skipQuoted(text, at, c);
  if (c === '/' && !'/*'.includes(text[at + 1] ?? '') && startsRegex(text, at)) return skipRegex(text, at);
  return undefined;
}

function skipRustLiteral(text, at) {
  const c = text[at];
  if (c === '"') return skipQuoted(text, at, '"');
  if (c === "'") return at + (RUST_CHAR.exec(text.slice(at))?.[0].length ?? 1);
  if (c === 'r' || c === 'b') return skipRustRawString(text, at);
  return undefined;
}

/**
 * Scans one line, starting inside `depth` open block comments.
 * @returns {{ plain: boolean, depth: number }} whether a plain comment starts on the line, and the block depth at its end
 */
export function scanLine(text, language, depth) {
  const skipLiteral = language === LANGUAGES.rust ? skipRustLiteral : skipJsLiteral;
  let plain = false;
  let i = 0;
  while (i < text.length) {
    if (depth > 0) {
      if (text.startsWith('*/', i)) {
        depth--;
        i += 2;
      } else if (language.nestedBlocks && text.startsWith('/*', i)) {
        depth++;
        i += 2;
      } else i++;
      continue;
    }
    if (text.startsWith('//', i)) {
      plain ||= isPlain(text, i, language.lineDocs);
      break;
    }
    if (text.startsWith('/*', i)) {
      plain ||= isPlain(text, i, language.blockDocs);
      depth = 1;
      i += 2;
      continue;
    }
    i = skipLiteral(text, i) ?? i + 1;
  }
  return { plain, depth };
}
