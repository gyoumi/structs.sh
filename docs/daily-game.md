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

As with the debugger, the Playwright suite is the spec. The game's tests are
written before checkpoint 1, from what a player sees. They all start on a
known-failures list (`e2e/known-failures/game.json`), which shrinks as the
features land. Each run ends with a summary such as `6/20 behaviours
working`.

The tests, grouped by the checkpoint that should make them pass:

| Checkpoint | Tests |
|---|---|
| 1 | The puzzle shows its rules, par and fixed values. Fixed values can't be moved, and free ones can. Run animates the algorithm and shows the score. The score matches what the animation showed. Matching or beating par is announced. Share text copies, without the answer. |
| 2 | Each of the seven launch templates loads and plays (one test each). An exact-target puzzle says whether it's solved, and shows its second count. |
| 3 | Today's puzzle comes from the server. A result survives a refresh. Playing on consecutive days builds a streak, and missing a day resets it. The puzzle changes at midnight in Sydney, including on a daylight saving day. The page says so when the server can't be reached. Share text includes the streak. |

That's 6, 14 and then 20 tests. The test writer can change the list. If they
do, change this table.

Under the e2e suite:

- **Parity tests** (Vitest) run each template's Rust scoring and the
  TypeScript visualiser on the same fixed inputs, and check the counts match.
  The game has two copies of each algorithm, one to score and one to animate,
  so this is what stops them drifting apart.
- **`cargo test`** covers `structs-puzzles` and the game server, in this repo.
- **`structs-forge`'s tests**, in the private repo, check the solver against
  the figures in `puzzle-ideas.md`.

`.claude/rules/testing.md` applies as usual. Tests come first, and they're
written by a different agent from the code.

## Checkpoints

```
Today ──► 1. One puzzle plays ──► 2. Every day is new ──► 3. It runs daily ──► Goal: launched
```

### 1. One puzzle plays

A quicksort puzzle, hard-coded in the client, can be played start to finish
in the browser. The player moves the free values, presses Run, watches the
existing sorting visualiser animate the run, and sees a score and par. The
score comes from `structs-puzzles` built to wasm, with no server.

This tests the riskiest parts first:

- the second wasm build next to the instrumenter's;
- the Rust count and the animation agreeing;
- whether someone new understands the puzzle and wants to play it again.

None of this needs the generator or the server.

**Done when:** 6/20 game tests pass, the parity test passes for quicksort,
and three people who haven't seen the game play it without help. What
confused them is written here.

See "Checkpoint 1, step by step".

### 2. Every day is new

All seven launch templates are playable. `structs-forge` generates
instances for them, finds par, rejects instances that fail the checks, and
grades difficulty. The game page can load any puzzle it produces.

**Done when:** 14/20 game tests pass, every launch template has a passing
parity test, and `structs-forge` fills three weeks of the weekday schedule
with puzzles that pass every check.

See "Checkpoint 2, step by step".

### 3. It runs daily

`structs-game-server` serves today's puzzle from Postgres. The page keeps
streaks and history in the browser, and the whole stack runs locally and in
CI, with `structs-forge` filling the database.

**Done when:** 20/20 game tests pass against the running stack in CI.

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
1a. Puzzle crate ──► 1b. Game page ──► 1c. Playtest
```

### Decisions

- **The first template is "Quicksort: the most comparisons".** Its input is
  an array with some values fixed, which the sorting visualiser already
  draws, and its checks passed (see `puzzle-ideas.md`).
- **The puzzle comes from a file in the client** until checkpoint 3. These
  are test puzzles. Scheduled puzzles never go in the public repo.
- **The page lives at `/daily`**, and nothing links to it until the goal.
- **The page uses the UI overhaul's look from the start.** The overhaul
  ([#10](https://github.com/gyoumi/structs.sh/pull/10)) is in `dev`, so
  `/daily` is built with its layout, fonts and sorting visualiser.

### 1a. Puzzle crate

A `crates/` Cargo workspace with `structs-puzzles` in it. It holds the
`Template` trait, the instance, input and step log types, and the quicksort
template's `run`, `score` and `rules`. It's built for
`wasm32-unknown-unknown` the same way as the instrumenter, in CI and in the
Docker image, and one root script runs both builds at the same time.

**You'll know it's done when** `cargo test` passes in CI, the Docker image
builds, and the parity test shows the same comparison count from Rust and
from the TypeScript quicksort on every fixed input.

### 1b. Game page

`/daily` loads the puzzle file and shows the rules, par and the array, with
fixed values locked. Run animates the sort with the existing visualiser,
then shows the score from the wasm build next to par. A finished puzzle
offers share text, with the score and par but not the input.

**You'll know it's done when** 6/20 game tests pass.

### 1c. Playtest

Three people who haven't seen the game play the puzzle with no help. Write
down where each one got stuck and what they tried, then fix the page before
checkpoint 2.

**You'll know it's done when** the notes are in this document, and each
problem they found is fixed or is listed as a follow-up.

## Checkpoint 2, step by step

```
2a. The other templates ──► 2b. Solver and checks ──► 2c. Schedule
```

### Decisions

- **`structs-forge` starts in the private repo** in the `devsoc-unsw` org.
  Its first tests are the check scripts from `puzzle-checks/`, rewritten in
  Rust. The figures in `puzzle-ideas.md` become the ranges they expect.
- **The solver uses only the `Template` trait**, as `roadmap.md` requires, so
  each template's `generate` and its shortcut list are the only extra code it
  needs.
- **Puzzles are stored in Postgres from the start**, through
  `structs-game-db`. A local Postgres runs in Docker.
- **The weekday schedule** uses the bot player's grades. Forced order is the
  easy-day template, and the upset is the hard-day one, used sparingly.

### 2a. The other templates

The other six launch templates go into `structs-puzzles`, each with a parity
test. The page gains the inputs they need:

- an operation list for Index drift;
- an insert order for the BST and AVL templates;
- both trees side by side for the upset.

**You'll know it's done when** 14/20 game tests pass, using one puzzle file
per template.

### 2b. Solver and checks

`structs-forge` finds par for an instance by searching the moves the
`Template` trait exposes. For each instance it runs the three checks from
`puzzle-ideas.md`: is it solvable, does a shortcut reach par, and how often
does the bot player reach par.

**You'll know it's done when** its tests reproduce the `puzzle-checks`
figures for every launch template. For example, sorted fills reach par on
only 1 or 2 of 40 AVL instances.

### 2c. Schedule

`structs-forge` picks a template for each upcoming date, rerolls instances
that fail a check or miss the weekday's difficulty range, and stores the
instance, rules, seed, par and one best solution.

**You'll know it's done when** one run fills three weeks of dates, and every
stored puzzle loads and plays on the game page.

## Checkpoint 3, step by step

```
3a. Game server ──► 3b. Streaks ──► 3c. The whole stack
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

`structs-game-server`, `structs-game-api` and `api.ts`, which `ts-rs`
generates from `structs-game-api`. The server returns today's puzzle from
Postgres. Its Docker image follows CHAOS (`sqlx` offline query data and
cached cargo dependencies).

**You'll know it's done when** "today's puzzle comes from the server" and
"the puzzle changes at midnight in Sydney" pass.

### 3b. Streaks

The page saves each result, including its input and score, in
`localStorage`, and counts the streak from the puzzle days played. A refresh
shows the finished puzzle again. Share text gains the streak. When the server
can't be reached, the page says so.

**You'll know it's done when** the remaining game tests pass on a local
stack.

### 3c. The whole stack

A Docker Compose file runs Postgres, a `structs-forge` run to fill it, the
game server and the client. The e2e job runs the game tests against it, with
the clock set by the test.

**You'll know it's done when** 20/20 game tests pass in CI.

## The goal, step by step

### 4a. Into dev

Once the debugger rewrite is in `devsoc-unsw/structs.sh`, merge `dev` into
`daily-game`, then merge `daily-game` into the fork's `dev`.

### 4b. Deployment

This repo gains the `game-server` image in the Deploy workflow and the
`structs-puzzles` stage in the client's Dockerfile. DevSoc's deployment repo
gains the game server, the `/api` route, Postgres, the runtime secrets and a
CronJob for `structs-forge`. `roadmap.md` lists them under "Changes for the
game".

### 4c. Launch

`structs-forge` queues two to three weeks of puzzles in production, the
landing page links to `/daily`, and the fork's `dev` goes into
`devsoc-unsw/structs.sh` `dev`.
