---
name: agent-mistakes-orchestration
description: Lessons from multi-agent orchestration failures - reviewer sequencing, parallel workers, file ownership, and overbuilt plans. Use when spawning workers, running a review loop, planning a ticket, or preparing branch or PR work with subagents.
user-invocable: false
---

# Agent mistakes: orchestration and review loops

Priors from earlier multi-agent work, not blame. Most failures were loop failures (review, implement, weak gate), not one model. Fix the gate, not just the model.

## Wait for every named reviewer before applying

An implementer once applied one reviewer's changes before another named reviewer finished. Wait for every named reviewer to return before any finding is applied.

## Parallelize independent work

Do not push parallelizable tasks through one subagent.

- Spawn all independent workers in one message.
- Do not launch slice B after slice A finishes when the two slices touch different files.
- Serialize only on a real file-ownership conflict, or at the all-reviewers gate above.
- While a long build or test run is going, do other independent work. Do not sit in a sleep loop.
- A one-phase fix should not take hours. Use the small fix lane in `orchestrate-phase`.

Example: CI build failures and review comments with disjoint paths are two or more parallel workers, not one combined worker.

## One live worker per file

Concurrent workers on the same files once overwrote each other and lost many earlier phases of work. The recovery cost more than the fix.

- Each worker prompt names the files it owns. Parallel workers own disjoint files.
- Never spawn a second worker onto files a running worker owns, including for a newly reported bug. Wait for the worker to return, then resume it or queue the bug for the next worker.
- Workers edit with targeted replacements. Never rewrite a whole file from a stale copy unless told to restore it.
- After each worker returns, check `git diff --stat` against the expected files. A file that shrank sharply or went empty is a stop: restore it and report before the next spawn.

## Keep multi-reviewer plans small

Multi-reviewer loops pile up blockers, edge states, and speculative phases. When the user asks for simplicity, simplify hard:

- Fold feedback into the smallest viable plan or phase set.
- Do not add edge states without a concrete current failure.
- Do not freeze contracts or add state machines unless asked.

## Branch and scope hygiene

- New branches come from `dev` (or the user-stated base), not from another feature branch.
- Keep agent-config and skill changes out of product PRs. Put them in their own PR.
- Do not touch out-of-scope files.

## Model-role priors

| Role | Watch for |
|---|---|
| `sonnet` worker | Scope slips; applying the first-finished reviewer's findings early |
| `opus` reviewer | APPROVE treated as permission to ship or merge |
| Sol reviewer | Overbuilt gates in plans; overconfident conclusions |
