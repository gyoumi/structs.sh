---
name: branch-review-loop
description: Review the whole branch with GPT-6.1 Sol High through sol-loop, on two axes (repo standards and the issue's spec), with sonnet workers applying the agreed fixes until Sol approves. Use for /branch-review-loop.
argument-hint: (optional PR number or "pull latest")
---

# Branch review loop

Extends `review-branch` with a reviewer loop. `review-branch` owns the checklist and checks; this skill sets who reviews, what they check, and what gets applied.

## Defaults

| Step | Who |
|---|---|
| Orchestrator | this session |
| Review and re-review | Sol through `sol-loop`, step `branch` |
| Apply fixes | `sonnet` workers (see `orchestrate-defaults`) |
| Stop | Sol returns `APPROVE` or `APPROVE WITH NITS` |

## Two axes

The reviewer reports two axes separately. Do not merge them into one ranked list.

1. **Standards**: does the diff follow this repo's conventions and the `review-branch` checklist? Cite the rule for each finding.
2. **Spec**: does the diff match the originating issue (`gh issue view <n>`) or plan file (`.tickets/<T>.md`)? Flag missing requirements and behaviour the issue did not ask for.

## Lead judgment

After each review, before anything is applied, the orchestrator buckets every finding:

- **Act on**: goes to a `sonnet` worker.
- **Consider**: valid but out of scope. Record it as a follow-up; do not expand this branch to include it.
- **Noted**: a low-value nit. Record the reason for leaving it unchanged.
- **Dismissed**: speculative generality, extra edge states, frozen contracts, or state machines nobody asked for. Record the evidence and leave it unchanged.

The invocation authorizes the orchestrator to apply valid, in-scope findings and finish the review loop without asking the user to approve a plan or each fix. Do not stop after presenting findings. Ask only when a decision would materially change behavior or scope, a required permission is unavailable, or the findings remain disputed after the Sol loop's retry budget. Report considered, noted, and dismissed findings at the end.

## Flow

1. If a PR is named, confirm the checkout is that PR's head branch (`gh pr view <n> --json headRefName,headRepositoryOwner`). If it is not, run `gh pr checkout <n>` or use a separate worktree before anything else. Then fetch the target base (`origin/dev`, or `upstream/dev` when the branch is in a fork) before reviewing. If the base has advanced beyond the branch, rebase onto it whether or not the user explicitly asked. Preserve unrelated work; do not stash or discard it. If the worktree is dirty in a way that makes rebasing unsafe, use a separate worktree or stop and report the blocker. Resolve conflicts before continuing and run checks for the affected files.
2. If a PR is specified or linked to the branch, collect its unresolved review threads, issue comments, checks, head SHA, and review state. Track each comment and its disposition so none are missed.
3. Run `sol-loop` in code mode with step `branch`, the diff from `merge-base HEAD <base>`, and the two axes plus the `review-branch` checklist in the brief's rules.
4. Validate each finding against the code, issue, and checklist. Send valid in-scope fixes to workers without waiting for user approval. Decline nits and out-of-scope requests with a recorded reason. If a PR comment is declined, reply with the reason before resolving its thread. Resolve each PR thread after its fix or reasoned disposition; do not resolve findings that are still open or disputed.
5. After fixes, run the checks for the changed areas. If any behavior code changed, run another Sol round on the changed code and open findings. Repeat within `sol-loop`'s budget.
6. When Sol approves the current diff, run the `review-branch` checks on the final tree. For a PR-backed loop, commit and push fixes when the user asked to complete the PR review. After each push, request a fresh Copilot review and wait for its result and required checks before continuing. Handle new findings the same way. Stop when a review cycle needs no further commit, or report a blocked check or unresolved disagreement.
7. Merge only when the user asked to take the PR through merge. Before merging, confirm with `gh pr checks <n>` that the CI workflows (at least `e2e`) have run on the current head SHA and passed. "No checks reported" or a pending check is not a pass. Actions can start late during GitHub incidents, so keep watching the PR until the checks finish. Then merge and report the merge commit. Otherwise leave the PR open and report its state.

## Hard stops

- Never apply findings before the review returns.
- Workers never run git writes.
- Do not ask for approval for ordinary in-scope fixes. Do not merge unless the user asked.
