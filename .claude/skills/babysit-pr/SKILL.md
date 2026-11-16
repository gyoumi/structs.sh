---
name: babysit-pr
description: Run one cycle of keeping an open PR merge-ready - read new review comments and CI results, fix what is valid, rebase onto origin/dev if it moved, and report. Use for /babysit-pr or "babysit this PR".
argument-hint: <pr-number-or-url>
disable-model-invocation: true
---

# Babysit PR

One bounded cycle: check reviews and CI, fix, update the branch, report. Run it again for another cycle. Do not start sleep loops or background pollers.

## Cycle

1. **Find the PR and its tree.** `gh pr view <n> --json url,headRefName,baseRefName,headRefOid,mergeable,reviewDecision`. If the current checkout is on another branch or has unrelated changes, use a worktree for the PR head (`git worktree add ../structs-pr-<n> <headRefName>`). Do not mix trees. Done when you are working in the PR's tree.
2. **Collect work.** Read unresolved review threads (`gh api repos/{owner}/{repo}/pulls/<n>/comments --paginate`) and checks (`gh pr checks <n>`, then `gh run view <run-id> --log-failed` for failures). Done when you have a list of open threads and failing checks.
3. **Classify CI failures.** Real failure, flaky (passes on rerun and unrelated to the diff), or already failing on `origin/dev`. Only fix real failures. Rerun flaky ones once with `gh run rerun <run-id> --failed`.
4. **Fix review comments.** Follow `resolve-review` for deciding apply or skip. For a short cycle the user asked to run through, apply the clear `apply` items directly and list the rest.
5. **Rebase if `dev` moved.** `git fetch origin dev`; if `git merge-base --is-ancestor origin/dev HEAD` fails, rebase onto `origin/dev`. See "Conflicts" below.
6. **Verify.** Run the checks for the touched areas (see `review-branch`). Done when they pass, or the remaining failure is reported.
7. **Push, if the user asked for pushes in this babysit.** Use `git push` for new commits, or `git push --force-with-lease` after a rebase. Never bare `--force`.
8. **Report.** What changed this cycle, what passed, what is still open. If nothing changed, say so in one line.

## Conflicts

1. List the conflicting files.
2. For each hunk, find the intent from the commit message, PR, or issue. Keep both intents where possible. If they are incompatible, keep `dev`'s behaviour unless the PR requires the change, and note the trade-off. Do not invent new behaviour.
3. Always resolve. Never run `git rebase --abort` or `git merge --abort` unless the user asks.
4. After resolving, run the checks for the touched areas before continuing the rebase.

## Hard stops

- No sleep loops, `gh ... --watch`, or promises to check again later.
- Do not merge, close, or retarget the PR.
- If the same step fails twice the same way, stop and report an alternative.
