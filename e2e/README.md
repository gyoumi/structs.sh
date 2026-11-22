# End-to-end feature tests

These tests use structs.sh the way a user would and check what the page
shows. They don't know how the app works inside, so the same tests apply when
part of it is rewritten.

There are two groups:

- **The debugger:** open a C program, compile it, step through it. The
  debugger runs in the browser (see `docs/debugger-rewrite.md`), so there is
  no backend to start.
- **The landing page and the visualisers:** open a structure, run operations,
  control playback, share a link. These apply to the current frontend and to
  any redesign of it, so a redesign can show it does everything the old one did.

## Running

From the repo root:

```sh
pnpm install                             # the frontend and the e2e suite
pnpm exec playwright install chromium
pnpm run instrumenter                    # needs Rust; see instrumenter/README.md
pnpm run e2e                             # builds the frontend and serves the build
```

`pnpm run e2e` tests the production build, which is what users get: it
runs `pnpm run build` in `client/` and serves the result with `vite preview`
on port 4173. The dev server behaves differently in places (React's
StrictMode runs effects twice there), and a bug once showed only in
production. A server already on port 4173 is reused, so stop it after
changing the client, or the tests see the old build.

To run only the visualiser tests:

```sh
pnpm run e2e landing not-found visualiser-navigation linked-list-operations \
  tree-operations sorting editing-data playback sharing
```

Set `E2E_BASE_URL` to test a frontend that is already running, e.g.
`E2E_BASE_URL=http://localhost:3110 pnpm run e2e`. To test the dev server
(`pnpm --dir client start`), point `E2E_BASE_URL` at it.

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

`pnpm run e2e:report` opens the HTML report with traces and screenshots of failures.

## Known failures

`known-failures/*.json` (such as `known-failures/wasm.json` and
`known-failures/game.json`) lists the behaviours that don't work yet, each with
a reason.
Those tests are expected to fail, so they don't turn the run red. When one
starts passing, Playwright reports it as a failure so it gets removed from the
list: a fixed feature can't stay marked as broken, and a broken one can't be
added silently.

`pnpm run e2e:strict` ignores the list and shows raw results.
`pnpm run check:known-failures` checks that every entry names a real test and
gives a reason. CI runs it on every PR.

## The daily game

The daily game lives at `/daily`. On load, it fetches `GET /puzzles/today.json`,
which returns:

```json
{
  "number": 12,
  "template": "quicksort-most-comparisons",
  "values": [8, 1, 6, 3, 2, 7, 4, 5],
  "fixed": [1, 4, 6],
  "par": 34,
  "best": 36
}
```

`values` is the starting arrangement and `fixed` holds the 0-based indices of
locked slots. The page shows what the file says and never computes `par` or
`best`.

A comparison is every evaluation of a comparison between two array values in
the C code shown beside the animation
(`client/src/visualiser-src/sorting-visualiser/util/codeSnippets.ts`): each
evaluation of `a[i] <= v` in the first `while` loop (including the one that
ends it), each evaluation of `v < a[j]` in the second (including the one that
ends it), and `a[i] < v` once after each partition. The C code shown beside the
animation contains every counted comparison; `quick.ts` also checks
`elements[j].data.value > v` only to choose a highlight, and that check does
not count. Index-only checks (`i < j`, `hi <= lo`) do not count.

The sorting visualiser draws into `#visualiser-canvas` as it does today. The
rest of the e2e tests drive `/daily` only through ARIA roles and accessible
names:

- **Rules:** `region` named `Puzzle rules`. It must contain the sentence
  `Reorder the numbers so quicksort makes as many comparisons as you can.`
- **Puzzle array:** `group` named `Puzzle array`, containing one `button` per
  slot in left-to-right order.
  - Each slot button's text starts with its numeric value (for example `8`).
    Hide any lock icon with `aria-hidden="true"`.
  - Fixed slots are disabled (`disabled` or `aria-disabled="true"`). Clicking or
    tapping a fixed slot never selects or swaps it.
  - Free slots carry `aria-pressed="true"` when selected and
    `aria-pressed="false"` when unselected.
  - Clicking or tapping two free slots swaps their values and clears the
    selection. Clicking a selected slot deselects it. This also works on a
    390x844 touch screen.
  - Every slot button fits fully within the width of a 390x844 screen (no
    horizontal overflow).
  - From the keyboard, focusing a free slot and pressing `Enter` or `Space`
    selects it (`aria-pressed="true"`). While selected, `ArrowRight` swaps it
    with the neighbouring free slot to the right (skipping any fixed slots) and
    keeps focus and selection on the moved value; `ArrowLeft` does the same to
    the left. With a value selected, pressing `Enter` or `Space` on the
    selected slot clears the selection; pressing `Enter` or `Space` on a
    different free slot swaps the two and clears the selection, as tapping two
    values does; pressing `Escape` on any slot clears the selection.
  - After a try finishes, the array stays in the arrangement the player ran, so
    the next try starts from there.
- **Action buttons (exact names):**
  - `button` `Run`: starts a try on the current arrangement and starts playback
    by itself. Disabled while a run animates, and disabled or hidden once the
    puzzle ends.
  - `button` `Skip`: jumps the animation straight to the final comparison count
    and completes the try, whether playback is playing or paused.
  - `button` `Share`: visible and enabled once the puzzle ends; copies the share
    text to the clipboard via `navigator.clipboard.writeText`.
- **Playback controls:** the visualiser's controls (`toolbar` `Playback` with
  buttons `Play`, `Pause`, `Replay`, `Previous step`, `Next step`,
  `Back to the start`, and `Skip to the end`; `slider` `Animation progress` from
  `0` to `100`, using either a native range input or `aria-valuenow`; `combobox`
  `Speed` from `0.25×` to `2×`). Replaying a finished run does not use a try.
- **Status readouts** (`role="status"` or `<output>`). Give each readout its
  accessible name with `aria-label`, `aria-labelledby`, or a `<label for>` on
  `<output>`, because `role="status"` does not take its accessible name from its
  inner text:
  - `status` `Goal`: shows the puzzle's goal (the `par` field in the JSON).
  - `status` `Comparisons`: starts at `0`, rises with each comparison during the
    animation (changing by at most `1` per timeline step), and follows the
    timeline so stepping back lowers it (add `aria-live="off"` if you want to
    avoid screen-reader chatter while animating).
  - `status` `Score`: shows the last run's score while tries remain, and the
    highest score across all tries once the puzzle ends.
  - `status` `Tries left`: starts at `3` and decrements after each try (`2`,
    `1`, `0`).
  - `status` `Best`: hidden until the puzzle ends (either by reaching `best`
    early or after the third try), then visible with the puzzle's `best` number.
  - `status` `Goal reached`: visible after a try that reaches the goal (`par`)
    and is below `best`. The text inside is up to the page.
  - `status` `Best reached`: visible after a try that reaches `best`. The text
    inside is up to the page.

Players get three tries. Reaching the goal announces `Goal reached` and still
offers the next try. Reaching `best` announces `Best reached`, reveals `Best`,
and ends the puzzle early. After the third try, the puzzle ends with the highest
of the three scores and reveals `Best`.

The share text copied by `Share` uses one line per try, with ` ⭐` at or above
the goal (below `best`) and ` 🏆` on `best`, and never includes the arrangement:

```text
structs.sh daily #12 · Quicksort
30 / 36
34 / 36 ⭐
36 / 36 🏆
structs.sh/daily
```

## Changing the debugger

The suite was the spec for rewriting the debugger to run in the browser, and
it still checks what a user sees. If the debugger works differently inside,
update `support/debugger-page.ts`. The test files themselves shouldn't need to
change.

## Using this for a frontend redesign

The visualiser tests pass on the current frontend, apart from 2 bugs on the
known-failures list: rewinding leaves the timeline at the end, and Create Link
is never shown.

A redesign replaces `support/landing-page.ts` and `support/visualiser-page.ts`
and leaves the tests alone. If every test still passes, the redesign does
everything the current frontend does. A feature it drops on purpose goes on the
known-failures list with the reason, so the gap is written down and reviewed.

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
  `known-failures/wasm.json` with a reason.
- Every promise is awaited.
