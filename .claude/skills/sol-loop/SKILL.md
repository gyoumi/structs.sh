---
name: sol-loop
description: Review a change with GPT-6.1 Sol High in a bounded loop and apply the smallest fixes. Use for /sol-loop or "sol loop", and as the review loop that branch-review-loop and plan-ticket run. Claude Code and Codex are the default runtimes; Cursor or Copilot only when the user names them.
argument-hint: (optional PR number, paths, or "with copilot" / "with cursor")
---

# Sol loop

Adapted from [tstack `sol-loop`](https://github.com/t3dotgg/tstack/blob/main/skills/sol-loop/SKILL.md).

Make the smallest changes that satisfy the reviewer. Watch for scope creep and push back with evidence.

## Runtimes

Defaults: **Claude Code** runs the loop (orchestrator, fixers, checks) and **Codex** runs the reviewer. When this skill runs inside Codex instead, Codex orchestrates and fixes, and the reviewer is still a separate read-only `codex exec` process.

Use **Copilot** or **Cursor** only when the user names it ("sol-loop with copilot", "review it in cursor"). Never switch to them on your own, including when Codex fails.

| Reviewer runtime | When | Model and effort |
|---|---|---|
| Codex | Default | `gpt-6.1-sol`, reasoning effort `high` |
| Claude Code | User asks for a Claude reviewer, or chooses it after Codex is unavailable | `opus`, effort `high` |
| Copilot | Only if the user names it | `gpt-6.1-sol`, reasoning effort `high` |
| Cursor | Only if the user names it | the Sol model the user names, effort high or below |

Effort never goes above `high` on any runtime.

## Roles

| Role | Runs on | Responsibility |
|---|---|---|
| Orchestrator | this session | Scopes the change, runs the reviewer, judges every finding, keeps the ledger. No product edits. Git writes only if the user asked. |
| Reviewer | the reviewer runtime above | One reviewer per round. Read-only. Never starts subagents. |
| Fixer, code mode | `sonnet` worker (see `orchestrate-defaults`) | Edits only its exclusive file list. |
| Fixer, plan mode | the `plan-ticket` planner, resumed | Edits the plan file. |
| Checks | a `sonnet` worker | Runs the covering checks from `review-branch`. |

## Modes

| Mode | Scope |
|---|---|
| Code (default; `/sol-loop`, `/branch-review-loop`) | The diff from base to the working tree. |
| Plan (`plan-ticket`) | The plan file. Rules are `orchestrate-defaults` "Simplicity first". No diff or checks. Findings cite `plan path:line`. |

## Budget

- Default 3 rounds. Round 1 is full. Later rounds check only changed code and open findings.
- Extend to 5 only for security, data loss, sandboxing of user C code, or concurrency, while a blocker or should stays open with evidence, or when the user asks.
- Stop early when a round returns only nits. Declined nits and comment, doc, or format-only fixes need no new round.
- One reviewer per round. Never start a second while one runs.
- Keep a ledger at `.tickets/tmp/<ticket-or-branch>/sol-loop/ledger.txt`. Header: mode, worktree, base SHA, paths, diff command, intent, out of scope, check results, reviewer runtime and model. One row per finding: id, severity, round, outcome (`fixed`, `disagree`, `declined`, `open`), evidence.

## 1. Scope

Code mode:

1. In the worktree that owns the change, run `git status --short`. Do not stash, discard, or include unrelated changes. Limit review to the change's paths when they separate cleanly; otherwise stop and ask.
2. `git fetch` the base's remote, then find the base:
   - PR: `gh pr view <n> --json baseRefName,headRefOid`. Work in the PR branch's tree. Base: `git merge-base HEAD origin/<baseRefName>`.
   - Local branch: `git merge-base HEAD origin/dev`. In a fork, use the remote the PR will target (`upstream/dev` when it goes to the original repo).
3. The change is base to working tree in those paths, plus untracked files. Use one diff command for every round: `git diff <base> -- <paths>`.
4. State intent and out of scope in one or two sentences, from the issue when there is one.
5. Have a checks worker run the covering checks before round 1. Put missing or already-failing checks in the brief.

Done when the ledger header is filled in.

## 2. Run the reviewer

Write the brief to `.tickets/tmp/<ticket-or-branch>/sol-loop/<step>-r<N>.prompt.txt`, where `step` is `branch`, `plan`, `babysit`, `modernize`, `blast-radius`, or `sol`:

```text
Review only. Do not edit or create files, commit, push, comment on GitHub, or start subagents.
Repo: <abs worktree path>  Base: <sha>  Intent: <intent>  Out of scope: <scope>  Checks: <results>
See: <diff command>; git status --short (read untracked files).
Rules: <mode rules>
Read surrounding code. Find bugs, broken callers, and mismatch with intent. Skip style unless it hides a bug. Hold to the smallest change. Flag code, tests, or guards the intent does not need. Other paths, rare cases, small perf, extra compat: nits.
blocker = intended case wrong. should = real bug callers will hit, in intent. nit = the rest.
Reply with findings, then the verdict as the last line:
S1 [blocker|should|nit] <file>:<line> <claim>. Fix: <suggestion>   (keep ids stable across rounds)
VERDICT: APPROVE | APPROVE WITH NITS | REQUEST CHANGES
```

Plan mode replaces `Base` and `See` with `Plan: <path>`. Later rounds add the ledger and the change since the last round.

Run the reviewer from the worktree root, in the background, writing to `<step>-r<N>.out.txt`. Do not edit scoped files while it runs.

**Codex (default).** `codex` is not on every machine. Run `codex exec --help` first and adjust the flags if they differ:

```bash
codex exec -C "<worktree>" -m gpt-6.1-sol -c model_reasoning_effort=high \
  -s read-only -o "<out.txt>" "$(cat <prompt.txt>)"
```

**Claude Code.** Inside a Claude Code session, spawn one read-only `general-purpose` subagent with `model: opus` and the brief as its prompt. From Codex or a shell:

```bash
claude -p "$(cat <prompt.txt>)" --model opus --effort high --permission-mode plan \
  --disallowedTools "Edit Write NotebookEdit" > "<out.txt>" 2>&1
```

**Copilot (only if named).**

```bash
copilot -p "$(cat <prompt.txt>)" --model gpt-6.1-sol --reasoning-effort high \
  --allow-all-tools --deny-tool='write' \
  --deny-tool='shell(git add)' --deny-tool='shell(git commit)' --deny-tool='shell(git push)' \
  --deny-tool='shell(git reset)' --deny-tool='shell(git rebase)' --deny-tool='shell(git checkout)' \
  --deny-tool='shell(git stash)' --deny-tool='shell(git merge)' \
  --excluded-tools task --no-ask-user -s > "<out.txt>" 2>&1
```

**Cursor (only if named).** Use the Cursor CLI in print mode with the named model and a read-only or plan mode. Check `cursor-agent --help` (or `agent --help`) for the flags on this machine before running.

Read the output. The verdict is the last `VERDICT:` line; the `S<n>` findings are above it. `REQUEST CHANGES` means a blocker or should is open. A non-zero exit, an auth or quota error, an unknown-model error, or no `VERDICT:` line is not approval: report the command and error, and ask the user whether to retry, switch to the other default runtime, or stop. Stop after two identical failures.

Done when the round's verdict and findings are in the ledger.

## 3. Answer findings

Check each finding and its severity by reading the cited code. Another path, a rare case, or a small cost is a nit whatever label it came with.

- Agree: **Act on**. Smallest fix. Prefer deleting or narrowing over adding a lock, cache, helper, or option. Add one focused test that fails without the fix when the intent needs it. Send it to the fixer with exclusive files.
- Disagree: **Dismissed**, with one line of evidence (file, line, test, or output). Show these to the user.
- Out of scope or a nit: **Noted**. Decline in one line and list as a follow-up.

After fixes, the checks worker reruns the covering checks and the orchestrator runs `git diff --shortstat <base>`. If review grew the diff, have the fixer cut first. Never agree just to end the loop.

Done when every finding in the round has an outcome in the ledger.

## 4. Next round

Start one only when budget remains and a blocker or should is open, behaviour code changed, or the last `APPROVE` does not cover the current diff. The brief carries the round 1 brief, the ledger, the same diff command, and the change since the last round. Tell the reviewer to check open ids and changed code only, marking each old id `resolved` or `still open: <reason>`.

## 5. Stop and ship

- **Agreed:** `APPROVE` or `APPROVE WITH NITS` on the current diff, no blocker or should open, no concern from the orchestrator.
- **Stuck:** an item stays disputed after two replies, or the budget ends. Show both sides in two or three lines each and let the user decide. Budget end is not approval.
- Do not push during the loop. After agreement, push only if the user asked. If the user asks for a PR body note, add: `Reviewed with sol-loop: <N> rounds, <model> on <effort> via <runtime>. Verdict: approved`.
- Report rounds, runtime, model and effort, what changed, diff size before and after, fixed and declined findings with reasons, and whether anything was pushed.

## Hard stops

- The reviewer never edits, commits, pushes, comments on GitHub, or starts subagents.
- The orchestrator never edits product files during the loop.
- Budget end, a timeout, or a missing verdict is never approval.
- Never use Copilot or Cursor unless the user named them.
