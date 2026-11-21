const DIRECTIVES = ['eslint-disable', 'eslint-enable', '@ts-expect-error', '@ts-ignore', '@ts-nocheck', 'prettier-ignore', 'c8 ignore', 'istanbul ignore'];

const LANGUAGES = {
  js: { lineDocs: ['///'], blockDocs: ['/**'], nestedBlocks: false, multiLineQuotes: false },
  rust: { lineDocs: ['///', '//!'], blockDocs: ['/**', '/*!'], nestedBlocks: true, multiLineQuotes: true },
};

export function languageOf(path) {
  if (path.endsWith('.rs')) return LANGUAGES.rust;
  return ['.ts', '.tsx', '.mjs', '.js'].some((ext) => path.endsWith(ext)) ? LANGUAGES.js : undefined;
}

/**
 * Whether a comment, from its opening `//` or `/*`, is a plain comment: not an
 * API doc and not a lint or tool directive.
 */
export function isPlainComment(comment, language) {
  const docs = comment.startsWith('//') ? language.lineDocs : language.blockDocs;
  if (docs.some((doc) => comment.startsWith(doc))) return false;
  const body = comment.slice(2).trimStart();
  return !DIRECTIVES.some((directive) => body.startsWith(directive));
}

const REGEX_AFTER_CHAR = /[(,=:[!&|?{};+\-*%<>~^]/;
const REGEX_AFTER_WORD = new Set(['return', 'typeof', 'case', 'in', 'of', 'void', 'yield', 'await', 'delete', 'throw', 'new', 'else', 'do']);
const RUST_CHAR = /'(?:\\u\{[0-9a-fA-F]+\}|\\.|[^\\'])'/y;
const RUST_RAW_STRING = /b?r(#*)"/y;

function lineStartsOf(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}

function lineAt(lineStarts, index) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (lineStarts[mid] <= index) low = mid;
    else high = mid - 1;
  }
  return low + 1;
}

/**
 * The 1-based numbers of the lines on which a plain comment starts: not an
 * API doc and not a lint or tool directive.
 * @param {string} text
 * @param {typeof LANGUAGES.js} language from languageOf
 * @param {{ startInBlock?: boolean }} [options] whether the text starts inside a block comment
 * @returns {Set<number>}
 */
export function commentStartLines(text, language, { startInBlock = false } = {}) {
  const lineStarts = lineStartsOf(text);
  const found = new Set();
  let i = 0;
  let lastCodeIndex = -1;

  const skipBlock = () => {
    let depth = 1;
    while (i < text.length && depth > 0) {
      if (text.startsWith('*/', i)) {
        depth--;
        i += 2;
      } else if (language.nestedBlocks && text.startsWith('/*', i)) {
        depth++;
        i += 2;
      } else i++;
    }
  };

  const skipQuoted = (quote) => {
    for (i++; i < text.length; i++) {
      if (text[i] === '\\') i++;
      else if (text[i] === quote) return void i++;
      else if (text[i] === '\n' && !language.multiLineQuotes) return;
    }
  };

  const startsRegex = () => {
    if (lastCodeIndex < 0 || REGEX_AFTER_CHAR.test(text[lastCodeIndex])) return true;
    let wordStart = lastCodeIndex;
    while (wordStart > 0 && /\w/.test(text[wordStart - 1])) wordStart--;
    return REGEX_AFTER_WORD.has(text.slice(wordStart, lastCodeIndex + 1));
  };

  const skipRegex = () => {
    let inClass = false;
    for (i++; i < text.length && text[i] !== '\n'; i++) {
      const c = text[i];
      if (c === '\\') i++;
      else if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) return void i++;
    }
  };

  const skipRustRawString = () => {
    RUST_RAW_STRING.lastIndex = i;
    const opening = RUST_RAW_STRING.exec(text);
    if (!opening || /\w/.test(text[i - 1] ?? '')) return false;
    const closing = `"${opening[1]}`;
    const end = text.indexOf(closing, i + opening[0].length);
    i = end === -1 ? text.length : end + closing.length;
    return true;
  };

  const skipRustQuote = () => {
    RUST_CHAR.lastIndex = i;
    i += RUST_CHAR.exec(text)?.[0].length ?? 1;
  };

  let scanCode;
  const skipTemplate = () => {
    for (i++; i < text.length; i++) {
      if (text[i] === '\\') i++;
      else if (text[i] === '`') return void i++;
      else if (text.startsWith('${', i)) {
        i += 2;
        lastCodeIndex = i - 1;
        scanCode(true);
        i--;
      }
    }
  };

  const skipLiteral = () => {
    const c = text[i];
    if (language === LANGUAGES.rust) {
      if (c === '"') skipQuoted('"');
      else if (c === "'") skipRustQuote();
      else if (!((c === 'r' || c === 'b') && skipRustRawString())) i++;
    } else if (c === '"' || c === "'") skipQuoted(c);
    else if (c === '`') skipTemplate();
    else if (c === '/' && startsRegex()) skipRegex();
    else i++;
  };

  scanCode = (untilBrace) => {
    let braces = 0;
    while (i < text.length) {
      const start = i;
      if (text.startsWith('//', i)) {
        const end = text.indexOf('\n', i);
        i = end === -1 ? text.length : end;
        if (isPlainComment(text.slice(start, i), language)) found.add(lineAt(lineStarts, start));
      } else if (text.startsWith('/*', i)) {
        i += 2;
        skipBlock();
        if (isPlainComment(text.slice(start, i), language)) found.add(lineAt(lineStarts, start));
      } else if (untilBrace && text[i] === '{') {
        braces++;
        lastCodeIndex = i++;
      } else if (untilBrace && text[i] === '}') {
        lastCodeIndex = i++;
        if (braces-- === 0) return;
      } else {
        const isCode = !/\s/.test(text[i]);
        skipLiteral();
        if (isCode) lastCodeIndex = i - 1;
      }
    }
  };

  if (startInBlock) skipBlock();
  scanCode(false);
  return found;
}
