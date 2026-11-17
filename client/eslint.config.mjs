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
  }
])


// Colours come from the theme (src/structsThemes.ts), a palette.ts or a
// constants.ts. A hex literal anywhere else is reported. It is a warning for
// now: 79 literals in 25 files predate it, so it flags new ones without failing CI.
const HEX_COLOUR = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/;
const structsPlugin = {
  rules: {
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

export default defineConfig([
  includeIgnoreFile(gitignorePath),
  ...jsConfig,
  ...reactConfig,
  ...typescriptConfig,
  ...prettierConfig,
  ...overrideConfig,
  ...coloursConfig,
]);
