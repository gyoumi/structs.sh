# End-to-end feature tests

These tests use structs.sh the way a student would and check what the page
shows. They don't know how the app works inside, so the same tests apply when
part of it is rewritten.

There are two groups:

- **The debugger:** open a C program, compile it, step through it. The same
  tests run against both debuggers:
  - **gdb**, the current one, which runs on the server. This is the default.
  - **wasm**, the replacement being built, which runs in the browser. The page
    uses it when opened with `?debugger=wasm`. See `docs/debugger-rewrite.md`.
- **The landing page and the visualisers:** open a structure, run operations,
  control playback, share a link. These apply to the current frontend and to
  any redesign of it, so a redesign can show it does everything the old one did.

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

The visualiser tests don't need the debugger backend. To run only them:

```sh
pnpm run e2e landing not-found visualiser-navigation linked-list-operations \
  tree-operations sorting editing-data playback sharing
```

Set `E2E_BASE_URL` to test a frontend that is already running, e.g.
`E2E_BASE_URL=http://localhost:3110 pnpm run e2e`.

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
`pnpm run check:known-failures` checks that every entry names a real test and
gives a reason. CI runs it on every PR.

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

## Using this for a frontend redesign

The visualiser tests pass on the current frontend, apart from 2 bugs on both
known-failures lists: rewinding leaves the timeline at the end, and Create Link
is never shown. The suite runs once per debugger, so a visualiser entry goes in
both lists.

A redesign replaces `support/landing-page.ts` and `support/visualiser-page.ts`
and leaves the tests alone. If every test still passes, the redesign does
everything the current frontend does. A feature it drops on purpose goes on the
known-failures lists with the reason, so the gap is written down and reviewed.

## Writing tests

- Each feature is a top-level `test.describe()`. Its name is what the summary
  groups by.
- Describe behaviour, not implementation. Use `stepUntilLine(n)` rather than an
  exact number of clicks, because different debuggers stop on slightly
  different lines.
- Don't assert on compiler wording. gcc and clang phrase errors differently,
  so match the identifier or line number instead.
- Programs go in `programs/`. Comment the line numbers a test relies on.
- Name visualiser operations by the engine's command (`append`,
  `inorderTraversal`), not by a button label. The page object maps them.
- Read the drawing with `values()` and `root()`, which work from the engine's
  SVG, so they don't depend on the UI around it.
- Only the files in `support/` should touch selectors or page internals.

`pnpm run e2e:lint` enforces these, and CI fails on any of them:

- No `page.locator()`, `page.evaluate()` or `getByTestId()` in `tests/`. Add a
  page object method instead.
- No `waitForTimeout()`. Wait for something the user would see.
- No `test.skip()` or `test.only()`. A test that can't pass yet goes in
  that debugger's `known-failures/*.json` list with a reason.
- Every promise is awaited.
