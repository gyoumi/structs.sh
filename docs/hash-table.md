# Hash table visualiser (v1)

This is the plan for the first step-log visualiser in `structs.sh`: a **hash
table using linear probing with tombstones**, backed by Rust compiled into the
existing `challenges.wasm` bundle.

In `roadmap.md`, stage 2 moves visualisers onto step logs so the visualiser and
the daily game run one copy of each algorithm. Building the hash table this way
first proves the step-log boundary on a brand-new structure before any existing
visualiser is converted.

Other collision resolution strategies (separate chaining, quadratic probing,
double hashing, cuckoo hashing), dynamic resizing/rehashing, daily puzzle
templates, and renaming `challenges.wasm` to `algorithms.wasm` are all deferred
to v2.

None of the decisions below are final. Change this document when they change.

## Branches & PRs

- `hash-table` is the parent branch, created from `dev`.
- Work lands in **1 PR per shippable sub-step** targeting `hash-table` (following `ship-a-step`: separate Opus 5.5 test writer and implementer, local CI checks, `sol-loop` review, PR, and Copilot review babysitting).
- Merge `dev` into `hash-table` regularly so the final merge stays small.
- `hash-table` merges into `dev` when the v1 goal is reached.
- PR checks (`pre-merge` and `e2e`) run on `hash-table` PRs as usual.

## How progress is measured

`.claude/rules/testing.md` applies throughout: tests come first, and a different
agent writes the tests from this spec than writes the implementation.

| Layer | Test runner | What it checks |
|---|---|---|
| Rust hash table & step log | `cargo test` (`game-server/challenges`) | Probing, wrap-around, tombstones, duplicates, full tables, exact semantic step sequences |
| WASM boundary | Vitest (`client/src/Services/challenges/`) | Calling the real `challenges.wasm` `step_log` export synchronously and decoding `HashStep` replies |
| Step player & visualiser engine | Vitest (`client/src/visualiser-src/hash-table-visualiser/`) | `GraphicalHashTable` driving `VisualiserController`: timestamps, C code-line highlights, stepping forward/back, tombstone preservation on re-theme, and slot-state share encoding |
| Browser behaviour | Playwright e2e (`e2e/tests/hash-table.spec.ts`) | Navigation, insert/search/delete flows, tombstones, playback controls, theme switching, share links |
| Visual & layout quality | Browser screenshots (desktop + `390px` phone, light + dark) | Horizontal 11-slot array, tombstone state, probe pointer, formula/status/probe banner, code highlighting |

## Decisions

### Algorithm & data model

- **Linear probing with tombstones for v1.** Every bucket is in one of three
  states: `empty`, `occupied(key)`, or `tombstone` (`DELETED`), matching
  COMP2521's three-state model and future daily puzzles (`Tombstone maze` in
  `docs/puzzle-ideas.md`).
- **Fixed capacity of `11` slots (`0..10`) for v1.** Prime, easy to check
  `k % 11` by hand, and fits cleanly as a horizontal strip on desktop and phone.
- **Hash function:** `h(key) = key.rem_euclid(capacity)` (`key % 11` for
  non-negative keys). The visualiser accepts integers `0..99`, matching the
  existing keypad and two-digit encoding.
- **Set semantics on `insert(key)` (no duplicates):**
  1. Compute `start = h(key)`.
  2. Probe `start, (start + 1) % m, ...` for at most `m` slots.
  3. Remember the first `tombstone` index encountered, but **keep probing** to
     be sure `key` is not already stored further along the cluster.
  4. If `occupied(key)` is found, stop with `AlreadyPresent` (no change).
  5. Stop probing on the first `empty` slot (or after `m` probes). Place `key`
     in the remembered first tombstone if one was seen, otherwise in that
     `empty` slot.
  6. If all `m` slots were probed without finding `key`, an empty slot, or a
     tombstone, stop with `TableFull`.
- **`search(key)`:** Probe from `h(key)` for at most `m` slots, stepping past
  other keys and tombstones. Stop with `Found` on match, or `NotFound` on an
  `empty` slot or after `m` probes.
- **`delete(key)`:** Probe like `search(key)`. If found, replace the slot with
  `tombstone` (`MarkTombstone`). If not found, stop with `NotFound`.

### Architecture & WASM boundary

- **Keep `challenges.wasm` for now.** New step-log exports live in
  `game-server/challenges` (`daily-challenges`) and ship inside
  `client/src/Services/challenges/generated/challenges.wasm`. Renaming to
  `algorithms.wasm` (or extracting a shared `algorithms` crate) waits until
  in-flight daily-game branches settle and the step-log design is proven.
- **Pure semantic steps in Rust; TypeScript owns code-line mapping.** Rust
  `HashStep` variants describe only what the algorithm did (no line numbers).
  The TypeScript step player owns the displayed C code snippets and maps each
  `HashStep` variant to its line number, so editing C snippet formatting never
  breaks Rust or requires a WASM rebuild.
- **Stateless Rust runner, synchronous calls after preload.**
  - Rust keeps no state between calls. TypeScript passes the current table
    state (`capacity` and `slots`) plus one operation (`insert`, `search`, or
    `delete`), and Rust returns the updated `slots` and the `steps` log.
  - `VisualiserController.doOperation` stays synchronous. `VisualiserProvider`
    preloads `challenges.wasm` **only for WASM-backed topics**, showing a
    lightweight loading state and a Retry button on failure (leaving existing
    non-WASM visualisers completely untouched). Once loaded, `challenges.ts`
    exposes a synchronous helper backed by the instantiated module.
- **Behind `AnimationProducer`.** The hash table's step player turns Rust
  `HashStep` values into ordinary `AnimationProducer` sequences (`runners`,
  `highlightCode`, `stepFocus`, `stepBounds`), so `VisualiserController`,
  `Stage`, `Transport`, and `CodePanel` need no hash-table-specific forks.

### Visual design, code panel & sharing

- **COMP2521-style C in the CodePanel.** Matches Linked Lists, BSTs, AVL Trees,
  and Sorting (`insert`, `search`, `delete` written in clean COMP2521 C).
- **Horizontal row of `11` slots.** Reinforces the array intuition behind open
  addressing and fits widescreen canvases naturally. (In v2, separate chaining
  can hang chains downward from each bucket.)
- **Tombstone visual label: `DEL`.** Deleted buckets render with a muted/dashed
  style and a `DEL` label, matching the `DELETED` state in the COMP2521 C code.
- **Wrap-around cue (`10 → 0`).** When probing wraps from slot `10` back to slot
  `0`, animate a wrap indicator/arc back to slot `0` alongside a `"wrap → 0"`
  cue in the banner so `% 11` wrap-around is unmistakable.
- **Compact on-canvas banner above the buckets.** Shows the hash formula, live
  probe count, and step status/outcome (for example:
  `h(23) = 23 % 11 = 1 · Probes: 2 · Placed at slot 2`, or
  `Not found`, `Already present`, `Table is full`).
- **Initial table (`generate()`):** Pre-fills `5`–`6` distinct random keys
  (`0..99`) guaranteeing **at least one collision**, so the table opens ~50%
  full with a cluster ready to probe, search, or delete. `Clear` empties all
  `11` slots.
- **Full slot state in `retheme()` and share links (`Copy link`):**
  - `VisualiserSession.retheme()` preserves exact pre-run slot state (including
    tombstones) when redrawing mid-run.
  - Hash-table share URLs encode all `11` slots using a compact fixed-width
    format prefixed with `s`: `s` followed by 11 two-character tokens where
    `--` = empty, `xx` = tombstone, and `00`–`99` = occupied key (e.g.
    `s--12xx23--------------`), with `empty` for all-empty tables.
  - Parsing a hash-table URL also accepts plain two-digit key lists (e.g.
    `122334`) by inserting those keys in order into an empty table.

## Checkpoints

```
Today ──► 1. Rust engine & WASM step log ──► 2. Drawing & step player ──► 3. App wiring & polish ──► Goal: v1 shipped
           └─────────────────── 1 PR per sub-step into hash-table; tidy at the end of each ───────────────────┘
```

### 1. Rust engine & WASM step log

The linear-probing hash table runs in Rust, emits a structured semantic
`HashStep` log, and can be called synchronously from TypeScript through
`challenges.wasm`.

This retires the riskiest architectural piece first: the JSON wire format, the
new `step_log` WASM export next to `score`, and synchronous TS calls without
changing how `challenges.wasm` is built or cached in CI.

**Done when:** `cargo test`, `cargo clippy --target wasm32-unknown-unknown`,
`pnpm run challenges`, and Vitest WASM contract tests all pass for every
operation and edge case.

**Status:** reached (#102, #103; 1c tidy clean with no PR). See "Checkpoint 1, step by step".

### 2. Drawing & step player

`GraphicalHashTable` draws the horizontal 11-slot bucket array and formula/probe
banner in SVG, displays COMP2521-style C in the CodePanel, and plays the Rust
step log through `HashTableAnimationProducer` so `VisualiserController` can
play, pause, scrub, step forward/back, and re-theme every operation.

This proves a step-log visualiser fits cleanly behind `GraphicalDataStructure`
and `AnimationProducer`, matching the playback feel of existing visualisers.

**Done when:** `GraphicalHashTable` passes Vitest tests driving
`VisualiserController` (timestamps, C code highlighting, stepping forward/back,
tombstone reuse, theme rebuilds preserving tombstones, and slot-state share
encoding).

See "Checkpoint 2, step by step".

### 3. App wiring & polish

The hash table is live at `/visualiser/hash-tables` with topic-scoped WASM
preloading (loading and retryable error states), responsive desktop and phone
layouts, light and dark themes, tombstone-preserving share links, and passing
Playwright e2e tests.

**Done when:** all Rust, Vitest, and Playwright e2e tests pass in CI, and
desktop + `390px` phone screenshots in both light and dark themes have been
checked.

See "Checkpoint 3, step by step".

### Goal: v1 shipped

- `hash-table` merges into `dev` with all checks green.
- `docs/roadmap.md` reflects the step-log boundary proven by the hash table.

---

## Checkpoint 1, step by step

```
1a. Rust hash_table module ──► 1b. WASM step_log export & TS bridge ──► 1c. Tidy
```

### 1a. Rust `hash_table` module

**Done in #102.**

Add `game-server/challenges/src/hash_table.rs` (`pub mod hash_table;` in
`lib.rs`) and its integration test suite in
`game-server/challenges/tests/hash_table.rs`.

A Claude Opus 5.5 test writer writes `tests/hash_table.rs` first from the
contract below (with self-explaining failure messages), then a separate Claude
Opus 5.5 implementer implements `src/hash_table.rs` without reading the test
file.

**Public API contract:**

- `pub const DEFAULT_CAPACITY: usize = 11;`
- `HashSlot` (`#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase", deny_unknown_fields)]`):
  - `Empty`
  - `Occupied { key: i32 }`
  - `Tombstone`
- `HashOp` (`#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase", deny_unknown_fields)]`):
  - `Insert { key: i32 }`
  - `Search { key: i32 }`
  - `Delete { key: i32 }`
- `HashStep` (pure semantic serde-tagged JSON with `#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase", deny_unknown_fields)]`, no line numbers):
  - `ComputeHash { key: i32, capacity: usize, index: usize }`
  - `Probe { index: usize, slot: HashSlot, probe_number: u32, first_tombstone: Option<usize> }`
    - `probe_number` is 1-based (`1..=capacity`).
    - During `Insert`, `first_tombstone` is the first tombstone index seen so
      far **after** inspecting `slot` (so on the first tombstone encountered,
      `first_tombstone` is `Some(index)`). During `Search` and `Delete`,
      `first_tombstone` is always `None`.
  - `Place { key: i32, index: usize, replaced_tombstone: bool }`
  - `AlreadyPresent { key: i32, index: usize }`
  - `Found { key: i32, index: usize }`
  - `NotFound { key: i32 }`
  - `MarkTombstone { key: i32, index: usize }`
  - `TableFull { key: i32 }`
- `HashRunResult` (`#[serde(rename_all = "camelCase")]`):
  - `pub slots: Vec<HashSlot>`
  - `pub steps: Vec<HashStep>`
  - `pub probes: u32` (exact count of `HashStep::Probe` steps emitted)
- `pub fn run(capacity: usize, slots: &[HashSlot], op: HashOp) -> Result<HashRunResult, String>`
  - Rejects `capacity == 0` with an `Err` naming capacity.
  - Rejects `slots.len() != capacity` with an `Err` naming both `capacity` and
    `slots.len()`.
  - Always emits `ComputeHash` first, then probes from
    `(i128::from(key).rem_euclid(capacity as i128)) as usize` advancing by
    `+1 mod capacity` for at most `capacity` probes, ending with exactly one
    terminal step (`Place`, `AlreadyPresent`, `TableFull`, `Found`, `NotFound`,
    or `MarkTombstone`).

**Behaviours covered by `tests/hash_table.rs`:**

- Insert into an empty slot at `h(key)`.
- Insert with linear probing across occupied slots, including wrap-around from
  slot `10` to slot `0`.
- Insert encountering a duplicate key (direct, after collisions, and after a
  tombstone): returns `AlreadyPresent` and leaves the table unchanged.
- Insert encountering one or more tombstones when the key is new: probes until
  an empty slot (or full loop when no empty slot exists) and places the key in
  the **first** tombstone (`replaced_tombstone: true`).
- Insert into a completely full table (all slots occupied): returns `TableFull`.
- Search hit (direct, after collisions, across wrap-around, and past
  tombstones) and search miss (stops at empty slot or full loop), never mutating
  `slots`.
- Delete hit (marks slot as `Tombstone`) and delete miss (stops at empty slot
  or full loop).
- Negative keys via `rem_euclid` (including `i32::MIN`) and validation errors
  (`capacity == 0`, `slots.len() != capacity`).
- Step-log invariants (`ComputeHash` first, `probes` equals `Probe` count with
  `1..=probes`, terminal step last) and `serde_json` camelCase wire shape.

**You'll know it's done when** `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and `cargo test` pass in `game-server/` and PR 1a merges into `hash-table`.

### 1b. WASM `step_log` export & TS bridge

**Done in #103.**

- Add `#[unsafe(no_mangle)] pub unsafe extern "C" fn step_log(pointer: *mut u8, len: usize) -> u32`
  to `game-server/challenges/src/ffi.rs` and dispatch in `wire.rs` (tagged by
  `algorithm: "hash-table-linear"` so future step-log visualisers share the same
  export).
- Update `client/src/Services/challenges/challenges.ts` to:
  - Cache the loaded `ChallengesExports` synchronously once `loadChallenges()`
    resolves.
  - Export `isChallengesLoaded()` and `runHashTableStepLog(request)` (synchronous,
    throwing a clear error if called before `loadChallenges()`).
  - Export TypeScript types matching Rust's `HashSlot`, `HashOp`, `HashStep`,
    and `HashRunResult`.
- Add Rust wire tests and Vitest contract tests
  (`client/src/Services/challenges/challenges.hashTable.test.ts`, written
  test-first by a separate Opus 5.5 test writer) exercising the real
  `challenges.wasm` build across insert, search, delete, tombstones, duplicates,
  full tables, and invalid requests.

**You'll know it's done when** `pnpm run challenges`, `cargo clippy -p daily-challenges --release --target wasm32-unknown-unknown -- -D warnings`, `cargo test`, and `cd client && pnpm test` all pass and PR 1b merges into `hash-table`.

### 1c. Tidy

**Done (no PR needed):** audited all 10 Checkpoint 1 files — all well within
line limits (source max 264/300, test max 490/500), no loose boolean stages, no
redundant inline comments, and CI workflows pass unchanged.

---

## Checkpoint 2, step by step

```
2a. Share encoding & retheme state hook ──► 2b. SVG renderer, step player & GraphicalHashTable ──► 2c. Tidy
```

### 2a. Share encoding & `retheme()` state hook

Pure TypeScript foundation needed before the SVG visualiser:

- Add `client/src/visualiser-src/hash-table-visualiser/util/shareEncoding.ts`:
  - `HASH_TABLE_CAPACITY = 11`
  - `ParsedHashTableShare = { kind: 'slots'; slots: HashSlot[] } | { kind: 'keys'; keys: number[] }`
  - `encodeHashTableSlots(slots)`: returns `'empty'` when all slots are empty;
    otherwise validates length `11` and occupied keys `0..99` and returns
    `'s'` followed by 11 two-character tokens (`--` empty, `xx` tombstone,
    `00`–`99` occupied).
  - `decodeHashTableShare(segment)`: decodes `'empty'`, `'s...'` fixed-width
    slot strings (case-insensitive for `s`/`xx`), or plain even-length two-digit
    key lists (`122334`), returning `undefined` on missing or malformed input.
- Add optional state snapshot/restore hooks on `GraphicalDataStructure`
  (`snapshotState(): unknown` defaulting to `this.data`, and
  `restoreState(state: unknown): void` defaulting to `this.load(state)` for
  arrays), forward them through `VisualiserController`, and use them in
  `VisualiserSession.run()` and `VisualiserSession.retheme()` so structures
  with extra state (such as tombstones) redraw identically on theme switches
  without changing existing visualisers.

**You'll know it's done when** Vitest tests cover share encoding/decoding round
trips, malformed URLs, and `VisualiserSession.retheme()` preserving tombstone
state both when idle and mid-run, and all client checks pass.

### 2b. SVG renderer, step player & `GraphicalHashTable`

Build the step-log visualiser under
`client/src/visualiser-src/hash-table-visualiser/`:

- **SVG table renderer:**
  - Horizontal row of `11` indexed buckets (`0..10`) styled exclusively with
    `canvasTheme` tokens (light and dark).
  - Distinct states for **empty** (blank cell), **occupied** (key value), and
    **tombstone** (muted/dashed cell labelled `DEL`).
  - Active probe pointer/highlight and a visual wrap-around cue (`10 → 0`)
    alongside `"wrap → 0"` in the banner when probing wraps past slot `10`.
  - Compact on-canvas banner above the buckets showing the hash formula, live
    probe count, and step status/outcome (e.g.
    `h(23) = 23 % 11 = 1 · Probes: 2 · Placed at slot 2`).
  - Compute `stepBounds` / `stepFocus` so `Stage` frames the 11-slot strip
    cleanly on desktop and keeps active probes in view on narrow screens.
- **COMP2521 C snippets** (`util/codeSnippets.ts`) for `insert`, `search`, and
  `delete`.
- **`HashTableAnimationProducer extends AnimationProducer`:** renders the C
  snippet, plays semantic `HashStep[]` from `runHashTableStepLog`, maps each
  step to its C line via `highlightCode(line)`, updates the banner and probe
  count, and emits standard `AnimationProducer` sequences.
- **`GraphicalHashTable extends GraphicalDataStructure`:**
  - `documentation` exposing `insert`, `search`, and `delete` (`value`).
  - `insert(value)`, `search(value)`, `delete(value)` calling
    `runHashTableStepLog` synchronously and returning a
    `HashTableAnimationProducer`.
  - `load(data)`, `loadSlots(slots)`, `snapshotState()`/`restoreState()`
    preserving tombstones, `generate()` (`5`–`6` distinct keys in `0..99`
    guaranteeing at least one collision), and `data` getter.

**You'll know it's done when** Vitest tests driving `VisualiserController` with
the real `challenges.wasm` pass for all operations, C code-line highlights,
stepping forward/backward, tombstone reuse, wrap-around, `generate()` collision
guarantee, and mid-run `retheme()`.

### 2c. Tidy

Check SVG cleanup on `clear` / `reset`, file sizes, stages, comments, and test
coverage across Checkpoint 2 files. Open a tidy PR into `hash-table` if anything
changes, or record as done with no PR.

---

## Checkpoint 3, step by step

```
3a. Playwright e2e tests ──► 3b. App wiring & WASM preload ──► 3c. Visual & responsive pass ──► 3d. Tidy & docs
```

### 3a. Playwright e2e tests

Write `e2e/tests/hash-table.spec.ts` (separate test-writer agent, using
`e2e/support/visualiser-page.ts`):

1. Navigating to `/visualiser/hash-tables` loads the hash table with `11`
   indexed slots and `5`–`6` pre-filled keys containing at least one collision.
2. Inserting a key shows `h(k) = k % 11` and the probe count, animates
   placement, and wraps from slot `10` to slot `0` on wrap-around collisions.
3. Inserting an already-present key leaves the table unchanged and reports
   `Already present`.
4. Searching for an existing key highlights and finds it; searching for a
   missing key stops at an empty slot and reports `Not found`.
5. Deleting a key marks its slot as a tombstone; a later search for a key past
   that tombstone still finds it; a later insert of a new colliding key reuses
   the first tombstone slot.
6. Playback controls (play/pause, step forward/back, rewind, speed) and the C
   code panel stay in sync during an operation.
7. Switching between light and dark themes redraws the table (preserving
   tombstones) cleanly with zero console errors.
8. `Copy link` encodes the full 11-slot state (including tombstones), opening
   that URL restores the exact slots, plain two-digit URLs still load keys in
   order, and the topic is reachable from the landing page / navigation.

**You'll know it's done when** the tests run and fail only because the route
isn't wired yet.

### 3b. App wiring & WASM preload

- Add `DataStructure.HASH_TABLES = 'Hash Tables'` to
  `client/src/visualiser-src/common/typedefs.ts`.
- Register `GraphicalHashTable` in
  `client/src/visualiser-src/common/GraphicalDataStructureFactory.ts`.
- Add `'hash-tables'` (marked `requiresWasm: true`) to
  `client/src/visualiser/topics.ts`, wire the slot-state share-link
  encoder/decoder, and update `Visualiser.tsx` as needed.
- Update `VisualiserProvider` so topics with `requiresWasm: true` await
  `loadChallenges()` before calling `session.attach(...)`:
  - Show a lightweight loading state while `challenges.wasm` loads.
  - Show a clear error state with a Retry button if WASM fails to load.
  - Non-WASM topics continue attaching synchronously with no visual flash.

**You'll know it's done when** `pnpm run e2e -g "hash"` passes.

### 3c. Visual & responsive pass

Capture and inspect screenshots of `/visualiser/hash-tables` across:

- Desktop light & dark themes (initial table, mid-probe collision with banner,
  tombstone present, C code panel highlighted).
- Phone (`390px`) light & dark themes (confirming the horizontal 11-slot strip,
  banner, and controls are legible without awkward overlap).

Fix any spacing, contrast, font-size, or camera-framing issues found.

### 3d. Tidy & docs

- Run the full check suite:
  - `cd game-server && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test`
  - `pnpm run wasm`
  - `cd client && pnpm run tsc && pnpm run lint && pnpm test && pnpm run build`
  - `pnpm run e2e:typecheck && pnpm run e2e`
- Update `docs/roadmap.md` to link `docs/hash-table.md` and note that hash
  tables are the first step-log visualiser.
- Open PR 3 into `hash-table`, then merge `hash-table` into `dev`.

---

## Out of scope for v1 (v2 and later)

- **Other collision resolution strategies:** separate chaining (hanging downward
  from each horizontal bucket), quadratic probing, double hashing, and cuckoo
  hashing (the `algorithm` tag on the `step_log` wire request leaves room for
  these cleanly).
- **Dynamic resizing / rehashing & custom capacity:** configurable table size
  and animated rehash when load factor crosses a threshold.
- **Daily game templates:** `Pile-up`, `Tombstone maze`, and `Linear vs
  quadratic` from `docs/puzzle-ideas.md` (which can reuse the Rust runner from
  checkpoint 1 directly).
- **Renaming `challenges.wasm` → `algorithms.wasm`:** a standalone cleanup PR
  once in-flight daily-game branches have landed.
