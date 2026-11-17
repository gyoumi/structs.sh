# End-to-end feature tests

These tests use the visual debugger the way a student would: open a C program,
compile it, step through it, and check what the page shows. They don't know
how the debugger works inside, so the same tests run against both debuggers:

- **gdb**, the current one, which runs on the server. This is the default.
- **wasm**, the replacement being built, which runs in the browser. The page
  uses it when opened with `?debugger=wasm`. See `docs/debugger-rewrite.md`.

## Running

From the repo root:

```sh
docker compose up -d debugger            # the current backend
pnpm install                             # the frontend and the e2e suite
pnpm exec playwright install chromium
pnpm run e2e                             # starts the frontend if it isn't running
```

To run against the wasm debugger, which needs no server but does need its
instrumenter built (see `instrumenter/README.md`):

```sh
pnpm run instrumenter                    # needs Rust
pnpm run e2e:wasm                        # the same as E2E_DEBUGGER=wasm pnpm run e2e
```

After each run, a per-feature summary is printed:

```
Feature progress (gdb debugger)

  compiling                  3/3 working
  linked list visualisation  2/2 working
  program output             0/1 working  (1 on the known-failures list)
  stepping                   3/6 working  (3 on the known-failures list)
  types and variables        3/3 working

  11/15 behaviours working
```

`pnpm run e2e:report` opens the HTML report with traces and screenshots of failures.

## Known failures

`known-failures/gdb.json` and `known-failures/wasm.json` list the behaviours
that don't work yet on each debugger, each with a reason.
Those tests are expected to fail, so they don't turn the run red. When one
starts passing, Playwright reports it as a failure so it gets removed from the
list: a fixed feature can't stay marked as broken, and a broken one can't be
added silently.

`pnpm run e2e:strict` ignores the list and shows raw results.

## Using this during the rewrite

CI runs the suite against both debuggers.

1. **gdb** passes everything apart from 4 bugs in the current app, which are on
   its known-failures list.
2. **wasm** starts with every test on its list, at `0/15 working`.
3. **As features are rebuilt on wasm,** its tests start passing and are
   reported as "now passing". Remove each from `known-failures/wasm.json` in
   the same PR.
4. **When wasm reaches 15/15,** it becomes the default and the gdb job and
   list are deleted.

If the wasm debugger works differently inside, update `support/debugger-page.ts`.
The test files themselves shouldn't need to change.

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
