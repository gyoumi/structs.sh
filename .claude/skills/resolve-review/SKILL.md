---
name: resolve-review
description: Work through review comments on a PR (CodeRabbit or human). Fetch every comment, decide apply, apply-partial, or skip with a reason, present a plan, then fix one item at a time. Use for /resolve-review, a PR URL with review comments, or "address the review".
argument-hint: <pr-number-or-url>
---

# Resolve review

Default flow:

1. Fetch comments and build the plan.
2. Present the plan and stop.
3. After approval, apply one item at a time.
4. After each item, stop and wait before committing, pushing, replying on GitHub, or starting the next item.

Skip the stops only when the user says to work through everything.

## 1. Fetch

```bash
gh pr view <n> --json number,url,headRefName,baseRefName,reviews,reviewDecision
gh api repos/{owner}/{repo}/pulls/<n>/comments --paginate
gh api repos/{owner}/{repo}/issues/<n>/comments --paginate
```

For each comment, record its id, path, line, author, body, and whether it is already resolved or outdated.

Record whether the comment has a committable suggestion: a body containing a fenced block tagged `suggestion`, which GitHub renders with a "Commit suggestion" button. CodeRabbit puts some fixes in a collapsed "Committable suggestion" section and others in a "Prompt for AI agents" section. Read both.

Confirm the local branch is the PR head. If you are on a different branch, check out the PR head with `gh pr checkout <n>` or use a worktree. Do not mix trees.

## 2. Evaluate

Judge each comment on correctness, fit with this repo's conventions, risk, and value. Write a one-line reason for every verdict. Be conservative with visual CSS or layout suggestions, and with CodeRabbit nitpicks that add abstraction without fixing a real failure.

| Verdict | When |
|---|---|
| `apply` | Valid and worth doing |
| `apply-partial` | Partly valid; say which part |
| `skip` | Wrong, too risky, against convention, or low value |

Severity: `Critical`, `High`, `Medium`, `Low`.

## 3. Plan

Give each item an id (`R1`, `R2`, ...) and put it in a table:

| ID | File:line | Author | Summary | Verdict | Severity | Apply method | Verification |
|---|---|---|---|---|---|---|---|

The apply method is one of:

- **Commit suggestion**: only when a committable suggestion exists and you agree with it verbatim. The user clicks the button on GitHub; you do not edit the file.
- **Apply**: everything else, including `apply-partial` and suggestions you would change.

List skipped items separately with their reasons. Group related items into phases when they touch the same concern. Present the plan and stop.

## 4. Execute

For each approved item:

- **Commit suggestion**: show the suggestion, ask the user to click "Commit suggestion" on the linked comment, and wait. After they confirm, `git pull` and run the item's verification.
- **Apply**: make the edit, run the item's verification (the checks in `review-branch` step 4), and present the result.

Stop after each item unless the user opted into batch mode. In batch mode, a whole phase may become one commit.

## 5. Complete

When all items are done and the user approves:

- Commit with a conventional commit message only if the user asked. The commit-msg hook runs commitlint.
- Reply on the PR only if the user asked. The reply lists applied items (file, line, result), skipped items with reasons, and commit SHAs.

## Notes

CodeRabbit auto-review is configured in `.coderabbit.yaml`. If it is not reviewing PRs into `dev`, check its `base_branches` list. Ask for a fresh review by commenting `@coderabbitai review` only when the user wants one.
