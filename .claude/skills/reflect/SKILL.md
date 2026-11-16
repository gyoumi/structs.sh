---
name: reflect
description: Mine a finished session for durable lessons and propose edits to existing skills or CLAUDE.md, then wait for approval. Use for "reflect" or /reflect, after a long task that ended with a reusable recipe, after the user corrected the approach, or after a dead end followed by a working path that will recur.
argument-hint: (optional focus)
---

# Reflect

Turn what happened in this session into small, durable edits, only with the user's approval.

## 1. Collect

Go through the session and list candidate lessons. For each, note the evidence: the command, error, correction, or file. Look for:

- User corrections of the approach.
- Commands or flags that failed before the right one worked.
- Dead ends that cost real time and will recur.
- Repo facts that were hard to find (ports, setup steps, test commands, quirks of the gdb backend or the e2e suite).

For a long session, spawn two read-only reviewers in one message (models from `orchestrate-defaults`) and merge their lists:

| Lens | Model | Question |
|---|---|---|
| Judgment | `opus` | Was the call wrong, or just unlucky? Would the lesson change a future decision? |
| Tooling | `sonnet` | Was a command, flag, or tool sequence the real problem? What is the non-obvious reading? |

Each returns lessons with evidence pointers. Reviewers propose; they do not edit.

## 2. Sort

Put every candidate in one bucket:

- **Accept**: a durable lesson with a clear home.
- **Reject**: one-off, already covered, or not backed by evidence. Give a one-line reason.
- **Backlog**: a real lesson whose right fix is a script, lint rule, test, or CI check rather than more prose. List it as backlog if you cannot build that check now.

Present the full table to the user and wait for explicit approval before any edit.

## 3. Route to an existing home

Put each approved lesson where it will be read:

| Lesson about | Home |
|---|---|
| A workflow a skill already covers | That skill in `.claude/skills/<name>/SKILL.md` |
| A repo-wide fact or rule | `CLAUDE.md` at the repo root |
| Running the e2e suite or writing e2e tests | `e2e/README.md` |
| Contributor setup | `docs/docs/contributing.md` |

Prefer a one-line edit to an existing file over a new file. Create a new skill only if the user asks, or no existing home fits and the user approves the new file. Write the edit following `unslop`.

## Hard stops

- No edits before the user approves the table.
- Do not log one-off mistakes as rules.
