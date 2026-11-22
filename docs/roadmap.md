# Roadmap

Structs.sh is a data structures and algorithms visualiser. It started as a
COMP2521 tool. The aim is for it to stay useful after that course: for later
algorithms courses such as COMP3121, for revising before interviews, and for
LeetCode practice.

Two things grow side by side:

- **The visualisers**, with more data structures and algorithms, up to and
  beyond what VisuAlgo covers.
- **A daily puzzle game** built on the visualisers. The app names an
  algorithm, and the player designs an input that pushes it to an extreme.

None of the decisions below are final. Change this document when they change.

## Stages

```
0. Server deleted ──► 1. Daily game MVP ──► 2. Visualisers and game grow together ──► 3. Accounts and leaderboard
```

### 0. Finish the debugger rewrite

The debugger moves entirely into the browser, and the GDB server is deleted.
`docs/debugger-rewrite.md` has the plan.

**Status (21 November 2026):** the rewrite is merged into the fork's `dev`
([#35](https://github.com/gyoumi/structs.sh/pull/35)), and the GDB server is
deleted there.

The rewrite happens in a fork. Production only changes when a PR into
`devsoc-unsw/structs.sh` `dev` merges, so the rewrite ends with that PR,
followed by DevSoc's deployment changes (see "Deployment").

**Done when** production serves the wasm debugger and the GDB server is gone
from DevSoc's cluster.

### 1. Daily game MVP

The game uses the visualisers that exist today: linked lists, BSTs, AVL
trees and the five sorts. There are no accounts and no leaderboard yet.
Streaks and history are kept in the browser.

`docs/daily-game.md` has the plan, in three checkpoints:

```
1. One puzzle plays ──► 2. Every day is new ──► 3. It runs daily ──► Goal: launched
```

1. **One puzzle plays.** A quicksort puzzle, hard-coded in the client, is
   scored in the browser by `structs-puzzles` built to wasm, then
   playtested.
2. **Every day is new.** All seven launch templates play, and
   `structs-forge` generates, checks and schedules their puzzles.
3. **It runs daily.** `structs-game-server` serves today's puzzle, the
   browser keeps streaks, and the whole stack runs in CI.

**Done when** someone with no context can play today's puzzle, share the
result, and come back tomorrow with their streak intact.

### 2. Visualisers and game grow together

The visualiser track, in order:

1. Graphs. `graphs-master` merges, then `Graph.ts` gets unit tests.
2. An edge type with weights and direction.
3. The step log, with BFS as its first algorithm.
4. Dijkstra, shown as BFS with a priority queue.
5. The existing visualisers move onto the step log.
6. The rest of COMP2521's core: hash tables, union-find and tries, plus an
   LRU cache.
7. Later-year content: DP tables, KMP, flow networks.
8. Interview patterns: binary search, sliding window, two pointers,
   monotonic stack and queue, bitmasks.
9. Beyond VisuAlgo: segment trees, binary heap compared with Fibonacci heap.

The game track:

- Every new algorithm brings its templates from `puzzle-ideas.md`. Graphs
  bring "Dijkstra changes its mind" and "Fool BFS".
- Difficulty set by weekday.
- Yesterday's best solution replayed as an animation.

An algorithm is finished when it has a step log, a visual and at least one
template. Moving the visualisers onto the step log also removes the second
copy of each algorithm that stage 1 adds, since game mode can then animate
from the step log `structs-puzzles` produces.

### 3. Accounts and leaderboard

- Sign in with GitHub or Google.
- `POST /api/submit` takes the input and the run history. The server
  re-scores the input with `structs-puzzles` and records the time on its own
  clock.
- Friends boards need only a sign-in.
- The global board needs one of these on the account:
  - a verified university email address, such as `@unsw.edu.au` or another
    `.edu` domain. The server sends a link to the address, and one address
    can belong to only one account.
  - a linked LinkedIn profile. The player pastes their profile URL. It isn't
    verified, and one URL can belong to only one account. If someone links a
    profile that isn't theirs, the owner reports it and an admin moves the
    link by hand.
- On first sign-in, the browser's history is uploaded and checked by
  re-running each saved input.
- `structs-review` flags suspicious results for a person to look at.

**Ranking**, best first:

1. Score.
2. Time taken, from when the signed-in player first opened the puzzle to the
   submission that first reached their final best score.
3. How soon after the puzzle's release that submission came.

### Later

- Friend duels.
- The LeetCode companion: paste a solution and an input in LeetCode's
  format, and step through it with the right visual. Python and C++ come
  with it.
- Code challenges scored on step count. These are where the instrumenter
  and the game meet, because the player's own code produces the recording.

## The daily game

### How a puzzle works

Each day has one puzzle, made from a template. The template fixes the
algorithm, what's counted, what the player may change, and any rules. For
example: "change the edge weights so Dijkstra corrects a distance as many
times as possible".

The player experiments. They change the input, press Run, watch the
algorithm react, and adjust. The solver finds the best score. The goal sits 65%
of the way from a typical random input's score to the best, so there's room
above the goal to compete. When the solver couldn't try every input, the best is
only the best known score, and a player can beat it.

Each template says whether a higher or lower score wins. Exact-target
puzzles are solved or not, so they also name a second count to rank by, such
as fewest rotations. When no second count fits, time decides.

### The puzzle day

A new puzzle starts at midnight in Sydney (`Australia/Sydney`), so it moves
with daylight saving. On the two days a year the clocks change, the puzzle
day is 23 or 25 hours long. Every time is stored as an absolute timestamp,
so "how soon after release" stays correct on those days.

### Templates

The full list of templates, with the checks each one has passed, is in
[`puzzle-ideas.md`](puzzle-ideas.md). The rules in short:

- **The answer has to depend on the instance.** A template whose answer
  follows one rule on every instance (for example "put the smallest value
  last") is the same puzzle every day once someone knows the rule, so it's
  left out.
- **A set of values isn't enough of an instance.** Sorts and trees react only
  to the order of the values, so these instances add generated constraints,
  such as values fixed in place, or given repeats.
- **The generator checks every instance.** It rerolls instances with no
  solution, and instances where a shortcut reaches the best. A shortcut is a rule
  you can apply without working through the instance, such as "insert the
  keys in preorder". The bot player then grades how hard the instance is.

Kinds of puzzle:

- **Extreme**: maximise or minimise a count.
- **Disagree**: make two algorithms behave as differently as possible.
- **Break it**: make a flawed algorithm as wrong as possible on today's
  instance.
- **Exact target**: make the output come out exactly as given.
- **Budget**: the biggest effect from at most k changes.

The linked list has no tail pointer. Each list operation costs 1, plus every
node the animated pointer lands on, so an edit deep in the list costs more
than one near the front.

The game launches with seven templates, each brute-forced at small sizes
against the visualisers' code:

| Template | Kind | Visualiser |
|---|---|---|
| Index drift: turn list A into list B with insert and delete by index, at the lowest cost | Exact target | Linked list |
| The most quicksort comparisons | Extreme | Sorting |
| Insertion beats merge: the most out-of-order pairs while insertion sort still compares less than merge sort | Disagree | Sorting |
| Bubble sort: exactly k passes, with the most swaps | Exact target | Sorting |
| Forced order: an insert order that builds the given tree with the longest increasing run (the easy-day template) | Exact target | BST |
| The most rotations from inserting today's keys | Extreme | AVL tree |
| Upset: an insert order where building a plain BST passes fewer nodes than building an AVL tree, by the most (the hard-day template, used sparingly) | Disagree | BST and AVL tree |

Every template needs a panel showing the counts it scores. Index drift shows
both operations and nodes walked. The upset builds both trees side by side,
with the nodes each insert passes.

### Cheating

Anyone can write a script that solves a puzzle the generator can solve.
These steps make cheating harder, and the rest is accepted:

- The server re-scores every submission, so a faked score doesn't count.
- The server's clock times every submission, so a faked time doesn't count.
- The solver and the bot player are private, so solving a puzzle takes a
  script the cheater writes themselves.
- Templates whose answer follows a fixed rule are left out.
- The global board needs a university email or a linked LinkedIn profile,
  each of which can belong to only one account.
- `structs-review` flags results such as reaching the goal on the first run day after
  day, solves faster than the bot's fastest, and many accounts from one
  network. A flag hides the result from the global board until a person
  reviews it. Nothing is banned automatically.

## Architecture

```
client/ (TypeScript)
  game page ── imports ──► api.ts (generated from structs-game-api)
            ── imports ──► the existing visualisers
            ── loads ────► puzzles.wasm (built from structs-puzzles)
            ── HTTP ─────► structs-game-server

crates/ (Rust, public, in this repo)
  structs-game-server ──► structs-game-api, structs-game-db, structs-puzzles
  structs-game-api ─────► structs-puzzles
  structs-game-db ──────► structs-puzzles, and Postgres at runtime
  structs-puzzles (depends on none of the others)

private repo (Rust, in the devsoc-unsw org)
  structs-forge ────────► structs-puzzles, structs-game-db
  structs-review ───────► structs-game-db
```

| Crate | Holds | Used by |
|---|---|---|
| `structs-puzzles` | The `Template` trait, the instance, input and step log types, and each template's `run`, `score`, `rules` and `generate`. No networking, database or file access. Built as a Rust library and as `.wasm`. | Every other crate, and the browser |
| `structs-game-api` | Every HTTP request and response type. Generates `client/src/game/api.ts` with `ts-rs`. | The server, and the client through `api.ts` |
| `structs-game-db` | The schema, migrations and queries | The server, `structs-forge`, `structs-review` |
| `structs-game-server` | The HTTP server: today's puzzle, submissions, sign-in, leaderboards | Runs in DevSoc's cluster |
| `structs-forge` (private) | The schedule of which template runs on which date, the solver, the bot player, and the loop that turns a `generate` candidate into a stored puzzle | Runs on a schedule |
| `structs-review` (private) | The cheat-flag rules | Runs on a schedule |

`structs-forge` does this for each upcoming date: pick the template, call
its `generate` with a random seed, find the best score with the solver and
set the goal from it, reroll if the instance has no solution or one of the
template's shortcuts reaches the best, grade difficulty with the bot player,
reroll if the grade misses that weekday's range, and store the instance,
rules, seed, goal, the best score and one best solution.

The bot player plays like an impatient person. It tries a random change and
keeps it if the score didn't drop. How often it reaches the goal measures how
hard the puzzle is.

### Rules

- **Imports only go from private to public.** The public repo builds and
  tests without access to the private one. The private repo pins the public
  crates to a commit through a git dependency.
- **The database is the only link between the private and public code.**
  `structs-forge` writes puzzles, the server reads them, and
  `structs-review` writes flags.
- **The solver works on any template**, using only what the `Template` trait
  exposes: the moves a player can make, and the score. A template added in
  this repo gets a goal and a best score without changes to the private repo.
- **A template's scoring is frozen once puzzles exist for it.** Each stored
  puzzle names its template and version, and a scoring change becomes a new
  version.
- **Seeds are random and stored with each puzzle**, so the public `generate`
  code can't rebuild future puzzles.
- **Runtime secrets live in the deployment**, in neither repo: the database
  URL, the session signing key, the GitHub and Google OAuth client secrets,
  and the email provider's key.

### Builds

- `crates/` is its own Cargo workspace. The instrumenter stays a separate
  crate with its own build profile.
- The client's Dockerfile builds `structs-puzzles` in its own stage next to
  the instrumenter's, so Docker builds the two at the same time.
- In CI and locally, one root script runs both wasm builds at the same time.
- Rust dependencies are cached in CI and in Docker.

## Deployment

### How it works today

1. A push to `dev` (production) or `staging` on `devsoc-unsw/structs.sh`
   builds `structs-client` and `structs-debugger` images (`structs-staging-*`
   for staging) and pushes them to `ghcr.io/devsoc-unsw`. Forks build the
   images as a check but don't push or deploy.
2. The deploy job calls `devsoc-unsw/deployment-dispatch-action`. It starts
   the `dispatch-image-update.yml` workflow in DevSoc's private
   `devsoc-unsw/deployment` repo with `image=sha` pairs, and waits for it.
3. That repo holds Kubernetes manifests for each project
   (`projects/structs/prod/` and `staging/`). The new image tags are applied
   to DevSoc's cluster.
4. Cloudflare handles DNS and proxying, with an Envoy proxy behind it. The
   cluster sends `structs.sh/dapi` to the GDB server and everything else to
   the client's nginx.
5. The docs site is served by GitHub Pages from the `gh-pages` branch.

Other DevSoc projects deploy the same way. CHAOS is the closest example for
the game server: a Rust backend using `sqlx` with Postgres, built for amd64
and arm64.

### Changes for the debugger rewrite

In this repo, at step 4c:

- Remove `debugger` from the Deploy workflow's build matrix and its
  `-debugger=` line from the dispatch.
- Remove the `VITE_DEBUGGER_URL` build argument.
- Remove the QEMU setup step, since only amd64 images are built.

In DevSoc's deployment repo, after the upstream merge has deployed the wasm
client:

- Remove the debugger's Deployment, Service and `/dapi` route for prod and
  staging.
- Add a Cloudflare cache rule for `structs.sh/assets/*`. A first visit to
  the debugger downloads about 27 MB of compiler. nginx marks `/assets/` as
  cacheable for a year, but as far as we know Cloudflare doesn't cache
  `.wasm` files by default.

### Changes for the game

In this repo:

- A `game-server` entry in the Deploy workflow's build matrix and dispatch,
  with a Dockerfile that follows CHAOS (`sqlx` offline query data, cached
  cargo dependencies, cached Docker layers).
- The `structs-puzzles` stage in the client's Dockerfile.

In DevSoc's deployment repo, for prod and staging:

- A Deployment and Service for the game server.
- A route sending `structs.sh/api` to it. Keeping the API on the same domain
  as the client lets sign-in cookies work without cross-origin setup.
- A Postgres database.
- The runtime secrets listed under "Rules".
- Kubernetes CronJobs for `structs-forge` and `structs-review`, so they reach
  Postgres from inside the cluster. Their images come from the private repo,
  so the cluster needs permission to pull them.

Accounts to set up:

- A GitHub OAuth app owned by the `devsoc-unsw` org.
- A Google OAuth client.
- An email provider for university email checks.

## Open questions

For DevSoc's infrastructure team:

1. How does CHAOS get its Postgres and secrets, and can the game server do
   the same?
2. Can a private repo in the org use the deployment dispatcher, and can the
   cluster pull private images?
3. Are CronJobs allowed, and do any limits apply?
4. Does the cluster have arm64 nodes? If so, the game server is built for
   arm64 as well.
5. Can a Cloudflare cache rule be added for `structs.sh/assets/*`?
6. Is the cluster on DevSoc's own hardware, and what is there for logs,
   metrics and alerts once the Grafana and Pyroscope services are deleted?

For this project:

- Which email domains count as universities.

## Terms

- **Template**: a kind of puzzle, written once in code. It fixes the
  algorithm, what's counted, what the player may change, and any rules.
- **Instance**: one puzzle made from a template, such as one particular
  graph. Each day's puzzle is one instance.
- **Seed**: a number that makes random choices repeatable.
- **Generator**: `structs-forge`, which makes the daily puzzles ahead of
  time.
- **Solver**: the part of `structs-forge` that finds the best score for an
  instance, by trying every input or by searching when there are too many.
- **Best**: the solver's best score for an instance. The generator uses it
  offline to work out the Goal, and the page never shows it.
- **Goal**: the day's target score, 65% of the way from a typical random
  input's score to the best (stored as `par` in the puzzle file).
- **Shortcut**: a rule that solves a template without working through the
  instance, such as "insert the keys in preorder". The generator rerolls any
  instance a shortcut solves.
- **Bot player**: a simple program that plays like an impatient person, used
  to grade difficulty.
- **Step log**: the list of events an algorithm produces, such as "visit B".
  The visualiser animates it, and the score is counted from it.
- **Parity test**: a test that runs the Rust copy of an algorithm and the
  TypeScript visualiser on the same inputs and checks they count the same.
