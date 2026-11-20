#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LIMITS = { source: 300, test: 500 };

const SCOPE = [
  'client/src/Services/debugger/',
  'client/src/Services/useDebugger.ts',
  'instrumenter/src/',
  'instrumenter/tests/',
  'e2e/',
  'scripts/',
  'client/src/visualiser-debugger/Types/annotationType.ts',
  'client/src/visualiser-debugger/Component/Configuration/Configuration.tsx',
  'client/src/visualiser-debugger/Component/Configuration/StackVarAnnotation.tsx',
  'client/src/visualiser-debugger/Component/Configuration/RoleAnnotation/LinkedListNodeAnnotation.tsx',
  'client/src/visualiser-debugger/Component/Control/Controls.tsx',
  'client/src/visualiser-debugger/DevelopmentMode.tsx',
  'client/src/visualiser-debugger/Component/Console/useCursor.ts',
];

const CODE_EXTENSIONS = ['.ts', '.tsx', '.rs', '.mjs', '.js'];
const IGNORED_FOLDERS = new Set(['fixtures', 'generated']);
const TEST_SUFFIXES = ['.test.ts', '.test.tsx', '.spec.ts', '.test.mjs'];
const TEST_FOLDERS = ['instrumenter/tests/', 'e2e/'];

const LINKED_LIST_FOLDER = 'client/src/visualiser-debugger/Component/Visualizer/Parser/';

const matches = (path, entry) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry);

const isLinkedListParserFile = (path) => {
  if (!path.startsWith(LINKED_LIST_FOLDER)) return false;
  const name = path.slice(LINKED_LIST_FOLDER.length);
  return !name.includes('/') && name.startsWith('linkedList');
};

/** Whether the size check covers this repo-relative path. */
export function inScope(path) {
  if (!SCOPE.some((entry) => matches(path, entry)) && !isLinkedListParserFile(path)) return false;
  if (!CODE_EXTENSIONS.some((ext) => path.endsWith(ext))) return false;
  return !path.split('/').slice(0, -1).some((folder) => IGNORED_FOLDERS.has(folder));
}

/** @returns {'source' | 'test'} */
export function kindOf(path) {
  const isTest =
    TEST_SUFFIXES.some((suffix) => path.endsWith(suffix)) ||
    TEST_FOLDERS.some((folder) => path.startsWith(folder));
  return isTest ? 'test' : 'source';
}

/**
 * The in-scope files over their limit, sorted by path.
 * @param {{ path: string, lines: number }[]} files
 * @param {{ only?: 'source' | 'test' }} [options]
 * @returns {{ path: string, lines: number, limit: number, kind: 'source' | 'test' }[]}
 */
export function oversized(files, { only } = {}) {
  return files
    .filter(({ path }) => inScope(path))
    .map(({ path, lines }) => {
      const kind = kindOf(path);
      return { path, lines, limit: LIMITS[kind], kind };
    })
    .filter(({ kind, lines, limit }) => (only === undefined || kind === only) && lines > limit)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function countLines(text) {
  if (text === '') return 0;
  const newlines = text.split('\n').length - 1;
  return text.endsWith('\n') ? newlines : newlines + 1;
}

const USAGE = 'usage: node scripts/check-file-sizes.mjs [--only source|test]';

function parseArgs(args) {
  let only;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== '--only') return undefined;
    const value = args[i + 1];
    if (value !== 'source' && value !== 'test') return undefined;
    only = value;
    i += 1;
  }
  return { only };
}

function main(args) {
  const options = parseArgs(args);
  if (!options) {
    console.error(USAGE);
    return 2;
  }

  const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter((path) => path && inScope(path) && (!options.only || kindOf(path) === options.only));

  const files = [];
  for (const path of tracked) {
    let text;
    try {
      text = readFileSync(join(repoRoot, path), 'utf8');
    } catch (error) {
      // Tracked but deleted from the working tree: nothing to measure.
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    files.push({ path, lines: countLines(text) });
  }

  const over = oversized(files, options);
  if (over.length === 0) {
    console.log(`All ${files.length} files are within their line limits.`);
    return 0;
  }
  for (const { path, lines, limit, kind } of over) {
    console.log(`${path}: ${lines} lines, over the ${limit}-line limit for ${kind} files`);
  }
  return 1;
}

const isEntryPoint = () => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
};

if (isEntryPoint()) process.exitCode = main(process.argv.slice(2));
