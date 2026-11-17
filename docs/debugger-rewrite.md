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

**Status:** reached (#7, #8, #9, #12). See "Checkpoint 1, step by step".

### 2. It steps

The Rust instrumenter reads the DWARF debug info and inserts line-tracking
calls. The run is recorded, and the existing controls replay it line by line.

Scope: stepping forward and back, function calls and recursion, `printf`
output appearing as the program reaches it, and the session ending when the
program exits.

**Done when:** the stepping tests and the program output test pass on wasm.
That's 10/15. Four of these tests are on GDB's known-failures list, so wasm
does better than GDB from this point.

This is the riskiest checkpoint left. See "Checkpoint 2, step by step".

### 3. It sees everything

The debugger shows variables, types and the heap, and handles everything
around the happy path:

- local variables and struct types
- tracked `malloc`/`free`, and following pointers
- output in the existing `BackendState` format, so the linked-list
  visualiser draws from it unchanged
- stdin, by re-running the program with the input added, and end-of-file
- NULL dereference checks
- the built-in examples

**Done when:** the types-and-variables and linked-list tests pass on wasm
(16/16), along with any debugger tests added by then.

Most of the instrumenter's work is reading memory through the debug info, so
this checkpoint is the largest. It splits into three steps (see "Checkpoint
3, step by step").

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

## Checkpoint 2, step by step

```
2a. Instrumenter skeleton ──► 2b. Line trace ──► 2c. Replay
```

### Decisions

- **A step** is one statement. The instrumenter records an event at the start
  of each new statement in the line table, and replay skips repeats of the
  same line in the same call. Stepping enters functions the student wrote.
  The C library gets no tracking calls, so a call like `printf` is stepped
  over.
- **One recording** holds line events, output and how the program ended (its
  exit code, a crash and where it happened, or a limit). Output sits in the
  same stream as the lines, so it appears when stepping reaches it.
- **A step limit** (around 100,000 events) sits alongside the 10-second time
  limit, so a long loop can't use unlimited memory. Hitting either ends the
  recording with a message, and everything before it can still be stepped
  through.
- **The session ends** when stepping goes past the last event: the console
  says how the program ended, and stepping forward stops. **Stepping back
  stays available** after the end, which GDB can't do.
- **Shared code** that GDB also uses can change, as long as GDB's behaviour
  stays the same or gets better. For example, the fix for needing two clicks
  per step also takes that test off GDB's known-failures list.
- **The instrumenter is Rust**, using `walrus` to rewrite the program and
  `gimli` to read the debug info. It's built for `wasm32-unknown-unknown` with
  plain `cargo build`. It needs no `wasm-bindgen`, `web-sys` or `wasm-pack`:
  one function crosses the boundary (bytes in, bytes out), with `alloc`,
  `instrument` and `free` exports and a few lines of TypeScript.
- **The `.wasm` is built in CI and in the Docker image**, not committed.
  Building the client locally needs Rust (`rustup`). crates.io and the Rust
  toolchain download fine on networks where some npm downloads don't.

### 2a. Instrumenter skeleton

An `instrumenter/` Rust crate, built to wasm and run in the compiler Worker
after linking. It passes programs through unchanged. `cargo test` runs in CI,
and the `.wasm` is built in CI and in the Docker image.

**You'll know it's done when** programs still compile and run through the
instrumenter (wasm stays at 3/15), the Rust tests run in CI, and the Docker
image builds.

**Done in #16.**

### 2b. Line trace

The instrumenter reads the line table and inserts a call at the start of each
new statement in the student's code. The runner records lines, output and the
end of the program in one stream, up to the step limit.

**You'll know it's done when** unit tests show the recorded lines for each
e2e program in the order a student would step through them.

**Done in #17.** The instrumenter adds `structs.line(n)` before each
statement, and `structs.enter` and `structs.exit` around each of the
student's functions. `recordRun` (`client/src/Services/debugger/wasm/recording.ts`)
turns those calls into steps, each with its function, line, call depth and
the output it printed.

### 2c. Replay

Stepping forward and back replays the recording, with the current function's
name. Output appears at the step that printed it, and the session ends at the
last event. The shared controls stop needing two clicks per step.

**You'll know it's done when** the stepping tests and the program output test
pass on wasm (10/15).

**Done in #18.** Compiling now records the whole run in the runner Worker,
and each step forward sends the page the next step from the recording. The
page keeps the steps it has been sent, so stepping back needs nothing from
the debugger, and it still works after the session ends. When stepping goes
past the last step, the console says how the program ended: its exit code, a
crash, or which limit stopped it. The recorder checks the 10-second limit
itself, so a program stopped for running too long keeps the steps it took.

The two-clicks bug was in the shared controls: the flag that said "show the
next state when it arrives" was cleared before the state arrived. States now
join the page's list the moment they arrive, and the button moves to them
once the step finishes. This fixed GDB too, which now passes 12/16. wasm
passes 11/16, including a new test for stepping back after the end.

## Checkpoint 3, step by step

```
3a. Variables and types ──► 3b. The heap ──► 3c. Input and the examples
```

### Decisions

- **Each step keeps a snapshot** of what the page shows: the current
  function's variables and the heap blocks it can reach, in the
  `BackendState` format. Snapshots share heap objects that didn't change
  since the step before. A size budget sits alongside the step and time
  limits: a recording that outgrows it ends with a message, and everything
  before it can still be stepped through. Pausing the real program instead
  (with `SharedArrayBuffer`) was ruled out. It needs extra security headers,
  and it gives up record and replay, which makes input simple.
- **The heap shows what GDB shows:** structs reachable by following pointers
  from the variables of every frame. `malloc` and `free` are tracked
  underneath, so a pointer is only followed into memory that is really
  allocated. That also leaves room to flag leaks and use-after-free later.
- **NULL dereferences crash** with a message on the student's line. In wasm,
  address 0 is ordinary memory, so the instrumenter checks every load and
  store, including those in the C library (so `strlen(NULL)` is caught). The
  program's data starts at address 1024, so any lower address is an error.
- **Typed input re-records the program.** The recording stops where the
  program waits for input. When the student types a line in the console, the
  program is recorded again with all the input so far, and stepping carries
  on from the same step. Ctrl+D sends end-of-file. GDB's server never
  implemented typed input, so this is new.
- **The built-in examples** each get an e2e smoke test: it compiles and steps
  to the end without an error. Two or three also check what the visualiser
  draws. Comparing every step with GDB was ruled out, because GDB has its own
  bugs and it would double CI time.
- **Where wasm differs from real C**, we accept it for now: pointers are 4
  bytes, and memory starts zeroed, so an uninitialised `int` shows 0 rather
  than garbage. See the follow-ups.

### 3a. Variables and types

The instrumenter reads where each variable lives from the debug info, and
tells the recorder where each call's frame is. At every step the recorder
reads the current function's variables (ints, chars, floats, doubles,
pointers, structs and arrays) and sends them to the page with the struct
types the program uses.

**You'll know it's done when** the three types-and-variables tests pass on
wasm (14/16).

### 3b. The heap

The recorder follows pointers from every frame's variables, so the linked-list
visualiser draws from wasm states unchanged. `malloc` and `free` are tracked,
NULL dereferences crash with a message, and recordings have a size budget.

**You'll know it's done when** the linked-list tests pass on wasm (16/16), and
unit tests cover a NULL dereference and the size budget.

### 3c. Input and the examples

Typed input re-records the program, and Ctrl+D sends end-of-file. Each
built-in example compiles and steps to the end.

**You'll know it's done when** an e2e test types input into a program that
reads it, and the new smoke tests pass on wasm for all 8 examples.

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
- **A program stuck in a C library call** for over 10 seconds (for example a
  huge `memset`) is caught only by the Worker's backstop, which loses the
  recording. The recorder only checks the time when a statement starts.
- **The console isn't rewound** when stepping back, so it shows output from
  steps after the current one. GDB behaves the same way.
- **A compile still running** when the session is reset or its file is
  deleted can still start a session. Checkpoint 2 reworks the session
  lifecycle.
- **Uninitialised variables** show 0 on wasm, because memory starts zeroed.
  Filling each new stack frame with a pattern such as `0xAAAAAAAA` would make
  them look uninitialised, as they do on real hardware.
- **Pointers are 4 bytes** on wasm and 8 on the machines students use, so
  `sizeof(int *)` and addresses look different.
