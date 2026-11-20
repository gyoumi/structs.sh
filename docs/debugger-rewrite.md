# Debugger rewrite roadmap

The visual debugger currently runs GDB on a server and talks to the browser
over Socket.IO. The rewrite moves the whole debugger into the browser. Clang
compiles the user's C to WebAssembly in a Web Worker. A Rust instrumenter
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

The Playwright suite in `e2e/` is the spec. It tests what a user sees, not
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
GDB. It shows that what GDB really sends doesn't match the `ProgramState`
type, then called `BackendState` (fields use `kind` instead of `typeName`, and `frame_info` has no
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

**Status:** reached (#16, #17, #18). See "Checkpoint 2, step by step".

### 3. It sees everything

The debugger shows variables, types and the heap, and handles everything
around the happy path:

- local variables and struct types
- tracked `malloc`/`free`, and following pointers
- output in the existing `ProgramState` format, so the linked-list
  visualiser draws from it unchanged
- stdin, by re-running the program with the input added, and end-of-file
- NULL dereference checks
- the built-in examples

**Done when:** the types-and-variables and linked-list tests pass on wasm
(16/16), along with any debugger tests added by then.

Most of the instrumenter's work is reading memory through the debug info, so
this checkpoint is the largest. It splits into three steps (see "Checkpoint
3, step by step").

**Status:** reached (#20, #22, #25). wasm passes all 25 e2e tests with an
empty known-failures list; GDB still has 5 on its list.

### Goal: server deleted

- Make wasm the default debugger.
- Make uninitialised variables look uninitialised, as they do under GDB.
- Delete `debugger/`, the Socket.IO client, the debugger's Docker image, and
  the Pyroscope and Grafana services.
- Merge `debugger-rewrite` into `dev`.

**Status:** reached (#29, #30, #31, #32, #33, #34, #35). The debugger also
works offline once the page has loaded (#34).

See "The goal, step by step".

Error messages for users, restoring a session after a refresh, and
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
both CI jobs are green. Nothing has changed for users.

**Done in #7.** The page talks to a `Debugger` interface
(`client/src/Services/debugger/`), with `GdbDebugger` wrapping Socket.IO and
`WasmDebugger` for the new one. `E2E_DEBUGGER=wasm` (or `pnpm run e2e:wasm`)
runs the suite against wasm, using `e2e/known-failures/wasm.json`.

### 1b. It compiles

With the wasm debugger selected, clicking Compile compiles the program in the
browser. If the code has errors, they appear in the console, naming the
user's file. If it doesn't, the session starts. Nothing runs yet.

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
  same line in the same call. Stepping enters functions the user wrote.
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
new statement in the program's code. The runner records lines, output and the
end of the program in one stream, up to the step limit.

**You'll know it's done when** unit tests show the recorded lines for each
e2e program in the order a user would step through them.

**Done in #17.** The instrumenter adds `structs.line(n)` before each
statement, and `structs.enter` and `structs.exit` around each of the
program's functions. `recordRun` (`client/src/Services/debugger/wasm/recording.ts`)
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
  function's variables and the heap structs reachable from every frame's
  variables, in the `ProgramState` format. Snapshots share heap objects that didn't change
  since the step before. A size budget sits alongside the step and time
  limits: a recording that outgrows it ends with a message, and everything
  before it can still be stepped through. Pausing the real program instead
  (with `SharedArrayBuffer`) was ruled out. It needs extra security headers,
  and it gives up record and replay, which makes input simple.
- **The heap shows what GDB shows:** structs reachable by following pointers
  from the variables of every frame. `malloc` and `free` are tracked
  underneath, so a pointer is only followed into memory that is really
  allocated. That also leaves room to flag leaks and use-after-free later.
- **NULL dereferences crash** with a message on the user's line. In wasm,
  address 0 is ordinary memory, so the instrumenter checks every load and
  store, including those in the C library (so `strlen(NULL)` is caught). The
  program's data starts at address 1024, so any lower address is an error.
- **Typed input re-records the program.** The recording stops where the
  program waits for input. When the user types a line in the console, the
  program is recorded again with all the input so far, and stepping carries
  on from the same step. Ctrl+D sends end-of-file. GDB's server never
  implemented typed input, so this is new.
- **The built-in examples** each get an e2e smoke test: it compiles and steps
  through without a debugger error. One that never ends (the CTF exercise
  loops forever on purpose) stops at the step limit with its message. An
  example that clang rejects, such as `list_length_recursive.c`, which calls
  functions before declaring them, gets the missing declarations. Two or
  three also check what the visualiser draws. Comparing every step with GDB was ruled out, because GDB has its own
  bugs and it would double CI time.
- **Where wasm differs from real C**, we accept it for now: pointers are 4
  bytes, and fresh memory starts zeroed, so an uninitialised `int` often
  shows 0 rather than garbage. See the follow-ups. (Step 4b fills stack
  frames, so locals no longer show 0.)

### 3a. Variables and types

The instrumenter reads where each variable lives from the debug info, and
tells the recorder where each call's frame is. At every step the recorder
reads the current function's variables (ints, chars, floats, doubles,
pointers, structs and arrays) and sends them to the page with the struct
types the program uses.

**You'll know it's done when** the three types-and-variables tests pass on
wasm (14/16).

**Done in #20.** The instrumenter writes a `structs.debug` section with each
statement's variables in scope, where they live, and their types, named the
way GDB names them (`instrumenter/src/dwarf/mod.rs`). The recorder reads them from
memory at each step, in the format the GDB debugger sends
(`client/src/Services/debugger/wasm/variables.ts`). A recording of GDB's
states for the same program is checked in, and the tests compare against it.
Copilot's reviews added bit-fields, negative enums, `restrict`, anonymous
struct members and nested declarators such as `int (*[2])[3]`.

### 3b. The heap

The recorder follows pointers from every frame's variables, so the linked-list
visualiser draws from wasm states unchanged. `malloc` and `free` are tracked,
NULL dereferences crash with a message, and recordings have a size budget.

**You'll know it's done when** the linked-list tests pass on wasm (16/16), and
unit tests cover a NULL dereference and the size budget.

**Done in #22.** The instrumenter wraps the C library's `malloc`, `calloc`,
`realloc` and `free`, found by name, and checks the address of every load,
store, `memory.copy` and `memory.fill` against 1024, including the address's
constant offset (clang reads globals as 0 plus an offset). The recorder walks
pointers from every frame through struct fields, arrays and tables of
pointers, shows only live heap memory, shares unchanged entries between
steps, and stops at a 50 MB budget that counts every step's references.

### 3c. Input and the examples

Typed input re-records the program, and Ctrl+D sends end-of-file. Each
built-in example compiles and steps through without a debugger error.

**You'll know it's done when** an e2e test types input into a program that
reads until end-of-file, sends Ctrl+D, and sees the program finish; and the
new smoke tests pass on wasm for all 8 examples.

**Done in #25.** stdin is the input typed so far. A read past it before
Ctrl+D stops the recording and keeps the session open. Each new line, or
Ctrl+D, records the program again from the start, and stepping carries on
from the same step. Ctrl+D no longer closes the session. Each built-in
example has an e2e smoke test, and wasm's known-failures list is empty.

## The goal, step by step

```
4a. wasm by default ──► 4b. Uninitialised variables ──► 4c. GDB deleted ──► 4d. Into dev
```

### Decisions

- **No waiting period with both debuggers.** 4c follows 4a straight away.
  Nothing deploys from `debugger-rewrite`, so a trial period there would test
  nothing, and the e2e suite already shows wasm doing everything GDB does.
- **Production keeps the client image only.** 4c stops building and
  deploying the debugger image. The Deploy workflow builds on forks too, but
  only `devsoc-unsw/structs.sh` publishes and deploys, so whoever deploys
  upstream also removes the debugger service from DevSoc's deployment
  config, which lives outside this repo. Moving to static hosting is a separate step after the goal.
- **Uninitialised variables get a fill pattern before GDB goes.** COMP2521
  teaches that an uninitialised variable holds garbage, and GDB shows that.
  On wasm, fresh memory starts zeroed, so an uninitialised `int` usually
  shows 0. 4-byte pointers stay a known difference (see the follow-ups).
- **`dev`'s required checks change at 4d.** The "Protect dev" ruleset
  requires `sanity-debugger`, which 4c deletes, and `e2e`, which 4c brings
  back as the job's name. The ruleset is updated with `gh api` when the
  merge into `dev` is approved.

### 4a. wasm by default

**Done in #29.** The debugger page uses wasm unless the address has `?debugger=gdb`, and the
e2e suite runs against wasm unless `E2E_DEBUGGER=gdb` is set. GDB still
works, so this is easy to undo.

**You'll know it's done when** opening the debugger page with no parameter
compiles in the browser with no server running, and the GDB e2e run still
passes with `?debugger=gdb`.

### 4b. Uninitialised variables

**Done in #30.** Each new stack frame is filled with the byte `0xAA` when a function is
entered, so an uninitialised `int` shows -1431655766 (`0xAAAAAAAA`) and an
uninitialised pointer shows `0xaaaaaaaa`, rather than 0. Heap memory from
`malloc` is left as it is (glibc often hands out zeroed memory too), and
`calloc` still returns zeroed memory.

**You'll know it's done when** a recorded program shows the pattern for a
local that hasn't been assigned yet, and the value it's given once it has.

### 4c. GDB deleted

**Done in #31 and #32.** Delete:

- `debugger/`, including the `nsjail` gitlink that has no `.gitmodules` entry
- `gdbDebugger.ts` and its test, the fake socket, `socketClientType.ts`,
  `socket.io-client`, and the `?debugger=` switch with its test cases
- `VITE_DEBUGGER_URL` in `client/.env.example`, `client/Dockerfile.prod` and
  the Deploy workflow's build arguments
- the GDB e2e run and `e2e/known-failures/gdb.json`; the job's name goes
  back to `e2e`
- the `debugger`, Pyroscope and Grafana services in `docker-compose.yml`,
  and `grafana/`
- the debugger image in the Deploy workflow, and the `sanity-debugger` job
- the GDB-only parts of the PR rules, `check:changed`'s ruff and mypy
  steps, `.coderabbit.yaml` and the docs
- the GDB parts of the testing rule and the skills, in a PR of their own,
  since the PR rules keep `.claude/` changes apart from other changes

pr-rules judges a PR by the base branch's rules, so this PR still needs the
`removal-ok` label (it deletes the pytest files) and `human-approved` (it
changes CI and other protected files). It also needs `no-test-needed` unless
it adds or changes an e2e test: deleting `debugger/src` counts as a debugger
change, and deleted tests don't count as tests. Only a person adds those
labels.

**You'll know it's done when** CI passes with no Python, no Docker for the
debugger and no GDB, the e2e suite passes against wasm, and searching the
code for GDB and Socket.IO finds only history.

### 4d. Into dev

**Done in #33 and #35.** The PR rules keep agent config (`.claude/`) in PRs of its own, so the
testing rule and the skill changes from the rewrite go into `dev` first.
Then `dev` is merged into `debugger-rewrite` one last time, the ruleset is
updated, and `debugger-rewrite` is merged into `dev`. That PR needs the same
labels as 4c, since `dev`'s rules still expect the GDB files.

**You'll know it's done when** `dev` has no server code, its required
checks pass, and the site runs from the client image alone.

## Checkpoint 5: tidy, before going into dev

```
5a. Structure ──► 5b. Comments ──► 5c. Tests ──► then #35 into dev
```

The rewrite works. Before it goes into `dev`, its code is made easy to read
and change: no file too big, no state kept in loose flags, and no comments
or tests that don't earn their place. Nothing a user sees changes, so the
e2e suite and the GDB comparison must pass unchanged at every step.

### Decisions

- **Scope: the code the rewrite added or changed.** That's
  `client/src/Services/debugger/`, `client/src/Services/useDebugger.ts`,
  `instrumenter/`, `e2e/`, the PR scripts in `scripts/`, and the visualiser
  files the rewrite changed (the linked-list parser, the annotation
  types, the Configuration panel, `Controls.tsx`, `DevelopmentMode.tsx`,
  `useCursor.ts`). Files the rewrite barely touched, such as
  `IFileSystem.ts` (two lines), stay out, as does the rest of the client.
- **Size limits, enforced in CI:** at most 300 lines for a source file and
  500 for a test file (`*.test.ts`, `*.spec.ts`, `scripts/*.test.mjs`,
  `instrumenter/tests/`, and everything in `e2e/`). Fixtures and recordings
  (`.c`, `.json`) don't count. The repo checks in CI run a script
  over the scope above.
- **No implicit state machines.** When a thing moves through stages (a
  runner Worker, a debug session, a call being recorded), its stage is one
  value with a named type, not several booleans that have to agree.
- **Comments: the no-comments skill**, adapted from
  [cursor/plugins' pstack](https://github.com/cursor/plugins/blob/main/pstack/skills/no-comments/SKILL.md)
  and installed in this repo (`.claude/`, in a PR of its own). It keeps
  public API docs, license headers and notes about things we can't change
  (a browser, clang or wasm quirk). Anything that explains our own code
  becomes a better name, type or shape instead.
- **Tests: prune and merge without losing coverage.** A test goes if
  another test already checks the same behaviour, or if it checks a private
  detail rather than what a caller or user sees. Tests that repeat one
  shape with different inputs become one table-driven test. Coverage of the
  scoped files is measured before and after, and must not drop. Each PR
  lists every test it removes and what still covers it.
- **Three PRs, in order:** 5a structure, 5b comments, 5c tests, so each is
  reviewed on its own. 5a and 5b change no existing tests (they're refactors,
  and the existing tests must still pass); 5a adds only the tests for the
  new size-check script. 5c changes tests, plus the one line that turns
  the size check on for test files.

### 5a. Structure

Split the source files over 300 lines (today `instrumenter/src/debug.rs`,
`instrumenter/src/lib.rs`, `wasm/variables.ts`, `wasm/recording.ts`,
`wasmDebugger.ts`, `linkedListParser.ts`) along the lines of what each part
does. Replace the loose flags with named stages: the runner pool's
`ready`/`answered`/`returned`/`disposed`/`ended`, the debugger session's
fields, and the recorder's per-call flags. Add the size check to CI for
source files. Modules keep their public exports, so no test changes.

**You'll know it's done when** no source file in scope is over 300 lines,
CI checks it, each of those things has one stage value, and every test and
the e2e suite pass unchanged.

### 5b. Comments

Run the no-comments skill over the scope. Comments that explain our own
code are deleted, and the code is renamed or reshaped where it was unclear
without them.

**You'll know it's done when** the remaining comments are API docs,
licence headers or notes about outside constraints, and every test passes
unchanged.

### 5c. Tests

Remove duplicate tests and tests of private details, merge repeated shapes
into table-driven tests, and split test files over 500 lines. Add the size
check for test files. Coverage of the scope doesn't drop, and the GDB
comparison and every-step e2e tests stay as they are.

**You'll know it's done when** no test file in scope is over 500 lines, CI
checks it, coverage is the same or higher, and the PR lists every removed
test with what still covers it.

## Follow-ups

Found while building checkpoint 1, and not needed for it:

- **A loop written on one line that calls a function** (`for (...) total += f(i);`)
  doesn't show its line between iterations: the function's steps run back
  to back, because each revisit is the same line in the same call. GDB shows
  the line each time.
- **An `if` whose body ends in a call** stops once more on `} else {` after
  the call returns (bst.c line 19): clang puts the branch's jump on that
  line. GDB goes straight to the next statement. It's on the wasm
  known-failures list.
- **Memory reused as a different struct, reached only through remembered
  structs,** can still be read with the old layout. The recorder keeps
  showing a struct until it's freed, and what the variables reach wins when
  memory is reused as another struct. But suppose a remembered struct's
  field is changed, through a cast, to point at a struct that overlaps
  another remembered node. Then neither is reached from a variable, so the
  old node's pointer fields can still be followed and draw unrelated memory.
  This needs casts between incompatible structs, which COMP2521 programs
  rarely use.
- **A struct whose first field is a struct** shares its address with that
  field, and the recorder remembers one struct per address. So after
  `inner = &outer->first; outer = NULL;`, only the inner struct is shown
  there from then on, though the outer one is still allocated. Remembering
  every struct at an address (or preferring the outer one) would fix it.
- **The e2e test "landing page leads to the feedback form" is flaky.** It
  failed once in CI (#40) and passed on a rerun. The screenshot showed the
  page still on the landing page after the click: the GitHub card above the
  footer loads late and moves the "Provide Feedback" link. The test came
  from `dev` unchanged.
- **Names left from the old server debugger, in files with other work in
  progress:** the misspelled `Component/Visualizer/Visulizer/` folder,
  `VisualizerState` (it's a component's props), the `frontendStateStore.ts`
  file and `useFrontendStateStore` (a step timeline), and the `useCursor.ts`
  file and hook (it handles console input). The file tree's `IFileSystem`
  names (`IFileFileNode`, `doesDirExists`) predate the rewrite. The console
  also prints a made-up `gcc -g …` line, though programs are compiled with
  clang.
- **The console caret's blink timer** in `useCursor.ts` is a plain `let`,
  so it's recreated on every render and `clearTimeout` never cancels the
  previous timer. This predates the rewrite.
- **Offline, a run cut short breaks the next one.** Once the page has
  loaded, the debugger works offline, because runs reuse a runner Worker
  started while the network was on. A Worker stopped mid-run (past the time
  limit in a C library call, Ctrl+C, or compiling again while a program
  runs) is thrown away, and its replacement can't fetch its script offline,
  so the next run fails until the network is back. Caching the script, for
  example with a service worker, would fix it.
- **Private windows** download the largest compiler file again on each visit,
  because the browser caps how big a single cached file can be there. A Cache
  Storage fallback would fix it.
- **The console** draws every character as its own element, so very long
  output still stalls the page for about 0.3 s. This predates the rewrite.
- **Exit codes** aren't masked to 0–255, so `exit(-1)` reports -1, where
  Linux reports 255.
- **Crash messages** show the engine's raw text, for example "unreachable",
  which isn't written for users.
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
- **Pointers are 4 bytes** on wasm and 8 on the machines users run C on, so
  `sizeof(int *)` and addresses look different.
- **A NULL dereference of a far field** isn't caught: the check tests the
  address plus the field's offset against 1024, so `p->value` with
  `p == NULL` gets through when `value` is 1024 or more bytes into its
  struct. clang reads globals as address 0 plus an offset, so the base alone
  can't be checked.
- **Replays with `time()` or `rand()`** seeded from the clock can run
  differently each time typed input re-records the program, so stepping
  may not carry on from quite the same place.
