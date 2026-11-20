// Helpers for the scripts/pr-rules.*.test.mjs files.

/** A PR with nothing in it, apart from `overrides`. */
export const pr = (overrides = {}) => ({
  files: [],
  tracked: [],
  addedLines: [],
  labels: new Set(),
  ...overrides,
});

export const rulesHit = (result) => result.map((f) => f.rule);

/** The findings as text, so a failed assertion shows what checkPr returned. */
export const show = (result) => JSON.stringify(result.map(({ rule, path }) => ({ rule, path })));

export const DEBUGGER_NEEDS_TEST_MESSAGE =
  'Debugger changes need an e2e test, a Vitest or cargo test, or a known-failures entry. A person can add the "no-test-needed" label to waive this.';

export const PROTECTED_PATHS_MESSAGE =
  'Changes to CI, lint config, the package.json scripts CI runs, agent config or known failures need a person to add the "human-approved" label.';
