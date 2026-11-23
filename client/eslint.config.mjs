import path from 'node:path';

import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import { configs } from 'eslint-config-airbnb-extended/legacy';
import { rules as prettierConfigRules } from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import vitestPlugin from '@vitest/eslint-plugin';

import { inScope, kindOf } from '../scripts/check-file-sizes.mjs';
import conciseUiCopy from '../scripts/lint-concise-ui-copy.mjs';
import oneStageValue from '../scripts/lint-one-stage-value.mjs';
import { retiredNames, studentFreeIdentifier } from '../scripts/retired-names.mjs';

const gitignorePath = path.resolve('.', '.gitignore');

const jsConfig = defineConfig([
  // ESLint recommended config
  {
    name: 'js/config',
    ...js.configs.recommended,
  },
]);

const reactConfig = defineConfig([
  // Airbnb React recommended config
  ...configs.react.recommended,
  // Airbnb React hooks config
  ...configs.react.hooks,
]);

const typescriptConfig = defineConfig([
  // Airbnb React TypeScript config
  ...configs.react.typescript,
]);

const prettierConfig = defineConfig([
  // Prettier plugin
  {
    name: 'prettier/plugin/config',
    plugins: {
      prettier: prettierPlugin,
    },
  },
  // Prettier config
  {
    name: 'prettier/config',
    rules: {
      ...prettierConfigRules,
      'prettier/prettier': 'error',
    },
  },
]);

const overrideConfig = defineConfig([
  {
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.jest,
      },

      parser: tsParser,
      ecmaVersion: 12,
      sourceType: "module",

      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },

        // project: ["tsconfig.json"],
      },
    },

    settings: {
      react: {
        version: "detect",
      },
    },

    rules: {
      "react/prop-types": "error",
      "no-underscore-dangle": "off",

      "no-param-reassign": ["error", {
        props: false,
      }],

      "react/function-component-definition": [2, {
        namedComponents: "arrow-function",
        unnamedComponents: "arrow-function",
      }],

      "no-console": "off",
      "no-alert": "off",
      "no-nested-ternary": "off",
      "import/prefer-default-export": "off",
      "react/require-default-props": "off",
      "react/no-array-index-key": "off",
      "react/jsx-props-no-spreading": "off",

      "react/no-unstable-nested-components": ["error", {
        allowAsProps: true,
      }],

      "react/react-in-jsx-scope": "off",
      "jsx-a11y/anchor-is-valid": "off",
      "class-methods-use-this": "off",
      "no-unused-vars": "off",

      "@typescript-eslint/no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        ignoreRestSiblings: true,
      }],

      "no-plusplus": "off",

      "prettier/prettier": ["error", {
        endOfLine: "auto",
      }],
    },
  },
  {
    files: ["**/*.test.{ts,tsx}", "src/test/**", "vitest.config.ts"],
    rules: {
      "import/no-extraneous-dependencies": ["error", { devDependencies: true }],
    },
  },
])


// Colours come from the theme (src/structsThemes.ts), a palette.ts or a
// constants.ts. A hex literal anywhere else is reported. It is a warning for
// now: 79 literals in 25 files predate it, so it flags new ones without failing CI.
const HEX_COLOUR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;
const structsPlugin = {
  rules: {
    'concise-ui-copy': conciseUiCopy,
    'one-stage-value': oneStageValue,
    'no-hardcoded-colour': {
      meta: {
        type: 'suggestion',
        messages: {
          hex: 'Hardcoded colour {{value}}. Use a value from the theme (src/structsThemes.ts) or a palette/constants file.',
        },
        schema: [],
      },
      create(context) {
        const check = (node, text) => {
          const match = HEX_COLOUR.exec(text);
          if (match) context.report({ node, messageId: 'hex', data: { value: match[0] } });
        };
        return {
          Literal(node) {
            if (typeof node.value === 'string') check(node, node.value);
          },
          TemplateElement(node) {
            check(node, node.value.raw);
          },
        };
      },
    },
  },
};

const coloursConfig = defineConfig([
  {
    name: 'structs/colours',
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/structsThemes.ts', 'src/**/palette.ts', 'src/**/constants.ts'],
    plugins: { structs: structsPlugin },
    rules: { 'structs/no-hardcoded-colour': 'warn' },
  },
]);

// Interface copy stays short (scripts/lint-concise-ui-copy.mjs). It fails CI
// in the newer feature folders and warns elsewhere, where older copy predates it.
const CONCISE_COPY_STRICT = ['src/daily/**/*.tsx', 'src/landing/**/*.tsx', 'src/visualiser/**/*.tsx', 'src/ui/**/*.tsx'];
const copyConfig = defineConfig([
  {
    name: 'structs/concise-ui-copy',
    files: ['src/**/*.tsx'],
    ignores: ['**/*.test.tsx', ...CONCISE_COPY_STRICT],
    plugins: { structs: structsPlugin },
    rules: { 'structs/concise-ui-copy': 'warn' },
  },
  {
    name: 'structs/concise-ui-copy-strict',
    files: CONCISE_COPY_STRICT,
    ignores: ['**/*.test.tsx'],
    plugins: { structs: structsPlugin },
    rules: { 'structs/concise-ui-copy': 'error' },
  },
]);

// ESLint passes each file's absolute path to a function in `files`.
const repoRoot = path.resolve(import.meta.dirname, '..');
const debuggerFile = (kind) => (filePath) => {
  const repoPath = path.relative(repoRoot, filePath).split(path.sep).join('/');
  return inScope(repoPath) && kindOf(repoPath) === kind;
};

const debuggerConfig = defineConfig([
  {
    name: 'structs/one-stage-value',
    files: [debuggerFile('source')],
    plugins: { structs: structsPlugin },
    rules: { 'structs/one-stage-value': 'error' },
  },
  {
    name: 'structs/debugger-tests',
    files: [debuggerFile('test')],
    plugins: { vitest: vitestPlugin },
    rules: {
      'vitest/prefer-each': 'error',
      'vitest/no-identical-title': 'error',
      'vitest/expect-expect': 'error',
    },
  },
  {
    name: 'structs/retired-names',
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'id-denylist': ['error', ...retiredNames],
      'id-match': ['error', studentFreeIdentifier, { properties: true, classFields: true }],
    },
  },
]);

export default defineConfig([
  includeIgnoreFile(gitignorePath),
  ...jsConfig,
  ...reactConfig,
  ...typescriptConfig,
  ...prettierConfig,
  ...overrideConfig,
  ...coloursConfig,
  ...copyConfig,
  ...debuggerConfig,
]);
