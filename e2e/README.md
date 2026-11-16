# End-to-end feature tests

These tests use the visual debugger the way a student would: open a C program,
compile it, step through it, and check what the page shows. They don't know
how the debugger works inside, so the same tests apply to the current gdb
backend and to the Rust + wasm debugger that will replace it.

## Running

```sh
docker compose up -d debugger   # the current backend
cd e2e
npm ci
npx playwright install chromium
npm test                        # starts the frontend if it isn't running
```

After each run, a per-feature summary is printed:

```
Feature progress

  compiling                  3/3 working
  linked list visualisation  2/2 working
  program output             0/1 working  (1 on the known-failures list)
  stepping                   3/6 working  (3 on the known-failures list)
  types and variables        3/3 working

  11/15 behaviours working
```

`npm run report` opens the HTML report with traces and screenshots of failures.

## Known failures

`known-failures.json` lists behaviours that don't work yet, each with a reason.
Those tests are expected to fail, so they don't turn the run red. When one
starts passing, Playwright reports it as a failure so it gets removed from the
list: a fixed feature can't stay marked as broken, and a broken one can't be
added silently.

`npm run test:strict` ignores the list and shows raw results.

## Using this during the rewrite

1. **Now:** everything passes, apart from 4 bugs in the current app that are on
   the known-failures list.
2. **When the gdb backend is deleted:** the summary drops to `0/15 working`.
3. **As features are rebuilt:** the summary climbs back. When a bug on the
   known-failures list is fixed by the rewrite, remove its entry.

Expect to update `support/debugger-page.ts` and the "Start debugger" step in
`.github/workflows/e2e.yml` along the way. The test files themselves shouldn't
need to change.

## Writing tests

- Each feature is a top-level `test.describe()`. Its name is what the summary
  groups by.
- Describe behaviour, not implementation. Use `stepUntilLine(n)` rather than an
  exact number of clicks, because different debuggers stop on slightly
  different lines.
- Don't assert on compiler wording. gcc and clang phrase errors differently,
  so match the identifier or line number instead.
- Programs go in `programs/`. Comment the line numbers a test relies on.
- Only `support/debugger-page.ts` should touch selectors or page internals.
