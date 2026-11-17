# Testing expectations

These apply to every change in this repo, by people and agents alike.

## Every behaviour change comes with a test

A change that alters what the code does includes a test that fails without
it. Pick the cheapest level that would catch the change breaking:

| What changed | Test with | Where |
|---|---|---|
| Logic that runs without a page: parsers, stores, helpers, and the debugger rewrite's compiler, runner, recorder and adapter | Vitest | `client/src/**/*.test.ts`, next to the code |
| What a student sees in the visual debugger | Playwright e2e | `e2e/tests/` (see `e2e/README.md`) |
| The wasm debugger's Rust instrumenter | `cargo test` | `instrumenter/tests/`, with programs compiled by clang in `tests/fixtures/` |
| The GDB backend, until it is deleted | pytest | `debugger/src/debugger/test/` |
| Visualiser animation or layout | Screenshots, read and shown to the user | See the `ui-visual-test` skill. There is no baseline suite |

Refactors, renames, and type-only changes don't need a new test, but the
existing tests must still pass.

A new package or language (for example the Rust instrumenter) brings its own
test runner, and gets a step in `.github/workflows/pre-merge.yml` in the same
PR.

## Write the test first

- For a new feature or a bug fix, write the failing test first, run it, and
  check it fails for the reason you expect.
- When the user reported the bug, the test checks exactly what they saw.
- When a test is added after the code, prove it can fail: break the code on
  purpose, watch the test fail, then put the code back.
- Exploring something unknown (how clang lays out DWARF, what GDB sends) can
  start with a throwaway script. Write the real tests once you know what
  "right" looks like.

## Test behaviour, not implementation

- Assert on what a caller or a student can observe, not on private details.
- In e2e tests, only `e2e/support/debugger-page.ts` touches selectors or page
  internals.
- Don't assert on compiler wording. gcc and clang phrase errors differently,
  so match the identifier or line number.
- Prefer real recordings over hand-written fixtures (for example a state
  recorded from the GDB debugger). Say in the test where the recording came
  from. GDB has its own bugs, so check a recording by hand before trusting it.
- No fixed sleeps. Wait for a condition.

## The e2e suite is the spec for the debugger rewrite

- Don't edit an e2e test to make the wasm debugger pass. If the debugger
  works differently inside, change `e2e/support/debugger-page.ts`, not the
  test.
- A behaviour that doesn't work yet goes on that debugger's known-failures
  list, with a reason. When it starts passing, remove the entry in the same
  PR.
- Avoid behaviour that differs between native code and wasm: pointer sizes,
  NULL dereferences that don't trap, memory that starts zeroed, and stdin
  under record and replay.

## Never make a run green by weakening it

- Don't delete, skip, or loosen a test to get CI passing. If a test is wrong,
  fix it and say why in the PR.
- Don't commit `.only` or `.skip`.
- Don't mock the thing under test.

## Report what was actually run

Say which checks ran and their results. If something couldn't run (no
debugger running, a network problem, a missing tool), say that, and don't
describe it as passing.

## Commands

| Check | Command |
|---|---|
| Unit tests | `pnpm run instrumenter`, then `cd client && pnpm test` (`pnpm test:watch` while working) |
| Instrumenter | `cd instrumenter && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test` |
| Client types, lint, build | `cd client && pnpm run tsc && pnpm run lint && pnpm run build` |
| e2e | `docker compose up -d debugger`, then `pnpm run e2e:typecheck && pnpm run e2e` from the repo root |
| One e2e behaviour | `pnpm run e2e -g "<behaviour>"` |
| Debugger backend | `cd debugger && uv run pytest` |
