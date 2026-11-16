---
name: orchestrate-defaults
description: Model roles, spawn rules, and the orchestrator contract shared by develop, orchestrate-phase, plan-ticket, sol-loop, branch-review-loop, babysit-pr, and eval. Read before spawning any subagent or worker, or when choosing a model for a role.
user-invocable: false
---

# Orchestrate defaults

The one place that says which Claude model does which job. Change a model by editing the table below; the other skills point here instead of naming models.

## Short prompts are enough

These mean the full contract. The user does not need to restate models, review loops, or parallelism:

- `/develop phase <N> of ticket <T>`, `/develop phases <N>, <M> of ticket <T>`, `/orchestrate-phase ...`: follow `orchestrate-phase`.
- `/plan-ticket <T>`: follow `plan-ticket`.
- `/sol-loop`, `/branch-review-loop`: follow those skills.

`<T>` is a GitHub issue number (`323` or `#323`) or a path to a plan file. Plan files live in `.tickets/<T>.md`, which is gitignored.

## Roles

| Role | Model (Agent tool `model`) | Agent type |
|---|---|---|
| Orchestrator | this session, any model | n/a |
| Intermediate orchestrator for one of several parallel phases | `opus` | `general-purpose` |
| Implementer, review-fix applier, conflict fixer, babysit fixes, checks runner | `sonnet` | `general-purpose` |
| Planner and plan-file writer | `sonnet` | `general-purpose` |
| Griller | `opus` | `general-purpose`, read-only |
| Phase reviewer (`orchestrate-phase`) | `opus` | `general-purpose`, read-only |
| Plan reviewer, branch reviewer | Sol, through `sol-loop` | see `sol-loop` |
| Read-only critics and judges (`how` critique, `eval` judge, `reflect`) | `sonnet` | `general-purpose`, read-only |
| Read-only lookups (inventory files, summarise logs, find callers) | `haiku` or `sonnet` | `Explore` |

The phase reviewer is a different model from the implementer on purpose, so the review does not share the implementer's blind spots.

## Spawn rules

- Always pass `model` on every Agent tool call for these roles. Do not rely on inheriting the parent's model.
- High is the ceiling. Never run a spawned session or CLI reviewer with effort `xhigh` or `max`, and never use 1M-context model variants unless the user asks.
- `haiku` is for read-only lookups only. It never edits files and never reviews.
- A user-named model wins (for example "use opus for the workers"). A user-named effort above high does not.
- If a model the table or the user names is unavailable, say so and stop. Do not quietly substitute another model.
- Read-only roles are told in their prompt: do not edit or create files, commit, push, or comment on GitHub.

## Contract

1. **Orchestrator.** This session coordinates. It reads, plans, spawns, judges findings, and reports. It does not edit product files itself once workers are in play.
2. **Workers.** Each worker prompt lists the files it owns. Parallel workers own disjoint files. Spawn all independent workers in one message. Serialize only on a real file-ownership conflict.
3. **Git writes.** Commit, push, and rebase happen only when the user asked, and only from the orchestrator, never from parallel workers. Follow `git-clean-commit`.
4. **Review loops.** The orchestrator buckets every finding as Act on, Consider, Noted, or Dismissed. Fixers apply Act-on items only. Cap about 3 rounds. Show Dismissed items to the user so they can override.
5. **Wait for every named reviewer** before applying any findings.
6. **Waiting.** Rely on the subagent completion notification. Do not poll with sleep loops or `--watch`.

## Simplicity first

Applies to planning, grilling, plan files, review loops, and design debates. Remind planner and reviewer subagents of it in their prompt.

- Prefer the smallest design that meets the stated goal.
- Do not add edge states, speculative phases, frozen contracts, or state machines unless the user asked or a concrete current failure needs them.
- When folding reviewer feedback, shrink it. Do not accumulate every suggestion.
- Prefer deletion and the smallest change that solves the problem. Collapse one-caller wrappers.

## Skill map

| Invoke | Skill |
|---|---|
| `/develop`, `/orchestrate-phase` | `orchestrate-phase` |
| `/plan-ticket` | `plan-ticket` |
| `/sol-loop` | `sol-loop` |
| `/branch-review-loop` | `branch-review-loop` |
| `/babysit-pr` | `babysit-pr` |
| `/modernize` | `modernize` |
| `/eval` | `eval` |
| Orchestration lessons | `agent-mistakes-orchestration` |
