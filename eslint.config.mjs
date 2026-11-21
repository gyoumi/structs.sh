// Lint rules for the e2e suite. The client has its own config in client/.
//
// These turn the e2e conventions from e2e/README.md and the review checklist
// into errors, so a broken convention fails CI instead of relying on review.
import playwright from 'eslint-plugin-playwright';
import tseslint from 'typescript-eslint';
import { retiredNames, studentFreeIdentifier } from './scripts/retired-names.mjs';

const pageInternals = ['locator', 'evaluate', '$', '$$', '$eval', '$$eval', 'getByTestId'];

export default tseslint.config(
  { ignores: ['e2e/playwright-report/**', 'e2e/test-results/**'] },
  {
    files: ['e2e/**/*.ts'],
    extends: [tseslint.configs.base, playwright.configs['flat/recommended']],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // Wait on something the user can see, never on the clock.
      'playwright/no-wait-for-timeout': 'error',
      // Expected failures go in e2e/known-failures/<debugger>.json, with a reason.
      'playwright/no-skipped-test': 'error',
      'playwright/no-focused-test': 'error',
      'playwright/missing-playwright-await': 'error',
      // A missing await lets a test finish before the browser does.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // Polling loops in tests are written as expect(...).toPass() or a web-first assertion.
      'playwright/no-wait-for-selector': 'error',
      // These DebuggerPage helpers fail the test themselves when the behaviour is wrong.
      'playwright/expect-expect': [
        'error',
        { assertFunctionNames: ['startSession', 'stepUntilLine', 'runToEnd'] },
      ],
      'id-denylist': ['error', ...retiredNames],
      'id-match': ['error', studentFreeIdentifier, { properties: true, classFields: true }],
    },
  },
  {
    // Tests describe behaviour. Only e2e/support/debugger-page.ts knows the page's markup.
    files: ['e2e/tests/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        ...pageInternals.map((method) => ({
          selector: `CallExpression[callee.object.name='page'][callee.property.name='${method}']`,
          message: `Tests don't touch page internals. Add a method to e2e/support/debugger-page.ts instead of calling page.${method}().`,
        })),
      ],
    },
  },
);
