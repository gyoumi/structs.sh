---
name: modernize
description: Bring a stale PR up to date. Decide MODERNIZE, REWORK, or CLOSE from evidence, then rebase onto origin/dev only for MODERNIZE. Use for /modernize, "modernize this PR", or rebasing an old PR.
argument-hint: <pr-number-or-url>
disable-model-invocation: true
---

# Modernize PR

Adapted from [tstack `modernize`](https://github.com/t3dotgg/tstack/blob/main/skills/modernize/SKILL.md).

Modernize the idea, not just the branch. A clean rebase does not prove the PR still belongs in the product.

## Guardrails

- Run `git fetch origin` first so the PR head, `origin/dev`, and related branches are current.
- Existing changes in the current checkout belong to the user. Do all rebase work in a disposable worktree, `../structs-modernize-<pr>` (outside the repo, so it never shows up as untracked files), created at the recorded PR head. Never rebase in the current checkout.
- `/modernize` authorizes rebasing and updating the PR branch only. It does not authorize merging, closing, retargeting, or widening the PR.
- Push only with `--force-with-lease=<branch>:<recorded head sha>`. Never use bare `--force`.
- Do not comment on the PR unless the user asks.
- PRs from forks: you can only push if the author allowed maintainer edits. Otherwise stop after the disposition and report it.

## 1. Establish the PR's intent

```bash
gh pr view <n> --json url,state,baseRefName,headRefName,headRepositoryOwner,headRefOid,author,reviewDecision,statusCheckRollup,title,body,closingIssuesReferences
gh pr diff <n>
```

Read the review threads and commits too. Record the URL, base, head branch, head SHA, author, checks, and review state. Record the merge base with `git merge-base <head sha> origin/<base>`.

Write the smallest coherent goal the PR was trying to reach in one or two sentences before judging the code. Use the linked issue if there is one.

Done when those facts and the goal are written down.

## 2. Check what changed around it

Read `git log <merge-base>..origin/<base>` and the diff for the paths the PR touches. Search for replacements with `gh pr list --state all --search "<keywords>"`.

Answer each question with one line of evidence:

- Has the same user-facing problem already been solved?
- Did APIs, types, socket events, or folder structure change?
- Does `dev` now own the same behaviour in a different place?
- Was the code the PR changes deleted, moved, or simplified on purpose?
- Would landing it bring back old behaviour or create two ways to do the same thing?
- Is the benefit still worth the maintenance cost?

Git reporting no conflicts is not evidence that the PR is current.

Done when every question has an answer and evidence.

## 3. Choose a disposition

- **MODERNIZE**: the goal is still useful and the implementation is still the right shape. Rebase, resolve, check, and push.
- **REWORK**: the goal is still useful, but a mechanical rebase keeps the wrong implementation. Describe the smallest credible rewrite and stop, unless the user also asked for the rework.
- **CLOSE**: the PR is superseded, obsolete, wrong in direction, or no longer worth the cost. Cite the evidence and stop. Do not close the PR without explicit permission.

Age alone is not evidence. Sunk effort is not a reason to keep a PR.

Check the decision with one `sol-loop` round, step `modernize`. The brief gives the goal, the answers from step 2, and the proposed disposition, and asks Sol to agree or name a better disposition with evidence. `APPROVE` or `APPROVE WITH NITS` means Sol agrees. If you still disagree after two replies, show both sides in two or three lines and let the user decide.

Present the disposition, the evidence, and Sol's verdict to the user. For MODERNIZE, continue unless the user objects; for REWORK or CLOSE, stop here.

## 4. Rebase without losing intent

MODERNIZE only:

1. `git worktree add -b modernize/<pr> ../structs-modernize-<pr> <head sha>`, then `git rebase origin/<base>` inside it. Done when the rebase finished or stopped on conflicts.
2. For each conflict, have a `sonnet` worker (see `orchestrate-defaults`) edit only the conflicted files it is given. Find the intent of both sides from the commit messages, the PR, and the issue. Keep both intents where possible. If they are incompatible, keep `dev`'s behaviour unless the PR's goal requires otherwise, and note the trade-off. If a conflict shows a product or design disagreement, stop, leave the rebase in progress, and go back to step 3 with the new evidence. Never run `git rebase --abort` without the user's OK.
3. Compare before and after: `git range-diff <merge-base>..<head sha> origin/<base>..HEAD`, then read the final diff. Confirm intended behaviour did not disappear and behaviour already on `dev` did not return. Done when both are confirmed or a gap is listed.
4. Run `pnpm check:changed` from the repo root. Separate real failures from failures that already exist on `origin/<base>`.
5. Run a second `sol-loop` round, step `modernize`, with the range-diff, the final diff command, and the check results. A blocker or should stops the push.
6. Push: `git push --force-with-lease=<headRefName>:<head sha> origin HEAD:<headRefName>`. If the lease fails, someone else pushed; fetch and go back to step 1. Never overwrite new work. After a successful push, remove the worktree with `git worktree remove ../structs-modernize-<pr>`. Done when `gh pr view <n>` shows the new head SHA.

Do not merge the PR.

## Report

Lead with MODERNIZE, REWORK, or CLOSE and the reason in one sentence. Then:

- meaningful changes on the base branch;
- conflicts in intent found, or that there were none;
- the rebase and push result, with old and new head SHA;
- checks run and their results;
- Sol's verdict for each round;
- what is left to decide or do, with a link to the PR.

Separate observed facts from judgment. Say what could not be verified.
