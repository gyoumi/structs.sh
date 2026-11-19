---
name: bot-pr
description: Work a bot-created dependency PR (Renovate, or Dependabot if enabled) through checks, local verification, and review to green CI. Use for a Renovate PR URL, "the deps PR", or any PR labelled dependencies.
argument-hint: <pr-number-or-url>
---

# Bot PR

Renovate creates the branch and the PR together, configured by `renovate.json`. Work on that branch. Do not open a replacement PR unless the user asks.

## Rules

- Require a clean working tree before checking out the bot branch. If there are local changes, use a worktree instead.
- Stay on the bot's head branch. Keep the bump unless it is broken.
- Do not expand scope: no drive-by refactors or unrelated pins.
- Do not commit, push, or merge until the user says so in this turn.
- Not done until the required CI checks are green, or the only thing left is a human review.

## 1. Identify

```bash
gh pr view <n> --json author,headRefName,baseRefName,files,labels,reviews,mergeable,statusCheckRollup
```

Note which `renovate.json` rule produced it from its labels: `deps: ci-actions`, `deps: vite`, or `automerge: safe`. Automerge rules mean Renovate may merge the branch itself once checks pass.

## 2. Check out

```bash
gh pr checkout <n>
git diff origin/dev --stat
```

Confirm the diff matches the PR's file list.

## 3. Classify failures

Read failed job logs with `gh run view <run-id> --log-failed`.

| Cause | Signal | Action |
|---|---|---|
| Real break | Type errors, lint errors, build failure, test failure, changed action inputs | Minimal fix on the bot branch |
| Action input mismatch | A bumped action's `action.yml` no longer accepts a `with:` key used in `.github/workflows/` | Update the workflow input |
| Lockfile drift | `pnpm install --frozen-lockfile` fails | Run `pnpm install` at the repo root to update `pnpm-lock.yaml` |
| Flaky e2e | Passes on rerun, failing test is not related to the bump | Rerun with `gh run rerun <run-id> --failed`; note it |

Actions are pinned to full commit SHAs with a version comment. A bump must keep that format.

## 4. Verify locally

Run `pnpm install` at the repo root first, so the checks use the bumped dependencies. Then run `pnpm check:changed`, plus the checks for what the bump touches:

| Bump | Check |
|---|---|
| Vite or a Vite plugin | `cd client && pnpm run build`, then load `http://localhost:3000` |
| GitHub Action or Dockerfile base image | Read the action's release notes for breaking input changes; `docker compose build client` for Dockerfile bumps |
| Anything the e2e suite depends on | `pnpm run e2e` |

For a major version bump, read the upstream changelog and list the breaking changes that apply to this repo.

## 5. Review and finish

Run `review-branch` on the diff if you edited anything. Report what was bumped, what broke, what you changed, and the CI state. Wait for the user before committing or pushing.
