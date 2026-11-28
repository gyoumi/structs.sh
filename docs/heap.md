# Binary heap visualiser (v1)

This is the plan for the second step-log visualiser in `structs.sh`: a
**binary heap** that can be switched between a min-heap and a max-heap. It
shows insert, pop and switching between the two orders, drawing the heap as a
tree and as the array underneath it at the same time. Its operations run in
Rust, compiled into the existing `challenges.wasm`, through the step-log path
the hash table built (`docs/hash-table.md`).

The hash table proved that a step log can drive a visualiser. The heap is the
second user of that path, so it tests whether the path is general and not
shaped around one structure. The heap is also the priority queue that
Dijkstra (stage 2, step 4 in `docs/roadmap.md`) needs, and most of the heap
templates in `docs/puzzle-ideas.md` need a heap engine that the daily game can
reuse.

Build heap (bottom-up heapify), heapsort, changing a key's priority and daily
puzzle templates are left for later (see "Follow-ups").

None of the decisions below are final. Change this document when they change.

## Branches

- `heap` is the parent branch. It was cut from `hash-table`, not `dev`,
  because the step-log path (`step_log_wire.rs`, the `step_log` export, the
  `snapshotState`/`restoreState` hooks and the step player behind
  `AnimationProducer`) exists only there so far.
- Each step is one PR into `heap`, following `ship-a-step`.
- After each hash table PR merges into `hash-table`, merge `hash-table` into
  `heap`. Once `hash-table` has merged into `dev`, merge `dev` into `heap`
  instead, and from then on `heap` merges into `dev`.
- `heap` can't merge into `dev` before `hash-table` does.
- Pushes to `heap` don't deploy. `pre-merge` and `e2e` run on PRs into it as
  usual.

### Staying clear of the hash table

The hash table work is still going on, so the heap doesn't edit the files it
owns until checkpoint 3:

- Checkpoints 1 and 2 add new files only. The shared files they touch are one
  `pub mod heap;` line in `lib.rs`, one variant in `step_log_wire.rs` and one
  function in `challenges.ts`.
- Checkpoint 3's wiring (`typedefs.ts`, the factory, `topics.ts`,
  `VisualiserProvider`, `VisualiserHeader.tsx`, `ui/StructureArt.tsx`) waits
  until hash table step 3b is on `hash-table`. The heap then adds itself to
  the WASM-backed topic path that 3b builds, and doesn't build a second one.

## How progress is measured

`.claude/rules/testing.md` applies throughout. Tests come first, written by a
different agent from the one writing the code.

| Layer | Runner | What it checks |
|---|---|---|
| Rust heap and step log | `cargo test` (`game-server/challenges/tests/heap_*.rs`) | Sift up, sift down, ties, min and max order, a full heap, an empty heap, the exact step sequence |
| WASM boundary | Vitest (`client/src/Services/challenges/challenges.heap.test.ts`) | The real `challenges.wasm` `step_log` export with `algorithm: "binary-heap"`, and the decoded replies |
| Step player | Vitest (`client/src/visualiser-src/heap-visualiser/`) | `GraphicalHeap` driving `VisualiserController`: tree and array in step, code-line highlights, stepping both ways, re-theme mid-run, switching order, share encoding |
| Browser behaviour | Playwright (`e2e/tests/heap.spec.ts`) | The user-facing spec, written at the start of checkpoint 3 |
| Visual quality | Screenshots (desktop and `390px` phone, light and dark) | Tree layout, array strip, the comparison and swap highlights, the order toggle |

Each checkpoint's **Done when** is a count of passing behaviours in one of
these suites.

## Checkpoints

```
Today ──► 1. The engine answers ──► 2. It plays ──► 3. It's in the app ──► Goal: into dev
           └──────────── tidy step at the end of each, tidy checkpoint before the goal ────────────┘
```

### 1. The engine answers

A TypeScript call into `challenges.wasm` inserts into, pops from or rebuilds a
min-heap or max-heap and gets back the new array and the step log that
produced it.

The hash table already took the risk out of the WASM boundary, so this
checkpoint is small. It comes first because checkpoint 2 has nothing to play
without it, and because it shows early whether `step_log_wire.rs` takes a
second algorithm cleanly. If adding the heap means reshaping the wire format,
that change goes to the hash table thread before more is built on it.

**Done when** every behaviour in `tests/heap_*.rs` and
`challenges.heap.test.ts` passes, with `cargo clippy` clean for
`wasm32-unknown-unknown`.

**Status:** 1a done (#108), 1b done (#109). 1c to go.

### 2. It plays

`GraphicalHeap` draws the heap as a tree with the array beneath it. Each
comparison highlights the same two keys in both views, and each swap moves
them in both. The C code panel follows along, and the order toggle switches
between min and max. All of it is driven by `VisualiserController` in Vitest,
before there's a route.

This is where the new risk is: two views of one structure animating in step,
a swap that has to look right in both, and a toggle that changes the code and
the heap. It comes before the wiring so that layout problems are found while
nothing else depends on the layout.

**Done when** every behaviour in the heap visualiser's Vitest suite passes, and
screenshots from the test harness have been looked at.

**Status:** not started.

### 3. It's in the app

The heap is live at `/visualiser/heaps`, with a min | max toggle in the
header, a drawing in the landing page's structure picker, the WASM loading and
retry states from hash table 3b, both themes, phone and desktop layouts, and
share links that keep the heap's order.

This is the largest checkpoint, and it waits on the hash table: its wiring
reuses what hash table 3b adds.

**Done when** every behaviour in `e2e/tests/heap.spec.ts` passes in CI, and
desktop and `390px` phone screenshots in both themes have been checked.

**Status:** not started. Blocked on hash table step 3b.

### Goal: into dev

`heap` merges into `dev` after `hash-table` has, with every check green, and
`docs/roadmap.md` lists the heap.

---

## Checkpoint 1, step by step

```
1a. Rust heap module ──► 1b. step_log variant & TS bridge ──► 1c. Tidy
```

### Decisions

Agreed on 28 November 2026:

- **Step log, built from `hash-table`.** The heap uses the hash table's
  step-log path and doesn't edit it.
- **Min and max with a toggle.** Every operation takes the order as an input.
  The Rust code has one comparison helper that both orders go through, so no
  operation is written twice.
- **Insert and pop, plus the rebuild below.** Pop removes the root. Build
  heap, heapsort and changing a key's priority are follow-ups.
- **0-indexed array.** The children of `i` are `2i + 1` and `2i + 2`, and its
  parent is `(i - 1) / 2`. This matches LeetCode, Python's `heapq` and C++'s
  `priority_queue`.
- **Switching order rebuilds the heap, animated.** The keys are re-inserted
  one at a time, in array order, under the new order. That's a third
  operation, `Rebuild`, and it's in the Rust engine so its steps come from the
  same step log as insert and pop. (Agreed while planning checkpoint 2, but it
  belongs in checkpoint 1's contract.)
- **Capacity of 15.** That's four full levels, so the tree fits on a phone at
  the size the BST nodes use. Inserting into a full heap stops with
  `HeapFull`.
- **Duplicates allowed.** A priority queue holds equal priorities. Equal keys
  never swap: sift up stops at an equal parent, and sift down stops when
  neither child is strictly better.
- **On a tie between two children, sift down picks the left.**
- **Rust checks its input.** A request whose array isn't a valid heap for its
  order is rejected with an error naming the first index that breaks the heap
  property. That catches a drawing bug that corrupts the array before it
  reaches the engine.
- **The visualiser takes keys `0..99`,** the same as the keypad and the
  two-digit share encoding. Rust accepts any `i32`.

### 1a. Rust `heap` module

**Done in #108.**

Add `game-server/challenges/src/heap.rs` (`pub mod heap;` in `lib.rs`) and
its tests in `game-server/challenges/tests/heap_*.rs`. The test writer writes
the tests from the contract below. The implementer writes `src/heap.rs`
without reading them.

**Public interface** (serde attributes as in `hash_table.rs`: tagged by
`kind`, camelCase, `deny_unknown_fields`):

- `pub const DEFAULT_CAPACITY: usize = 15;`
- `HeapOrder`: `Min`, `Max` (on the wire, `"min"` and `"max"`).
- `HeapOp`: `Insert { key: i32 }`, `Pop`, `Rebuild`. For `Rebuild`, `items`
  is a heap of the *other* order, and `order` is the order to rebuild it in.
- `HeapStep`, describing only what the algorithm did, with no line numbers:
  - `Append { key, index }`: insert puts `key` at the end of the array.
  - `CompareParent { index, parent, swap: bool }`: one sift-up comparison.
    `swap` is true when the key at `index` is strictly better than its
    parent's.
  - `TakeRoot { key }`: pop removes the root.
  - `MoveLastToRoot { key, from }`: pop moves the last key to the root. It
    isn't emitted when the heap had one key.
  - `CompareChildren { index, left, right: Option<usize>, best, swap: bool }`:
    one sift-down comparison. `best` is the better child (left on a tie), and
    `swap` is true when it's strictly better than the key at `index`. It's
    emitted only when `index` has a left child.
  - `Swap { parent, child }`: used by both sift up and sift down.
  - `StartRebuild { order }`: a rebuild empties the heap. Then each key in
    the old array goes through `Append`, `CompareParent` and `Swap` as an
    insert does, ending with `Reinserted { key, index }` instead of `Settled`.
  - The step log ends with exactly one of these terminal steps:
    - `Settled { key, index }`: the inserted key, or the key moved to the
      root, has stopped at `index`.
    - `PoppedLast { key }`: a pop emptied the heap.
    - `Empty`: a pop on an empty heap.
    - `HeapFull { key }`: an insert into a full heap.
    - `Rebuilt { order }`: a rebuild finished. A rebuild of an empty heap is
      `StartRebuild` followed by `Rebuilt`.
- `HeapRunResult`: `items: Vec<i32>`, `steps: Vec<HeapStep>`,
  `comparisons: u32`, `swaps: u32`, and `popped: Option<i32>`.
- `pub fn run(order: HeapOrder, capacity: usize, items: &[i32], op: HeapOp) -> Result<HeapRunResult, String>`
  rejects `capacity == 0`, `items.len() > capacity` (naming both numbers), and
  an `items` that isn't a heap for `order`, or for the other order when the
  operation is `Rebuild` (naming the index and its parent).

**Exact step order.** "Better" means strictly greater for a max-heap and
strictly smaller for a min-heap, so equal keys are never better than each
other.

- **Insert**, when `items.len() == capacity`: the log is `[HeapFull { key }]`
  and `items` is returned unchanged. Otherwise `Append { key, index: len }`,
  then, while `index > 0`, `CompareParent { index, parent, swap }`. When
  `swap` is true, `Swap { parent, child: index }` follows and the key moves up
  to `parent`. When it's false, sifting stops. The log ends with
  `Settled { key, index }` at the key's final index.
- **Pop**, on an empty heap: `[Empty]`. On a heap of one key:
  `[TakeRoot { key }, PoppedLast { key }]`. Otherwise `TakeRoot { key: root }`,
  `MoveLastToRoot { key: last, from: len - 1 }`, then, while the moved key's
  index has a left child in the shrunk heap,
  `CompareChildren { index, left, right, best, swap }`. When `swap` is true,
  `Swap { parent: index, child: best }` follows and the key moves down to
  `best`. When it's false, sifting stops. The log ends with
  `Settled { key, index }`. `popped` is the old root on a successful pop and
  `None` otherwise.
- **Rebuild**: `StartRebuild { order }`, then, for each key of the old
  `items` in index order, the same `Append`, `CompareParent` and `Swap` steps
  an insert into the heap built so far would emit, ending with
  `Reinserted { key, index }` instead of `Settled`. The log ends with
  `Rebuilt { order }`.
- `comparisons` counts `CompareParent` and `CompareChildren` steps, and
  `swaps` counts `Swap` steps.
- On the wire: `HeapOrder` is the plain string `"min"` or `"max"`. `HeapOp` is
  `{"kind": "insert", "key": 5}`, `{"kind": "pop"}` or `{"kind": "rebuild"}`.
  Steps look like `{"kind": "compareChildren", "index": 0, "left": 1,
  "right": null, "best": 1, "swap": true}`, with a missing `right` written as
  `null` rather than left out. `HeapRunResult` is `{"items": [..],
  "steps": [..], "comparisons": 2, "swaps": 1, "popped": null}`.
- `HeapOrder`, `HeapOp` and `HeapStep` derive `Debug`, `Clone`, `PartialEq`,
  `Eq`, `Serialize` and `Deserialize`. `HeapRunResult` derives `Debug`,
  `Clone`, `PartialEq`, `Eq` and `Serialize`.
- Validation runs in this order: `capacity == 0`, then too many items, then
  the heap check, for every operation (including a pop on an empty heap and
  an insert into a full one). The capacity error contains the word
  "capacity" and doesn't depend on the items. The heap check names the
  smallest index `i` whose key is better than its parent's (for `Rebuild`,
  better under the other order) and that index's parent, and doesn't name any
  later bad index. Numbers in errors are written as plain decimal numbers.
- An insert into a full heap isn't an error: it's `Ok` with `[HeapFull]`. A
  rebuild of a full heap rebuilds normally.
- `HeapOrder` is case-sensitive: `"Min"`, `"MAX"` and `0` are rejected.
  Variants with fields reject unknown fields and require every field. Serde
  ignores extra keys on tagged unit variants (`pop`, `rebuild`, `empty`),
  and that's allowed.
- `HeapRunResult`'s JSON has exactly the fields `items`, `steps`,
  `comparisons`, `swaps` and `popped`. `popped` is `None` for insert, rebuild
  and a pop on an empty heap.
- A capacity above 15 is allowed, and nothing depends on it.

**Behaviours the tests cover**, each for both min and max. They're split
across `tests/heap_insert.rs`, `heap_pop.rs`, `heap_rebuild.rs`,
`heap_validation.rs`, `heap_invariants.rs` and `heap_wire.rs`, with helpers
in `tests/common/`, to stay under the 500-line limit for test files:

- Insert into an empty heap.
- Insert that stops at once, sifts part of the way, or sifts all the way to the
  root.
- Insert of a key equal to its parent, which doesn't swap.
- Insert into a full heap, which returns `HeapFull` and leaves the array as it
  was.
- Pop from a heap of one key (`PoppedLast`) and from an empty heap (`Empty`).
- Pop where the moved key sifts down past nodes with two children, nodes with
  only a left child, and a tie between the children.
- The same keys inserted as a min-heap and as a max-heap give mirror-image
  results.
- Rebuild from max to min and from min to max: the result is a valid heap of
  the new order, holding the same keys, built by inserting them in their old
  array order. Rebuilding an empty heap and a heap of one key.
- Every request is rejected that should be: capacity 0, too many items, an
  array that isn't a heap.
- Step log invariants: the terminal step comes last and only once,
  `comparisons` and `swaps` match the steps, and every `Swap` follows a compare
  step with `swap: true`.
- The camelCase JSON shape on the wire.

**You'll know it's done when** `cargo fmt --check`,
`cargo clippy --all-targets -- -D warnings` and `cargo test` pass in
`game-server/` and PR 1a merges into `heap`.

### 1b. `step_log` variant and TypeScript bridge

**Done in #109.**

- Add a `BinaryHeap { order, capacity, items, op }` variant, tagged
  `"binary-heap"`, to `StepLogRequest` in
  `game-server/challenges/src/step_log_wire.rs`, and dispatch it to
  `heap::run`. Update the request list in `wire.rs`'s module docs.
- Add `client/src/Services/challenges/heapTypes.ts`, with types matching the
  Rust ones, and `runHeapStepLog(request)` in `challenges.ts`. It's synchronous
  once `loadChallenges()` has resolved, like `runHashTableStepLog`.
- Add Rust wire tests and Vitest contract tests
  (`challenges.heap.test.ts`) against the real `challenges.wasm`, covering
  both orders, all three operations, a full heap, an empty heap and every
  rejected request.

**You'll know it's done when** `pnpm run challenges`,
`cargo clippy -p daily-challenges --release --target wasm32-unknown-unknown -- -D warnings`,
`cargo test` and `cd client && pnpm test` all pass, and PR 1b merges into
`heap`.

### 1c. Tidy

Run the tidy rules over checkpoint 1's files. Open a PR into `heap` if
anything changes. Otherwise record it here as done with no PR.

---

## Checkpoint 2, step by step

```
2a. Share encoding & order state ──► 2b. Tree and array renderer ──► 2c. Step player & GraphicalHeap ──► 2d. Tidy
```

### Decisions

Agreed on 28 November 2026:

- **Switching order is an animated rebuild** (the `Rebuild` operation from
  checkpoint 1). Its title in the code panel is "Switch to min-heap" or
  "Switch to max-heap". Switching mid-run behaves the same as starting any
  other operation mid-run.
- **The array sits under the tree**, on desktop and on phones alike. There's
  one layout to test.
- **A swap moves both views at once.** The two tree nodes trade places along
  their edge while the two array cells slide past each other.
- **The views are linked by colour, not lines.** The node and cell being
  compared share a highlight colour. Other nodes have no index labels, which
  keeps a heap of 15 keys readable.
- **No step-by-step text line.** The code panel's title names the operation
  ("Insert 42", "Pop"), as it does for linked lists, BSTs, AVL trees and
  sorting. The hash table's banner isn't copied.
- **It opens with 7 random keys in a max-heap**, which is a full three-level
  tree. `Clear` empties it.
- **Share links carry the order as a prefix**, for example `max-120734`
  (two-digit keys in array order). A plain key list such as `120734` inserts
  the keys in order into a max-heap. A link whose keys aren't a valid heap of
  its order loads by inserting them in order too.

### 2a. Share encoding and order state

Pure TypeScript: encoding and decoding the order and the array, and keeping the
order through `snapshotState`/`restoreState` so a re-theme mid-run redraws the
same heap in the same order.

**You'll know it's done when** Vitest covers round trips, malformed links and
re-theming with each order.

### 2b. Tree and array renderer

`HeapCanvas.ts` draws the complete tree with the array strip under it, from
one array, using only `canvasTheme` tokens. Each array cell is labelled with
its index, and the tree node and array cell for one index can be highlighted
together in one colour. A swap animates both pairs at once. It also computes
`stepBounds` and `stepFocus` so `Stage` frames both views.

**You'll know it's done when** screenshots of 1, 7 and 15 keys, in both
themes and at both widths, have been looked at and shown to you.

### 2c. Step player and `GraphicalHeap`

- `util/codeSnippets.ts`: C for `insert` and `pop`, 0-indexed, with the
  comparison written as `>` for a max-heap and `<` for a min-heap. The snippet
  changes when the order does.
- `HeapAnimationProducer`: plays `HeapStep[]` from `runHeapStepLog`, highlights
  the C line for each step, and animates the comparison and swap in both
  views.
- `GraphicalHeap extends GraphicalDataStructure`: `insert(value)`, `pop()`,
  `rebuild(order)`, `generate()` (7 random keys, max-heap), `load`, and
  `snapshotState`/`restoreState` keeping the order.

**You'll know it's done when** Vitest tests driving `VisualiserController`
with the real `challenges.wasm` pass for insert, pop and rebuild in both
orders, including code-line highlights, stepping forward and back, a full
heap, an empty heap, a 7-key starting heap and a re-theme mid-run. A
screen recording of insert, pop and a rebuild has been shown to you.

### 2d. Tidy

Same rules as 1c, over checkpoint 2's files.

---

## Checkpoint 3, step by step

```
3a. e2e spec ──► 3b. App wiring ──► 3c. Visual & phone pass ──► 3d. Tidy
```

This checkpoint starts once hash table 3b is on `hash-table` and has been
merged into `heap`. Its open questions get asked before 3a, once checkpoint 2
has shown what the heap looks like.

### 3a. e2e spec

`e2e/tests/heap.spec.ts`, written by a separate test writer against
`e2e/support/visualiser-page.ts`. It should cover reaching the heap from
navigation and from the landing page's structure picker, the 7-key max-heap it
opens with, insert and pop in both orders, switching order with the header
toggle (which rebuilds the same keys), a full heap and an empty heap, playback
controls with the code panel, switching theme mid-run with no console errors,
and share links that keep the order.

**You'll know it's done when** the tests run and fail only because
`/visualiser/heaps` isn't wired yet.

### 3b. App wiring

- `DataStructure.HEAPS` in `typedefs.ts`, `GraphicalHeap` in the factory, and
  a `heaps` topic in `topics.ts`, marked as WASM-backed the way hash table 3b
  marks its topic.
- A min | max toggle in the visualiser header (`VisualiserHeader.tsx`),
  shown only for the heap. Changing it runs the rebuild.
- The share link, with the order prefix.
- A small tree-and-array drawing for the heap in the landing page's structure
  picker (`ui/StructureArt.tsx`), like the four existing entries.

**You'll know it's done when** `pnpm run e2e -g "heap"` passes.

### 3c. Visual and phone pass

Screenshots of `/visualiser/heaps` on desktop and a `390px` phone, in light
and dark, with a heap of 15 keys mid-swap. Fix whatever they show.

### 3d. Tidy

Same rules as 1c, over checkpoint 3's files.

---

## Tidy checkpoint

```
Ta. Structure ──► Tb. Comments ──► Tc. Tests ──► Td. Checks ──► Into dev
```

The scope is every file the heap added or changed. The repo already checks
file sizes (`scripts/check-file-sizes.mjs`) and several of the lint rules the
debugger rewrite's tidy added, so Td may have nothing to add. Agree the scope
and rules before Ta, and record any new check here.

## Goal: into dev

1. Once `hash-table` has merged into `dev`, merge `dev` into `heap`.
2. Run every check: `cargo fmt --check`, `cargo clippy` and `cargo test` in
   `game-server/`, `pnpm run wasm`, `pnpm run tsc`, `pnpm run lint`,
   `pnpm test` and `pnpm run build` in `client/`, and `pnpm run e2e:typecheck`
   and `pnpm run e2e`.
3. Add the heap to the visualiser track in `docs/roadmap.md`.
4. Open the PR from `heap` into `dev`, and merge it only on your go-ahead.

## Follow-ups

- **Build heap (bottom-up heapify).** Needed by the "Heavy heapify", "Insert vs
  heapify" and "Upset: inserting beats heapify" templates in
  `docs/puzzle-ideas.md`. It's a new `HeapOp` and reuses the sift-down steps.
- **Heapsort.** Build heap, then pop into the sorted tail of the array. The
  array view needs a sorted region. The "Heapsort" template needs it.
- **Changing a key's priority.** Increase or decrease a key and sift. Dijkstra
  needs it.
- **Daily templates.** Leave them until the daily game branches settle. The
  Rust `heap::run` from checkpoint 1 can score them directly.
- **Binary heap compared with a Fibonacci heap** (stage 2, step 9 in
  `docs/roadmap.md`).
