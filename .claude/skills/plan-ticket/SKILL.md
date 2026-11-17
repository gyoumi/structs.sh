---
name: plan-ticket
description: Plan a GitHub issue into a phased plan file. A sonnet planner writes it, Sol reviews it through sol-loop, an opus griller asks the user the open questions, and Sol reviews again. Use for /plan-ticket, "plan ticket N", or "plan #N".
argument-hint: <issue number or plan path>
---

# Plan ticket

A short prompt is enough. Do not make the user restate models, reviewers, grilling, or loop order.

## Role

This session is the orchestrator. It spawns the planner and griller, runs `sol-loop`, buckets findings, and relays grill questions. It writes no plan prose and no product code. Models come from `orchestrate-defaults`.

| Role | Model |
|---|---|
| Planner and plan-file writer | `sonnet`, `general-purpose` |
| Plan reviewer | Sol through `sol-loop`, plan mode |
| Griller | `opus`, read-only |

## Plan file

- Path: `.tickets/<T>.md` (gitignored). Create `.tickets/` if needed.
- Sections: Goal, Requirements, Out of scope, Key decisions, then Phase 1..N. Each phase lists its files, tasks as checkboxes, and a `Verification:` line naming the exact check (an e2e behaviour, a pytest, `pnpm run tsc`, or screenshots of a route).
- UI work puts the first screenshot the user can review early, not in the last phase.
- The planner applies `unslop` and `orchestrate-defaults` "Simplicity first" to everything it writes. No separate writer pass.

## Flow

1. **Read.** The orchestrator reads the issue (`gh issue view <T> --comments`) and any linked PRs. Done when the planner brief has the issue text and relevant file paths.
2. **Plan.** Spawn the `sonnet` planner to write the plan file. Done when the file exists with every section.
3. **Review.** Run `sol-loop` in plan mode with step `plan`. The planner is the fixer: it must apply blockers and shoulds, and may decline nits that fight simplicity. Continue until Sol approves or the stop rule hands the decision to the user.
4. **Grill.** Spawn the `opus` griller, read-only, with the plan path and the `grill-me` skill. It skips that skill's "write the answers into the plan" step, because the planner does that in step 5. It returns exactly one question with options, recommended first, and a one-line reason. The orchestrator asks the user with `AskUserQuestion`, then resumes the same griller with the answer. Repeat while real uncertainty remains. Stop when the user says "stop asking" or similar. Done when there is a decisions list.
5. **Fold.** Resume the planner with the decisions list. Grill decisions are binding. Done when every decision is in the plan.
6. **Re-review.** Run a fresh `sol-loop` in plan mode on the changed plan, budget 3.
7. **Stop for approval.** APPROVE is plan quality only. It is not permission to implement. Ask the user to approve the plan, then point them at `/develop phase 1 of ticket <T>`.

## Hard stops

- No implementation, commits, or pushes from this skill.
- Do not edit the GitHub issue unless the user asks.
