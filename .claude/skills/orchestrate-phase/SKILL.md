---
name: orchestrate-phase
description: Orchestrate one or more phases of a planned ticket - parallel sonnet workers implement, an opus reviewer loops with them until approval, then checks and a visual or e2e verify. Use for /develop phase N of ticket T, /orchestrate-phase, or "you are the orchestrator".
argument-hint: phase <N> of ticket <T>  |  phases <N>, <M> of ticket <T>
---

# Orchestrate phase

Models, spawn rules, and the orchestrator contract live in `orchestrate-defaults`. Read it before the first spawn. Do not copy it here.

## Parse the request

1. Collect every phase number from `phase N` or `phases N, M, and K`.
2. Resolve the plan in this order: an explicit path, else `.tickets/<T>.md`. If there is no plan file, stop and suggest `/plan-ticket <T>`.
3. Resolve the worktree that owns the code before the first spawn. Use `git worktree list`, branch names, and the files the plan names. Name the worktree in the first progress note and spawn workers only there.

## Role

This session is the orchestrator, whatever model it runs on. It spawns and coordinates. It does not implement, edit product files, or run the tests itself.

If several phases run in parallel, give each phase its own intermediate orchestrator (`opus`, per `orchestrate-defaults`). Those stay orchestration-only. Tell each about its sibling phases and their file ownership.

## Small fix lane

Use this lane when all are true:

- One phase or one bug.
- The cause is already known (an investigation, a failing e2e, or a clear spec gap).
- About 10 product files or fewer, in one area (`client/`, `debugger/`, or `e2e/`).

In this lane:

- Spawn one `sonnet` worker directly. No intermediate orchestrator.
- One `opus` review. On NEEDS_FIX, a `sonnet` worker applies the Act-on items and the reviewer checks only that delta.
- Cap at two review rounds. Consider and Noted findings go in the final report as follow-ups.

## Flow

1. **Resolve** the plan and phases. Confirm the branch matches the ticket when that is obvious.
2. **Split** independent file slices. Spawn all workers in one message, each with the files it owns. Serialize only on a real file-ownership conflict. See `agent-mistakes-orchestration`, "One live worker per file".
3. **Review loop.** After edits, spawn the `opus` phase reviewer (read-only) with the phase goal, the plan section, and the diff. The orchestrator buckets findings; a `sonnet` worker applies Act-on items; the reviewer re-checks only the delta. Repeat until APPROVE. Cap about 3 rounds. Wait for every named reviewer before applying anything.
4. **Checks.** A `sonnet` checks worker runs the `review-branch` checks for the touched areas: client `tsc`, `lint`, `build`; debugger pytest; the e2e suite with the debugger running. Green before verify.
5. **Verify.** For UI or animation changes, run `ui-visual-test` on the affected screens. For debugger behaviour, the matching e2e behaviour must pass or be on `e2e/known-failures.json` with a reason. Always verify, even for small phases.
6. **Report** done with evidence: checks run and results, screenshots or e2e summary, reviewer verdict, and follow-ups. Tick the phase's checkboxes in the plan file.

## Also reach for

- `how` before implementing, if the plan does not explain the area.
- `blast-radius` when the change touches shared visualiser code, the socket protocol, or the debugger's gdb handling.
- `diagnose` on a hard bug mid-phase, before more feature code.
- Behaviour fixes start with one failing test at a public seam (an e2e behaviour or a pytest). When the defect came from the user, the first failing test checks exactly what they saw.
- A new defect reported while a worker is running on the same files: do not spawn a second worker on those files. Wait, then resume the worker with the new item or put it in the next worker's prompt.

## Hard stops

- No product work by the orchestrator or an intermediate orchestrator.
- Environment failures (debugger container down, missing dependency) are not skippable. Fix them, or stop after two identical failures and report.
- No sleep-poll loops. Rely on subagent completion notifications.
- Do not claim a review, check, screenshot, or e2e run that did not happen.
