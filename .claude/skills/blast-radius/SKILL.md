---
name: blast-radius
description: Check what a change could break before trusting it, and say honestly how far the check got. Use for "blast radius", "what could this break", a small diff you do not trust, or before merging a change to the debugger's compiler, instrumenter or recorder, or shared visualiser code.
argument-hint: <change, diff, or PR to check>
---

# Blast radius

Find the one fact that makes the change safe, and prove it with the narrowest useful check.

## 1. Find the callers

List everything that depends on what changed:

- Grep for every caller of a changed function, export, constant, CSS class, or recording field.
- For shared visualiser code (`client/src/visualiser-src/common/`), list each visualiser that imports it.
- For the debugger, follow a value from the instrumenter (`instrumenter/src/`) through the recorder (`client/src/Services/debugger/wasm/`) to the components that read it.
- For a changed default or constant, list every place that relied on the old value.

## 2. Pick the risky case

Name the one input or path most likely to break. Prefer a concrete case ("deleting the head of a one-node linked list") over a category ("edge cases").

## 3. Prove it

Run the narrowest check that fails if you are wrong:

| Change | Narrowest proof |
|---|---|
| Visual debugger behaviour | The matching e2e test, `pnpm run e2e -g "<behaviour>"` with the debugger running |
| Debugger instrumenter | `cargo test` in `instrumenter/` |
| Client logic (parsers, stores, the rewrite's compiler, runner, recorder) | The matching Vitest file, `cd client && pnpm test <file>` |
| Visualiser animation or layout | A screenshot of the risky case (see `ui-visual-test`) |
| Types or exports | `cd client && pnpm run tsc` |

For a wide change, you may also run one `sol-loop` round, step `blast-radius`, on the same question.

## Honesty ladder

Report how far you got. Do not round up.

1. You said so. Worthless alone.
2. You pointed at file:line.
3. You walked through the risky case and it cannot happen.
4. You ran a test or script that fails if you are wrong.
5. You reproduced it in the running app.

If you only read code, say level 2 or 3. If a claim stays unproven, write "unproven" next to it.

## Report

Lead with the level reached and the risky case. Then list the callers checked, the command run and its result, and anything left unproven.
