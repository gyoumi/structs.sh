# Daily game MVP

This is the plan for stage 1 of `roadmap.md`: a daily puzzle game built on
the visualisers that exist today. Each day the game names an algorithm, and
the player designs an input that pushes it as far as possible. The browser
scores each run with a wasm build of the Rust puzzle code. A small server
hands out today's puzzle, and streaks and history stay in the browser. There
are no accounts and no leaderboard yet.

The templates are listed in `puzzle-ideas.md`, and the crates, server and
deployment are described in `roadmap.md`. This document only orders the work.

None of the decisions below are final. Change this document when they change.

## Branches

- `daily-game` is the parent branch, created from the fork's `dev`. Every
  game PR targets it, not `dev`.
- Merge `dev` into `daily-game` regularly, so the final merge stays small.
- `daily-game` is merged into `dev` at the goal, after the debugger rewrite
  has gone into `devsoc-unsw/structs.sh`. That way the debugger's upstream PR
  carries only the debugger.
- PR checks (pre-merge and e2e) run on `daily-game` PRs as usual.

## How progress is measured

As with the debugger, the Playwright suite is the spec. Each checkpoint
starts by writing its game tests, from what a player sees, before any of its
code. They start on a known-failures list (`e2e/known-failures/game.json`),
which shrinks as the features land. Each run ends with a summary such as
`4/12 behaviours working`.

Tests for later checkpoints aren't written early, because they check screens
that haven't been designed yet. What each checkpoint's tests should cover:

| Checkpoint | Tests |
|---|---|
| 1 | The 12 tests listed in step 1a. |
| 2 | Each of the seven launch templates loads and plays (one test each). An exact-target puzzle says whether it's solved, and shows its second count. |
| 3 | Today's puzzle comes from the server. A result survives a refresh. Playing on consecutive days builds a streak, and missing a day resets it. The puzzle changes at midnight in Sydney, including on a daylight saving day. The page says so when the server can't be reached. Share text includes the streak. |

The test writer can change the list. If they do, change this table.

Under the e2e suite:

- **Parity tests** (Vitest) run each template's Rust scoring and the
  TypeScript visualiser on the same fixed inputs, and check the counts match.
  The game has two copies of each algorithm, one to score and one to animate,
  so this is what stops them drifting apart.
- **`cargo test`** covers `daily-challenges` and the game server, in this repo.
- **`daily-generator`'s tests**, in the private repo, check the solver against
  the figures in `puzzle-ideas.md`.

`.claude/rules/testing.md` applies as usual. Tests come first, and they're
written by a different agent from the code.

## Checkpoints

```
Today ──► 1. One puzzle plays ──► 2. Every day is new ──► 3. It runs daily ──► Tidy ──► Goal: launched
           └ tidy step at the end of each checkpoint and of the goal ┘
```

### 1. One puzzle plays

A quicksort puzzle, hard-coded in the client, can be played start to finish
in the browser. The player swaps the free values, presses Run, watches the
existing sorting visualiser animate the run, and sees a score and a goal. They
get three tries. The
score comes from `daily-challenges` built to wasm, with no server.

This tests the riskiest parts first:

- the second wasm build next to the instrumenter's;
- the Rust count and the animation agreeing;
- whether someone new understands the puzzle and wants to play it again.

None of this needs the generator or the server.

**Done when:** checkpoint 1's 12 game tests pass, the parity test passes for quicksort,
and three people who haven't seen the game play it without help. What
confused them is written here.

See "Checkpoint 1, step by step".

### 2. Every day is new

All seven launch templates are playable. `daily-generator` generates
instances for them, finds the best score and goal, rejects instances that fail the checks, and
grades difficulty. The game page can load any puzzle it produces.

**Done when:** checkpoints 1 and 2's game tests pass, every launch template has a passing
parity test, and `daily-generator` fills three weeks of the weekday schedule
with puzzles that pass every check.

See "Checkpoint 2, step by step".

### 3. It runs daily

`daily-server` serves today's puzzle from Postgres. The page keeps
streaks and history in the browser, and the whole stack runs locally and in
CI, with `daily-generator` filling the database.

**Done when:** every game test passes against the running stack in CI.

See "Checkpoint 3, step by step".

### Goal: launched

- The debugger rewrite is in `devsoc-unsw/structs.sh` first.
- `daily-game` merges into the fork's `dev`, and then into
  `devsoc-unsw/structs.sh` `dev`.
- DevSoc's deployment changes are made (see "Deployment" in `roadmap.md`).
  They depend on the answers to the open questions there.
- Two to three weeks of puzzles are queued.
- The landing page links to the game.

**Done when** someone with no context can play today's puzzle on
structs.sh, share the result, and come back tomorrow with their streak
intact.

See "The goal, step by step".

## Checkpoint 1, step by step

```
1a. Tests ──┬─► 1b. Rust scores quicksort ──► 1c. Wasm in the client ──► 1d. Parity ──┐
            └─► 1e. Puzzle page ─────────────────────────────────────────────────────┴─► 1f. Run and score ──► 1g. Layout ──► 1h. Playtest ──► 1i. Tidy
```

1b to 1d and 1e don't depend on each other, so they can be built at the
same time. 1f needs both.

### Decisions

- **The first template is "Quicksort: the most comparisons".** Its input is
  an array with some values fixed, which the sorting visualiser already
  draws, and its checks passed (see `puzzle-ideas.md`).
- **A comparison is any comparison of two values in the code the page
  shows**, including the one that ends a loop and the one after each
  partition that places the pivot (`a[i] < v`). `quick.ts` also compares
  `a[j] > v` to decide what to highlight, which isn't in the code shown, so
  it doesn't count. Today the quicksort animation shows a pointer moving but
  not every comparison, so it gains a step for each one, and the page shows
  a counter that goes up on each.
- **The player taps two free values to swap them.** It works on phones and
  from the keyboard (select a value, then use the arrow keys), and it can't
  put a value on a fixed slot. On a 390-pixel phone screen, the whole array
  is visible without scrolling sideways. The sorting visualiser has no way to
  move values by hand today, so this is new.
- **Goal is a target to reach, not the maximum.** The puzzle file carries the
  goal (stored in the `goal` field), and the page never works it out. The goal
  sits 65% of the way from a typical random arrangement's score to the
  solver's best. For example, with a median of 25 and a best of 34, the goal
  is 31.
- **The best score is never shown.** To keep the game competitive, the
  solver's best stays with the generator and server. The puzzle file has no
  `best` field, and the page never shows a best score, a "best reached"
  badge, or a "highest possible score" message, not even after the puzzle
  ends. A player who beats the goal can't tell whether more is possible.
- **The page talks to the player plainly.** Copy is short, friendly, second
  person, and free of jargon: "numbers" and "locked" rather than "free values"
  and "fixed slots", and "goal" rather than golf's "par".
- **Three tries, and the highest score counts.** Each Run uses a try. After
  a try the array stays as the player left it, so the next try starts from
  there. Reaching or beating the goal is announced and the next try is still
  offered. Every puzzle gives all three tries and never ends early, even when
  a try hits the solver's best. After the third try the puzzle ends and shows
  the highest of the three scores. Three is a starting number that 1h can
  change.
- **Playback controls from the first run.** `/daily` has a Skip button that
  jumps to the final count, and the visualiser's controls: play and pause,
  rewind, replay, step back and forward, the timeline, and speeds from 0.25x
  to 2x. The comparison counter follows the timeline, so stepping back
  lowers it.
- **The share text has one line per try**, marked ⭐ at or above the goal,
  and never includes the arrangement or a best score:

  ```
  structs.sh daily #12 · Quicksort · Goal 34
  30
  34 ⭐
  36 ⭐
  structs.sh/daily
  ```

  The first line names the goal, and each later line is one try's score. Here
  the first try was below the goal of 34, and the second and third reached or
  beat it.
- **The puzzle comes from a file in the client** until checkpoint 3. These
  are test puzzles. Scheduled puzzles never go in the public repo. The page
  fetches the file, and the e2e tests serve their own puzzle in its place
  with Playwright's network interception. At checkpoint 3 only the address
  changes, to the server's.
- **The page lives at `/daily`**, and nothing linked to it until step 3d
  added the entry points.
- **The page uses the UI overhaul's look from the start.** The overhaul
  ([#10](https://github.com/gyoumi/structs.sh/pull/10)) is in `dev`, so
  `/daily` is built with its layout, fonts and sorting visualiser.

### 1a. Tests

**Done in #64.**

A different agent from the one writing the code writes checkpoint 1's game
tests and adds them to `e2e/known-failures/game.json`. It works from the
decisions above. Each test serves its own puzzle, with the goal and
the score of each arrangement it plays worked out by hand.

For 1e, the puzzle page:

1. The puzzle shows its rules, goal and fixed values.
2. Tapping two free values swaps them, and fixed values can't be selected.
3. Free values can be swapped with the keyboard.
4. Swapping works on a phone-sized screen, and the whole array fits without
   scrolling sideways.

For 1f, run and score:

5. Run animates the sort, and the counter goes up with each comparison.
6. The final count matches the score shown, and both match the count
   worked out by hand for the test's arrangement.
7. Skip jumps straight to the final count.
8. Stepping back lowers the counter.
9. Reaching the goal is announced, and the next try is still offered.
10. Beating the goal still offers the next try and never reveals a best
    score.
11. After three tries, the puzzle ends with the highest of the three scores.
12. The share text has one line per try with ⭐ marks, and doesn't include
    the arrangement.

**You'll know it's done when** the 12 tests run in CI, all 12 are listed as
known failures, and CI is green.

### 1b. Rust scores quicksort

**Done in #65.**

A `game-server/` Cargo workspace with `daily-challenges` in it. It holds the
`Template` trait, the instance, input and step log types, and the quicksort
template's `run`, `score` and `rules`. This step only builds it for the
computer it runs on. CI gains a job like the instrumenter's: `cargo fmt`,
`clippy` and `cargo test`.

**You'll know it's done when** `cargo test` passes in CI, including inputs
whose comparisons were counted by hand.

### 1c. Wasm in the client

**Done in #66.**

`daily-challenges` is built for `wasm32-unknown-unknown`, and its exports
follow the instrumenter's (`alloc`, `result_ptr` and the rest, without
`wasm-bindgen`). The client gains a loader like `instrumenter.ts`. One root
script runs both wasm builds at the same time, and the client's Dockerfile
gains a stage for it.

**You'll know it's done when** a Vitest test scores a fixed input through
the wasm build, and the Docker image builds.

### 1d. Parity

**Done in #68.**

The TypeScript quicksort reports how many comparisons it made. A Vitest
test runs it and the wasm build on the same inputs, fixed ones and random
ones, and checks the counts match.

**You'll know it's done when** the parity test passes in CI.

### 1e. Puzzle page

**Done in #67.**

`/daily` loads the puzzle file and shows the rules, goal and the array, with
fixed values locked. The player can swap free values by tapping, with the
keyboard, and on a phone.

**You'll know it's done when** 4/12 game tests pass: tests 1 to 4 in 1a.

### 1f. Run and score

**Done in #70.**

Run animates the sort with the comparison counter and the playback
controls, then shows the score from the wasm build next to the goal. The page
counts tries, announces reaching or beating the goal, ends the puzzle after
the third try with the highest score, and offers the share text. It never
shows a best score.

**You'll know it's done when** 12/12 game tests pass.

### 1g. Layout

**Done in #72.**

`/daily` is rearranged to follow the [layout mockup](docs/images/daily-game-layout.png).
The mockup shows a later Dijkstra puzzle, so this step takes its layout, not
its content:

- A small uppercase line above the title gives the puzzle number, the date
  (when the puzzle file has one) and the algorithm. The title is "Make
  quicksort sweat". Two short rules follow, "Swap the numbers to make as many
  comparisons as possible." and "Leftmost number is always the pivot.", with
  the keyboard controls folded away under them. The goal isn't repeated in
  the rules, because the score card shows it.
- One framed panel holds the array, the quicksort drawing and its playback
  controls. Locked slots are hatched with a lock in the corner; while a try
  runs, the free slots go flat and warm so they still look different.
- Beside the panel, a Comparisons card shows the live count in large figures
  next to the goal, three chips for the tries (spent, in progress, unused),
  the tries left and the score. Once the puzzle ends it shows the highest
  score. A Step card shows the pivot and the comparison being made, such as
  "3 < 2 ✗". The lit and dimmed bars in the drawing already show the active
  range, so the card doesn't repeat it.
- The actions sit right under the panel: Run first and filled, then Skip,
  then Share once the puzzle ends. There is no how-to line under the panel
  and no "Sorting…" text; a short status line appears only when there is
  something to say.
- On a 390-pixel phone screen the Comparisons card moves under the actions
  and the Step card is hidden. A strip at the top of the panel shows the
  count, the goal, the comparison being made and the tries left instead. The
  whole array, the drawing and its controls still fit without scrolling
  sideways.

The streak badge waits for 3b, and the "This week" strip waits for a
schedule in 2c. The mockup's Submit best and Hint buttons aren't in the
decisions above, so they stay out unless a decision adds them.

**You'll know it's done when** the 12 game tests still pass, and screenshots
at desktop and phone widths and a video of a full puzzle have been reviewed
and approved.

### 1h. Playtest

Three people who haven't seen the game play the puzzle with no help. Write
down where each one got stuck and what they tried, then fix the page before
checkpoint 2 (skipped for now while checkpoint 2 starts).

**You'll know it's done when** the notes are in this document, and each
problem they found is fixed or is listed as a follow-up.

### 1i. Tidy

**Done in #73** (with follow-up default-on guards in #74 and explicit Checkpoint 1 state machines in #76).

Tidy the code checkpoint 1 added or changed against the four rules (size,
stages, comments, tests) without changing what a player sees, extend
`structs/one-stage-value` to cover React `useState` boolean flags, and extend
the CI tidy checks (`scripts/check-file-sizes.mjs`, `scripts/pr-rules.mjs`,
`game-server/clippy.toml`) to cover `client/src/daily/`, `client/src/Services/challenges/`,
`client/src/visualiser-src/controller/`, and `game-server/`.

**You'll know it's done when** every checkpoint 1 file is within its line
limit, stage flags and plain comments are cleaned up, the CI tidy checks cover
the daily game and `game-server/`, and all unit, Rust, script and e2e tests pass
unchanged.

## Checkpoint 2, step by step

```
2a-0. Tests ──► 2a-1. Sorting ──► 2a-2. Trees ──► 2a-3. Linked list ──► 2b. Solver and checks ──► 2c. Schedule ──► 2d. Tidy
```

### Decisions

- **Split 2a into four vertical PRs:** `2a-0` writes Checkpoint 2's Playwright tests first (on `e2e/known-failures/game.json`), then `2a-1` ships the two sorting templates (`bubble-exact-passes`, `insertion-beats-merge`), `2a-2` ships the three tree templates (`avl-most-rotations`, `bst-forced-order`, `upset-bst-beats-avl`), and `2a-3` ships the linked list template (`linked-list-index-drift`).
- **Complete 2a with static fixtures before setting up `daily-generator`:** all of `2a` runs inside `structs.sh` using static test puzzle JSON files (and Playwright network interception in e2e). The private `daily-generator` repo is connected before `2b`.
- **Template IDs, scoring rules, and challenge JSON shapes** (`GET /api/daily`, never carrying `best`):
  - `quicksort-most-comparisons`: `{ number, template, values, fixed, goal, date? }` — Extreme (higher).
  - `bubble-exact-passes`: `{ number, template, values, fixed, targetPasses, goal, date? }` — Exact target (`passes === targetPasses`, where a pass is an outer loop iteration that makes at least one comparison — including the final 0-swap stopping pass, excluding any comparison-free `i = n - 1` iteration, so at most `n - 1` passes), then swaps (higher).
  - `insertion-beats-merge`: `{ number, template, values, fixed, goal, date? }` — Disagree (`insertionComparisons < mergeComparisons`, insertion stops when `val >= a[j - 1]`, merge splits at `floor((lo + hi) / 2)` and takes left on ties), then out-of-order pairs / inversions (higher).
  - `avl-most-rotations`: `{ number, template, values, fixed, goal, date? }` — Extreme, total single rotations from inserting keys in order (higher; each LL/RR counts as 1 rotation and each LR/RL double rotation counts as 2 rotations).
  - `bst-forced-order`: `{ number, template, values, targetTree, goal, date? }` — Exact target (inserting the player's order into an empty BST matches `targetTree`, given as its preorder traversal), then longest contiguous strictly increasing run in the insert order (higher). No fixed slots.
  - `upset-bst-beats-avl`: `{ number, template, values, fixed, goal, date? }` — Disagree (`bstNodesPassed < avlNodesPassed`, counting only existing nodes passed on the way down during each insert, not rotations), then margin `avlNodesPassed - bstNodesPassed` (higher).
  - `linked-list-index-drift`: `{ number, template, start, target, goal, date? }` — Exact target (final list equals `target`), then total cost = `operations + nodesWalked` (**lower wins**, so `cost <= goal` reaches the goal). `insert(value, index)` costs `1 + min(index, lengthBefore)`; `delete(index)` costs `1 + (index + 1)`.
- **Unsolved tries on Exact-target and Disagree puzzles:**
  - An unsolved try still uses a try, explains clearly why the condition wasn't met (for example *"Took 3 passes — needed 4"* or *"Insertion made 16 comparisons — merge made 15"*), still shows the secondary count so the player can learn, and marks the try unsolved (`✗` in try chips and share text).
  - Any solved try always outranks any unsolved try (especially important for lower-wins like Index drift, where an incomplete cheap run must not beat a solved one). While tries remain, `Score` and `Goal reached` reflect the latest try (so an unsolved try leaves `Score` without a number and hides `Goal reached`). Once the third try finishes, `Try result` still describes that final try, while `Score` and `Goal reached` report the best solved try across all three tries (`score >= goal` for higher-wins, `score <= goal` for lower-wins; if all three tries are unsolved, `Score` has no number and `Goal reached` stays hidden).
  - In share text, solved tries follow Checkpoint 1 (`<score>` or `<score> ⭐`), and unsolved tries appear as `✗`.
- **Two-algorithm puzzles (`insertion-beats-merge` and `upset-bst-beats-avl`):** render both stages side by side on desktop (stacked on phone) synced to one shared `Playback` toolbar (`Transport`). `Skip` finishes both stages; stepping, rewind, replay, and speed control both together.
- **`daily-generator` starts in the private repo** in the `devsoc-unsw` org.
  Its first tests are the check scripts from `puzzle-checks/`, rewritten in
  Rust. The figures in `puzzle-ideas.md` become the ranges they expect.
- **The solver uses only the `Template` trait**, as `roadmap.md` requires, so
  each template's `generate` and its shortcut list are the only extra code it
  needs.
- **Puzzles are stored in Postgres from the start**, through
  `daily-db`. A local Postgres runs in Docker.
- **The weekday schedule** uses the bot player's grades. Forced order is the
  easy-day template, and the upset is the hard-day one, used sparingly.

### 2a-0. Tests

**Done in #77.**

A separate test writer writes Checkpoint 2's Playwright e2e tests and adds them
to `e2e/known-failures/game.json`, working from the decisions above and
`docs/puzzle-ideas.md`. Each test serves its own hand-worked puzzle fixture.

Coverage:

1. `Bubble: exactly k passes` loads and plays; an unsolved try explains why the pass count missed `k` while still showing the swap count, and a solved try reaching the goal counts as solved and outranks an unsolved try with more swaps.
2. `Insertion beats merge` loads and plays with both sorting stages synced to one `Playback` toolbar; an unsolved try (`insertion >= merge`) is marked unsolved while a solved try (`insertion < merge`) scores by out-of-order pairs.
3. `AVL: most rotations` loads and plays, counting rotations as keys are inserted in order.
4. `Forced order` shows the target BST, loads and plays, distinguishes a matching vs non-matching tree, and scores a matching insert order by its longest increasing run.
5. `Upset: BST builds cheaper` loads and plays with BST and AVL stages side by side synced to one `Playback` toolbar, counting nodes passed on the way down (not rotations) and scoring the margin when BST passes fewer nodes than AVL.
6. `Index drift` loads and plays with an operation-list builder (`insert` / `delete`), shows operations, nodes walked, and total cost, and ranks lower solved cost higher (with any solved try outranking an unsolved try).

**You'll know it's done when** all Checkpoint 2 e2e tests run in CI on
`e2e/known-failures/game.json`, Checkpoint 1's 14 tests still pass, and CI is
green.

### 2a-1. Sorting templates (`bubble-exact-passes`, `insertion-beats-merge`)

**Done in #78.**

Add both sorting templates to `daily-challenges` and the wasm wire layer, add
counters and Vitest parity tests for bubble, insertion, and merge sort, and add
exact-target / disagree try outcomes and synced dual-stage playback to `/daily`.

**You'll know it's done when** both sorting parity tests pass, their Checkpoint
2 e2e tests pass and leave `e2e/known-failures/game.json`, and desktop/phone
videos are reviewed and approved.

### 2a-2. Tree templates (`avl-most-rotations`, `bst-forced-order`, `upset-bst-beats-avl`)

**Done in #79.**

Add all three tree templates to `daily-challenges`, add BST/AVL node-pass and
rotation counters with Vitest parity tests, and add the insert-order, target
BST, and side-by-side BST/AVL views to `/daily`.

**You'll know it's done when** all three tree parity tests pass, their
Checkpoint 2 e2e tests pass and leave `e2e/known-failures/game.json`, and
desktop/phone videos are reviewed and approved.

### 2a-3. Linked list template (`linked-list-index-drift`)

**Done in #80.**

Add `linked-list-index-drift` to `daily-challenges`, add linked-list operation
and node-walk counters with Vitest parity tests, and add the operation-list
builder and lower-wins scoring to `/daily`.

**You'll know it's done when** the linked list parity test passes,
`e2e/known-failures/game.json` is empty again (all Checkpoint 2 e2e tests
passing), and desktop/phone videos are reviewed and approved.

### 2b. Solver and checks

**Done in #81** (public `Template` generation/search surface) and `devsoc-unsw/snitch` (`generator`).

`daily-generator` finds the best score for an instance by searching the moves
the `Template` trait exposes, and sets the goal 65% of the way to it from the
median of random inputs. For each instance it runs the three checks from
`puzzle-ideas.md`: is it solvable, does a shortcut reach the best, and how
often does the bot player reach the goal. The best score stays private to
`daily-generator` and the server, and is never sent to players.

**You'll know it's done when** its tests reproduce the `puzzle-checks`
figures for every launch template. For example, sorted fills reach the best
on only 1 or 2 of 40 AVL instances.

### 2c. Schedule

**Done in #82** (`game-server/db`, local Postgres compose, CI Postgres service) and `devsoc-unsw/snitch` (`daily-generator` weekday schedule, Postgres fill, and CLI).

`daily-generator` picks a template for each upcoming date, rerolls instances
that fail a check or miss the weekday's difficulty range, and stores the
instance, rules, seed, goal, the best score and one best solution. Only the
puzzle and its goal are served to the page; the best score and solution stay
on the server.

**You'll know it's done when** one run fills three weeks of dates, and every
stored puzzle loads and plays on the game page.

### 2d. Tidy

Tidy the code checkpoint 2 added or changed against the four rules (size,
stages, comments, tests) without changing what a player sees.

## Checkpoint 3, step by step

```
3a. Game server ──► 3b. Streaks ──► 3c. The whole stack ──► 3d. Entry points and landing page ──► 3e. Tidy
──► 3f. Fixes from the recorded run ──► 3g. Tidy
```

### Decisions

- **The server only reads.** `GET /api/daily` is its one endpoint, and it
  never returns the solution or the seed.
- **The puzzle day** follows `Australia/Sydney`, as `roadmap.md` describes.
  The server decides which day it is, so a wrong clock on the player's
  computer can't skip ahead.
- **The browser's saved results have a version number.** Stage 3 uploads
  them on first sign-in and re-scores each saved input, so their format has
  to survive later changes.

### 3a. Game server

**Done in #84.**

`daily-server`, `daily-api` and `api.ts`, which `ts-rs`
generates from `daily-api`. The server returns today's puzzle from
Postgres. Its Docker image follows CHAOS (`sqlx` offline query data and
cached cargo dependencies).

**You'll know it's done when** "today's puzzle comes from the server" and
"the puzzle changes at midnight in Sydney" pass.

### 3b. Streaks

**Done in #85.**

The page saves each result, including its input and score, in
`localStorage`, and counts the streak from the puzzle days played. A refresh
shows the finished puzzle again. Share text gains the streak. When the server
can't be reached, the page says so.

**You'll know it's done when** the remaining game tests pass on a local
stack.

### 3c. The whole stack

**Done in #86.**

A Docker Compose file runs Postgres, a `daily-generator` run to fill it, the
game server and the client. The e2e job runs the game tests against it, with
the clock set by the test.

**You'll know it's done when** every game test passes in CI.

### 3d. Entry points and landing page

**Done in #87.**

The landing page's navbar gains a "Daily" link, the hero gains a "Play
today's challenge" button, and a new section between the structure picker
and "About" ("Push an algorithm to its limit") explains the game. The
visualiser's header gains a "Daily" button beside "Debugger". On `/daily`,
"Go back" on the left returns to the page the player came from (or `/`),
the brand in the centre links home, and the theme toggle sits on the right.

**You'll know it's done when** the landing, visualiser navigation and game
tests pass, with no sideways scrolling on a 390px phone.

### 3e. Tidy

**Done in #89.**

Tidy the code checkpoint 3 added or changed against the four rules (size,
stages, comments, tests) without changing what a player sees.

Before the tidy, a recorded run pressed every reasonable button combination
on `/daily` (191 scenarios over all seven templates). Three of its findings
were fixed in #88: a theme switch now redraws the stage, a reload shows the
last try's run, and pressing Run uses the try. The rest are step 3f. The same run is repeated after the tidy
and compared step by step with a run on #88, to show the tidy changed
nothing a player sees.

**You'll know it's done when** every checkpoint 3 file is within its line
limit, comments and tests are cleaned up, all unit, Rust, script and e2e
tests pass, and the recorded run after the tidy matches the one before it.

### 3f. Fixes from the recorded run

**Done in #90.**

The rest of the recorded run's findings, and the ones the reviews of #88
left open:

- **Two tabs play the same run.** Pressing Run in one tab plays that run in
  every other tab open on the same day, through `BroadcastChannel` (tabs of
  one browser talk directly; the server stays read-only). Each tab shows the
  result when the run ends, and its stage, counters and playback match the
  tab that ran it, including the speed multiplier, pause, stepping and
  seeking. A tab opened while a run plays asks the open tabs for the run
  and joins it at the current step; if no tab answers, it shows the last
  saved try as a reload does. Before #90, a synced tab updated its score
  and tries but kept its own last run on the stage while tries remained;
  when the other tab's try ended the day, it drew that try's input but not
  its run. Devices sync the same way once there are accounts,
  over a WebSocket (`roadmap.md`, stage 3).
- **A full `localStorage` doesn't blank the app.** The debugger's
  `fileSystem` store throws on startup when storage is full, which blanks
  every page. The app starts, and the daily page says it couldn't save, as
  it already does when only its own save fails.
- **A theme switch keeps the playback as it was.** During a single "Next
  step" animation it stops after that step instead of playing on, and manual
  pan and zoom survive the switch.
- **Long linked lists stay readable on a phone.** Index drift with about 40
  inserts draws a readable list on a 390px screen.
- **The visualiser keeps its run on a theme switch,** as `/daily` does since
  #88.

**You'll know it's done when** each fix has a test that failed before it,
and all unit, Rust, script and e2e tests pass.

Not planned: a reload in the few milliseconds between pressing Run and the
save finishing still gets the try back. Once players have accounts, the
run starts only after the server records the try, through one idempotent
request per account, day and try (`roadmap.md`, stage 3), which closes it.

### 3g. Tidy

**Done in #91.**

Tidy what 3f added or changed against the four rules (size, stages,
comments, tests) without changing what a player sees.

**You'll know it's done when** every file 3f touched is within its line
limit, all tests pass, and the recorded run, repeated on 3g and compared
step by step with a run on 3f, differs only where 3f meant to change
behaviour. That run is the final check for checkpoint 3.

## The goal, step by step

```
Tidy ──► 4a. Into dev ──► 4b. Deployment ──► 4c. Launch
```

### Tidy (before merging into dev)

Before `daily-game` goes into `dev`, run a full tidy checkpoint (`Ta. Structure`,
`Tb. Comments`, `Tc. Tests`, `Td. Checks`) across everything the daily game
added or changed.

### 4a. Into dev

Once the debugger rewrite is in `devsoc-unsw/structs.sh`, merge `dev` into
`daily-game`, then merge `daily-game` into the fork's `dev`.

### 4b. Deployment

This repo gains the `game-server` image in the Deploy workflow and the
`daily-challenges` stage in the client's Dockerfile. DevSoc's deployment repo
gains the game server, the `/api` route, Postgres, the runtime secrets and a
CronJob for `daily-generator`. `roadmap.md` lists them under "Changes for the
game".

### 4c. Launch

`daily-generator` queues two to three weeks of puzzles in production (the
landing page has linked to `/daily` since step 3d), and the fork's `dev` goes into
`devsoc-unsw/structs.sh` `dev`.
