# Debugger rewrite roadmap

The visual debugger currently runs GDB on a server and talks to the browser
over Socket.IO. The rewrite moves the whole debugger into the browser. Clang
compiles the student's C to WebAssembly in a Web Worker. A Rust instrumenter
adds tracking calls to the compiled wasm. The program runs once and is
recorded, and the existing UI replays the recording.

The algorithm visualisers already need no server, so the debugger is the only
reason the server exists. When the rewrite is done, the server is gone and
the site is static files.

None of the decisions below are final. Change this document when they change.

## Branches

- `debugger-rewrite` is the parent branch, created from `dev`. Every rewrite
  PR targets it, not `dev`.
- When the goal below is reached, `debugger-rewrite` is merged into `dev`.
  Until then, the GDB debugger keeps running in production.
- Merge `dev` into `debugger-rewrite` regularly, so the final merge stays
  small.
- Pushes to `debugger-rewrite` don't deploy. The Docker workflow only runs
  on `dev` and `staging`. PR checks (pre-merge and e2e) run as usual.

## How progress is measured

The Playwright suite in `e2e/` is the spec. It tests what a student sees, not
how the debugger works, so the same tests run against both debuggers. Each
run ends with a summary like `11/15 behaviours working`.

From checkpoint 1 onwards, the suite runs against both GDB and wasm. Each
debugger has its own known-failures list. The wasm list starts with every
test on it and shrinks as features land.

Unit tests (Vitest, in `client/`) cover the pieces underneath: the compiler,
the runner, and later the instrumenter and the recorder. Each one gets small
tests written before its code. `.claude/rules/testing.md` sets out what's
expected of every change.

## Before checkpoint 1: unit tests (done, #5)

The client had no unit tests. The e2e suite says whether a feature works, but
not which part is broken, so Vitest came first.

The first test covers the linked-list parser, using a state recorded from
GDB. It shows that what GDB really sends doesn't match the `BackendState`
type (fields use `kind` instead of `typeName`, and `frame_info` has no
`line`). The wasm debugger has to send what the parser actually reads.

## Checkpoints

```
Today ──► 1. It runs ──► 2. It steps ──► 3. It sees everything ──► Goal: server deleted
```

### 1. It runs

A C program compiles in the browser and runs in a Web Worker. Compile errors
and the program's output appear in the console. There is no stepping yet.

This proves that the setup works with no server: clang loading in a Worker,
the compiler download (about 105 MB, or 27 MB gzipped), load time, memory
use, and a client that can switch between the GDB and wasm debuggers. None
of this depends on the instrumenter, so the riskiest unknowns get tested
first.

**Done when:** the 3 compiling tests pass on wasm. That's 3/15.

**Status:** reached once #12 merges. See "Checkpoint 1, step by step".

### 2. It steps

The Rust instrumenter reads the DWARF debug info and inserts line-tracking
calls. The run is recorded, and the existing controls replay it line by line.

Scope: stepping forward and back, function calls and recursion, `printf`
output appearing as the program reaches it, and the session ending when the
program exits.

**Done when:** the stepping tests and the program output test pass on wasm.
That's 10/15. Four of these tests are on GDB's known-failures list, so wasm
does better than GDB from this point.

This is the riskiest checkpoint left, and it will be split into smaller
steps like checkpoint 1 once the approach is agreed.

### 3. It sees everything

The debugger shows variables, types and the heap, and handles everything
around the happy path:

- local variables and struct types
- tracked `malloc`/`free`, and following pointers
- output in the existing `BackendState` format, so the linked-list
  visualiser draws from it unchanged
- stdin, by re-running the program with the input added, and end-of-file
- NULL dereference checks and a step limit
- the built-in examples

**Done when:** the types-and-variables and linked-list tests pass on wasm
(15/15), along with any debugger tests added by then.

Most of the instrumenter's work is reading memory through the debug info, so
this checkpoint is the largest. It is one area of work, though, so it splits
into tickets without needing another checkpoint.

### Goal: server deleted

- Make wasm the default debugger.
- Delete `debugger/`, the Socket.IO client, the debugger's Docker image, and
  the Pyroscope and Grafana services.
- Merge `debugger-rewrite` into `dev`.

Error messages for students, restoring a session after a refresh, and
shareable links come after the goal. They are new features, not things GDB
already does.

## Checkpoint 1, step by step

```
1a. Two debuggers ──► 1b. It compiles ──► 1c. It runs
```

### 1a. Two debuggers

The debugger page can use either GDB or the new wasm debugger. Opening the
page with `?debugger=wasm` picks the new one. At this point the new one does
nothing, and it never connects to the server.

The e2e suite can run against either debugger, and CI runs it against both.

**You'll know it's done when** GDB still shows 11/15, wasm shows 0/15, and
both CI jobs are green. Nothing has changed for students.

**Done in #7.** The page talks to a `Debugger` interface
(`client/src/Services/debugger/`), with `GdbDebugger` wrapping Socket.IO and
`WasmDebugger` for the new one. `E2E_DEBUGGER=wasm` (or `pnpm run e2e:wasm`)
runs the suite against wasm, using `e2e/known-failures/wasm.json`.

### 1b. It compiles

With the wasm debugger selected, clicking Compile compiles the program in the
browser. If the code has errors, they appear in the console, naming the
student's file. If it doesn't, the session starts. Nothing runs yet.

This is where the compiler's size is first felt, so measure how long it takes
to load and how much memory it uses in Chrome, Firefox and Safari, and write
the numbers here.

**You'll know it's done when** the 3 compiling tests pass on wasm (3/15).

**Done in #8.** clang and the linker run as wasm (`@yowasp/clang`, pinned)
in a Web Worker. Measured on localhost, so without network time:

| Browser | First compile, including loading clang | Later compiles | Extra memory |
|---|---|---|---|
| Chromium | ~500 ms | 70–100 ms | about +330 to +400 MB |
| WebKit (Safari) | ~1.1 s | 130–150 ms | about +620 MB |
| Firefox | not measured yet | | |

### 1c. It runs

After compiling, the program runs in the browser and its output appears in
the console. A program that loops forever is stopped after a time limit
instead of freezing the page. The compiler downloads when the debugger page
opens, shows its progress, and is cached so that a second visit is fast.

**You'll know it's done when** `hello.c` prints `hello from structs` in the
console with no server running, and a second visit doesn't download the
compiler again. The suite stays at 3/15, because the output test needs
stepping, which comes in checkpoint 2.

**Done in #9 and #12.**

- **#9:** each program runs in its own Worker with a small hand-written WASI
  layer. Output streams to the console, capped at 20,000 characters and
  batched every 50 ms, so a printing loop can't flood the page. A program
  that runs for over 10 seconds is stopped with a message.
- **#12:** clang starts downloading when the page opens, and "Loading
  compiler N%" shows beside Compile. nginx serves gzipped copies made when
  the Docker image is built, about 27 MB instead of 105 MB, and caches the
  hashed files under `/assets/` for good. A second visit in a normal browser
  profile makes no requests for clang's files.

## Follow-ups

Found while building checkpoint 1, and not needed for it:

- **Private windows** download the largest compiler file again on each visit,
  because the browser caps how big a single cached file can be there. A Cache
  Storage fallback would fix it.
- **The console** draws every character as its own element, so very long
  output still stalls the page for about 0.3 s. This predates the rewrite.
- **Exit codes** aren't masked to 0–255, so `exit(-1)` reports -1, where
  Linux reports 255.
- **Crash messages** show the engine's raw text, for example "unreachable",
  which isn't written for students.
- **Closing stdout** (`close(1)`) doesn't stop later writes.
- **Firefox** hasn't been measured or tested.
- **A compile still running** when the session is reset or its file is
  deleted can still start a session. Checkpoint 2 reworks the session
  lifecycle.
