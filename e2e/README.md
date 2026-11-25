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

The daily game lives at `/daily`. On load, it fetches `GET /api/daily`,
which returns:

```json
{
  "number": 12,
  "template": "quicksort-most-comparisons",
  "values": [8, 1, 6, 3, 2, 7, 4, 5],
  "fixed": [1, 4, 6],
  "goal": 34,
  "date": "2026-12-23"
}
```

`values` is the starting arrangement and `fixed` holds the 0-based indices of
locked slots. The page shows what the server returns and never computes `goal`.
There is no `best` field: the solver's best score stays on the server, and the
page must never show a best score. If a response does carry an extra field such
as `best`, the page ignores it.

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

- **Rules:** `region` named `Challenge rules`. It must contain the sentence
  `Reorder the numbers so quicksort makes as many comparisons as possible.`
  It also explains that quicksort picks the leftmost number in each range as
  the pivot (the text mentions both `leftmost` and `pivot`), for example
  `Quicksort always picks the leftmost number in each range as the pivot.`
  Those two sentences are the only rules prose shown by default. The region
  has no `You have N tries` sentence (nothing matching `/you have \d+ tries/i`)
  and no `Tap or click...` swap instructions (nothing matching
  `/tap or click/i`); the lock icons, slots, `Tries left` and `Run` already
  say this.
  - The keyboard help sits in a native `<details>` inside the region whose
    `<summary>` text is exactly `Keyboard controls`. It is closed when the page
    loads, so the keyboard help (text matching `/Enter or Space/i`) is hidden.
    Clicking the summary opens it and shows the help; clicking again closes it.
- **Challenge array:** `group` named `Challenge array`, containing one `button` per
  slot in left-to-right order.
  - The group shows no static `Pivot` label (no text containing `pivot`).
    Slot 0 is only the first pivot; the pivot moves right as quicksort
    recurses, so a tag fixed over slot 0 would mislead.
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
    challenge ends.
    Clicking `Run` also scrolls the page so both the visualiser stage
    (`#visualiser-container`) and the `Playback` toolbar are fully in view,
    on desktop and on a 390x844 phone, so the player can watch the sort.
    Pressing `Enter` on a focused `Run` moves focus straight to `Skip`, so the
    next key press can skip the animation.
  - `button` `Skip`: jumps the animation straight to the final comparison count
    and completes the try, whether playback is playing or paused.
  - `button` `Share`: visible and enabled once the challenge ends; copies the share
    text to the clipboard via `navigator.clipboard.writeText`.
- **Playback controls:** the visualiser's controls (`toolbar` `Playback` with
  buttons `Play`, `Pause`, `Replay`, `Previous step`, `Next step`,
  `Back to the start`, and `Skip to the end`; `slider` `Animation progress` from
  `0` to `100`, using either a native range input or `aria-valuenow`; `combobox`
  `Speed` from `0.25×` to `5×`). Replaying a finished run does not use a try.
- **Status readouts** (`role="status"` or `<output>`). Give each readout its
  accessible name with `aria-label`, `aria-labelledby`, or a `<label for>` on
  `<output>`, because `role="status"` does not take its accessible name from its
  inner text:
  - `status` `Goal`: shows the challenge's goal (the `goal` field in the JSON).
  - `status` `Comparisons`: starts at `0`, rises with each comparison during the
    animation (changing by at most `1` per timeline step), and follows the
    timeline so stepping back lowers it (add `aria-live="off"` if you want to
    avoid screen-reader chatter while animating).
  - `status` `Score`: shows the last run's score while tries remain, and the
    highest score across all tries once the challenge ends.
  - `status` `Tries left`: starts at `3` and decrements after each try (`2`,
    `1`, `0`).
  - `status` `Goal reached`: visible whenever the score shown in `Score`
    reaches or beats the goal (`score >= goal`): after a try that does, and at
    the end when the highest try did. The text inside is up to the page.
  - There is no `Best` or `Best reached` status, at any point.

Players always get three tries, and the challenge never ends early. Reaching or
beating the goal announces `Goal reached` and still offers the next try while
tries remain. After the third try, the challenge ends: `Tries left` is `0`, `Run`
is disabled or hidden, `Score` shows the highest of the three scores, and
`Share` appears.

The share text copied by `Share` has a header naming the goal, then one line
per try with ` ⭐` at or above the goal. It never includes the arrangement, a
best score, or ` 🏆`:

```text
structs.sh daily #12 · Quicksort · Goal 34
30
34 ⭐
36 ⭐
structs.sh/daily
```

### Checkpoint 2 templates

The checkpoint 2 tests (`tests/daily-game-sorting.spec.ts`, `daily-game-trees.spec.ts`,
`daily-game-forced-order.spec.ts` and `daily-game-linked-list.spec.ts`) serve one
challenge per template. Everything above still applies to every template unless this
section says otherwise: `Challenge rules`, `Challenge array` and its slots (swapping by
tap, keyboard and phone), `Run`, `Skip`, `Share`, the `Playback` toolbar, `Goal`,
`Score`, `Tries left` and `Goal reached`, three tries, and no best score anywhere.
`Comparisons` belongs to quicksort only. The JSON shapes are the ones in
`docs/daily-game.md` (Checkpoint 2, Decisions); `bst-forced-order` has no `fixed`
field, so none of its slots is locked.

**Rules.** `Challenge rules` describes the served template and must contain no text
matching `/quicksort|pivot/i`. It must contain:

| Template | Text the rules must match |
|---|---|
| `bubble-exact-passes` | `/exactly <targetPasses> passes/i` (for example `exactly 4 passes`) and `/swaps/i` |
| `insertion-beats-merge` | `/insertion sort/i` and `/merge sort/i` |
| `avl-most-rotations` | `/rotations/i` |
| `bst-forced-order` | `/target tree/i` |
| `upset-bst-beats-avl` | `/\bBST\b/` and `/\bAVL\b/` |
| `linked-list-index-drift` | `/target list/i` |

**Readouts** (`role="status"` or `<output>`, named as in checkpoint 1). Counters
start at `0` and rise as the animation plays by itself after `Run`: while
`Animation progress` is still below 100, each counter passes through values
strictly between `0` and its final count, so a counter that jumps straight to its
final count on `Run` fails. Counters follow the timeline (`Back to the start`
resets them to `0`, `Skip` and `Skip to the end` bring them to the final count)
and stay at the final count after a try.
Arrangement readouts show the current arrangement and update on every swap.

| Template | Counters | Other readouts | Score of a solved try |
|---|---|---|---|
| `bubble-exact-passes` | `Passes`, `Swaps` | `Target passes` (`targetPasses`) | swaps |
| `insertion-beats-merge` | `Insertion comparisons`, `Merge comparisons` | `Out-of-order pairs` (arrangement) | out-of-order pairs |
| `avl-most-rotations` | `Rotations` | | rotations (always solved) |
| `bst-forced-order` | | `Increasing run` (arrangement) | longest increasing run |
| `upset-bst-beats-avl` | `BST nodes passed`, `AVL nodes passed` | | `AVL nodes passed - BST nodes passed` |
| `linked-list-index-drift` | `Operations`, `Nodes walked`, `Cost` | | cost (lower wins) |

How each count works:

- **Passes:** each run of `bubble.ts`'s outer loop that makes at least one
  comparison, including the final pass that makes no swaps. An outer iteration
  that makes no comparison is not a pass: when all `n - 1` passes swap,
  `bubble.ts` still runs an `n`-th iteration (`i = n - 1`, so `j < n - i` is
  `1 < 1`) that compares nothing, and `Passes` stays at `n - 1`. So there are at
  most `n - 1` passes. Solved when `Passes` equals `targetPasses`.
- **Insertion comparisons:** each evaluation of `val >= a[j - 1]` in
  `insertion.ts`. **Merge comparisons:** each comparison of the two halves in
  `merge.ts` (split at `floor((lo + hi) / 2)`, left wins ties). Solved only when
  insertion compares strictly less; a tie is unsolved.
- **Out-of-order pairs:** pairs `i < j` with `a[i] > a[j]`.
- **Rotations:** single rotations while inserting the keys in slot order into an
  empty AVL tree. LL and RR count 1; LR and RL are double rotations and count 2.
- **Increasing run:** the longest run of neighbouring slots that strictly
  increases. Solved when inserting the slots in order into an empty BST gives a
  tree whose preorder equals `targetTree`.
- **Nodes passed:** each existing node an insert compares against on its way down,
  so the first key passes 0. Rotations are not counted. Solved when the BST passes
  fewer nodes than the AVL tree.
- **Cost:** `Operations + Nodes walked`. `insert(value, i)` walks
  `min(i, length before)` nodes and `delete(i)` walks `i + 1`. Solved when the final
  list equals `target`.

**Solved and unsolved tries.** Bubble, insertion beats merge, forced order, upset
and index drift tries can be unsolved. An unsolved try still uses a try and leaves
its counters at their final counts, and:

- `status` `Try result` is visible and says why. It must mention:
  - bubble: the pass count and `targetPasses` as numbers, and `pass` (for example
    `Took 5 passes — needed 4`);
  - insertion beats merge: the insertion count, and `insertion` and `merge`
    (for example `Insertion made 16 comparisons — merge made 16`);
  - upset: both node counts, and `BST` and `AVL`;
  - forced order and index drift: `target` (for example `That order builds a
    different tree from the target.`).
- While tries remain, `Score` shows no number (hidden, or text without digits
  such as `–` or `✗`) and `Goal reached` is hidden, whatever the secondary count.

A solved try always outranks an unsolved one. What `Try result`, `Score` and
`Goal reached` describe depends on whether the challenge has ended:

- **While tries remain** (after try 1 or 2), all three describe the try that just
  finished. A solved try hides `Try result`, shows its score in `Score`, and shows
  `Goal reached` when it meets the goal. An unsolved try shows `Try result`,
  leaves `Score` with no number and hides `Goal reached`.
- **Once the third try finishes** (the challenge has ended), `Try result` still
  describes that third try: visible when it was unsolved, hidden when it was
  solved. `Score` and `Goal reached` instead describe the best solved try across
  all three tries (the highest score, or for index drift the lowest cost), even
  when the third try was unsolved. `Goal reached` shows when that best solved try
  meets the goal (`score >= goal`, or `cost <= goal` for index drift). If all three
  tries were unsolved, `Score` has no number and `Goal reached` stays hidden.

**Try chips:** `list` `Tries` holds 3 `listitem`s. A spent chip reads `✗` when
unsolved, and `<score>` or `<score> ⭐` (at or beyond the goal) when solved.

**Two stages** (`insertion-beats-merge`: `region` `Insertion sort` and `region`
`Merge sort`; `upset-bst-beats-avl`: `region` `BST` and `region` `AVL tree`). Each
region draws its algorithm in an `<svg>`. On desktop the first region sits fully to
the left of the second, on the same row; on a 390x844 phone the first is stacked
above the second and both fit the screen's width. There is exactly one `toolbar`
`Playback`, and it drives both: `Skip`, stepping, rewind, replay and speed act on
both stages together.

The tests read each stage's drawing from its `<svg>`: every visible `<text>` whose
content is a whole number is a drawn value (as in the single-stage visualisers,
anything hidden with `opacity: 0`, `visibility: hidden` or `display: none` is
skipped). Nothing else in a stage's `<svg>` may be a bare whole number.

- Sorting stages draw one value per slot, read left to right: the arrangement
  before `Run` and after `Back to the start`, and the sorted values after `Skip`
  and `Skip to the end`. During a merge, a value may move down a row; it is back
  in the top row by the end.
- Tree stages draw one node per inserted key, laid out so that left to right is
  in order and each subtree's root is drawn above it (as in the BST and AVL
  visualisers). Neither tree draws a key before `Run` or after `Back to the
  start`. After `Skip` and `Skip to the end`, the BST stage draws the plain BST
  of every key in slot order and the AVL tree stage draws the AVL tree after its
  rotations.
- From `Back to the start`, pressing `Next step` repeatedly changes both drawings
  (a value moves, is highlighted, or a key appears) before `Animation progress`
  reaches 100. From the end, `Replay` resets and advances both stages through
  multiple non-final frames while it plays. Single-stage templates keep `#visualiser-container`, and Run
scrolls it and `Playback` into view as in checkpoint 1.

**Target tree** (`bst-forced-order`): a `figure` named `Target tree` (for example
`<figure aria-label="Target tree">`) draws the target BST in an `<svg>` (using
visible `<text>` nodes positioned left to right in order with each subtree root
above its children, as in the BST visualiser) and contains its preorder as text
joined by `, ` (for example `Preorder: 6, 3, 1, 2, 5, 4, 9, 7, 8, 10`, visible
or visually hidden). It stays visible after each try.

**Operation builder** (`linked-list-index-drift`, which has no `Challenge array`):

- `list` `Start list` and `list` `Target list`, one `listitem` per node, front to
  back, each starting with its number.
- `group` `Operation builder` containing `combobox` `Operation` with options
  `insert` and `delete` (a native `<select>` or a listbox), `spinbutton` `Value`
  and `spinbutton` `Index` (`<input type="number">`), and `button` `Add operation`.
  Value is only used for `insert`.
- `list` `Operation list` with one `listitem` per added operation, in order, whose
  text contains `insert(<value>, <index>)` or `delete(<index>)`.
- `button` `Clear operations` empties the list.
- `Run` is disabled while the list is empty. Run animates the operations on the
  start list. After a try the operation list stays as the player left it.

**Share text.** The header names the template and the goal; each try line is
`✗` for an unsolved try, or the score with ` ⭐` at or beyond the goal:

| Template | Header |
|---|---|
| `bubble-exact-passes` | `structs.sh daily #21 · Bubble sort · Goal 11` |
| `insertion-beats-merge` | `structs.sh daily #22 · Insertion beats merge · Goal 10` |
| `avl-most-rotations` | `structs.sh daily #23 · AVL tree · Goal 6` |
| `bst-forced-order` | `structs.sh daily #24 · Forced order · Goal 5` |
| `upset-bst-beats-avl` | `structs.sh daily #25 · Upset · Goal 4` |
| `linked-list-index-drift` | `structs.sh daily #26 · Index drift · Goal 6` |

```text
structs.sh daily #26 · Index drift · Goal 6
✗
5 ⭐
14
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

A redesign replaces `support/landing-page.ts`, `support/visualiser-page.ts` and
`support/transport-controls.ts` (the playback controls, shared with /daily), and
leaves the tests alone. If every test still passes, the redesign does
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
