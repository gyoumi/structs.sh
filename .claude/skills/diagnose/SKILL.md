---
name: diagnose
description: Diagnose a bug or unexplained failure by building one command that fails on the exact symptom before guessing at a cause. Use when something is broken, throwing, flaky, or wrong in the visualiser, the debugger, or CI, and the cause is not obvious.
argument-hint: <symptom>
---

# Diagnose

Do not jump from a symptom to a fix. The loop is: reproduce with a failing command, rank hypotheses, confirm one, fix the smallest surface, re-run the same command.

## 1. Build a failing command first

No hypothesis until a failing command exists and you have run it once. Show the command and its output.

The command must drive this bug's code path and check the user's exact symptom. "Ran without crashing" does not count. If the command cannot fail the way the user sees it fail, it is not the loop.

Where failing commands usually live in this repo:

| Area | Command |
|---|---|
| Visual debugger, as a user uses it | A Playwright test in `e2e/tests/` (`pnpm run e2e tests/<file>.spec.ts -g "<name>"` from the repo root). Build the instrumenter first with `pnpm run instrumenter`. |
| Debugger compiler, runner or recorder | A Vitest test next to the code in `client/src/Services/debugger/wasm/` (`cd client && pnpm test <file>`). Build the instrumenter first with `pnpm run instrumenter`. |
| Debugger instrumenter (DWARF, rewriting the wasm) | A `cargo test` in `instrumenter/tests/` (`cd instrumenter && cargo test`). |
| Client types, lint, build | `cd client && pnpm run tsc`, `pnpm run lint`, `pnpm run build` |
| Visualiser animation or layout | A Playwright script that loads the page and screenshots the state; see the `ui-visual-test` skill |

If you cannot reproduce it yet, stop and ask for the missing context: the steps, the C program, the browser, or the CI run link.

## 2. Rank hypotheses

Once the command has failed once, list 3 to 5 ranked hypotheses. Write each as: "If H is the cause, then changing X makes the symptom disappear or get worse."

Prefer the nearest code path that directly controls the failure over broad theories.

## 3. Confirm

- Run the cheapest check that could disprove the top hypothesis: a targeted read, a grep, a narrowed test, or a one-variable change.
- Strip leftover steps from the reproduction until every step matters. If removing a step makes the bug disappear, it stays.
- Change one variable at a time. Tag temporary logs `[DEBUG-xxxx]` so they are easy to find and remove.
- If the check disproves the hypothesis, say so and move to the next one.

Do not edit product code until one hypothesis survives a confirming check.

## 4. Fix

- Where a test seam exists (an e2e behaviour, a Vitest or `cargo test`), make the failing command a committed test before fixing.
- Tests and code come from different agents (`.claude/rules/testing.md`), so the agent that writes the test doesn't write the fix. Hand the fix to an implementer with the confirmed cause, the command that runs the test and its failure output, but not the test file.
- The fix is the smallest change that fixes the confirmed cause.
- Re-run the same command, then any adjacent check you need for confidence.
- If the fix does not turn the command green, stay in this loop. Do not start a separate speculative track.
- Remove every `[DEBUG-xxxx]` line before finishing. CI fails a PR that still has one.

If the same fix attempt fails twice in a row, stop and report what you tried instead of trying a third variation.

## Report

Report each bug in this shape:

- **What you see**: the visible symptom in everyday words.
- **Why**: one short cause. Name the actor (client, compiler, instrumenter, recorder).
- **Next**: the fix, or the one decision you need from the user.

Put file paths and line numbers after the plain explanation, not in the first sentence. State the confirmed hypothesis so it can go in the commit or PR body.

## Hard stops

- Stating a cause before a failing command exists and has been run is a violation.
- Accepting "ran without crashing" as proof is a violation.
