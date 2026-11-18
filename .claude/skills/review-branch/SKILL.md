---
name: review-branch
description: Pre-PR review of the whole branch diff against origin/dev, then the same checks CI runs. Use when a branch is ready for a PR, or the user says "review the branch", "pre-PR review", or "check branch quality".
argument-hint: (optional files or areas to focus on)
---

# Review branch

Review the effective branch diff once, then run the CI checks once. Fix nothing in this skill; report findings and stop.

## 1. Scope

```bash
git fetch origin dev
BASE=$(git merge-base HEAD origin/dev)
git diff --stat "$BASE"
git diff --name-only "$BASE"
git ls-files --others --exclude-standard
```

Review committed, uncommitted, and untracked changes together. Untracked files that belong in the PR count; build output and reports do not.

If the branch or PR links an issue, read it with `gh issue view <n>` for scope.

## 2. Read the diff

Read each changed file's diff once with `git diff "$BASE" -- <file>`. Open the full file only when the diff lacks the context to decide.

Read removals before additions:

```bash
git diff --diff-filter=D --name-only "$BASE"
```

Then read every `-` hunk in modified files: deleted functions, guards, branches, effects, subscriptions, tests, and config. A review that only reads `+` lines cannot pass removal safety.

For a wide diff, you may hand separate areas (for example `client/` and `debugger/`) to parallel Explore subagents and merge their findings.

## 3. Checklist

| # | Check | What to verify |
|---|---|---|
| 1 | Correctness | The change does what the branch says. Edge cases the diff touches are handled. |
| 2 | Removal safety | Every deleted file, function, guard, effect, or test is justified. Logic was replaced, not dropped. Callers were updated. Tests were not deleted to hide a gap. |
| 3 | Redundancy | No duplicated logic, and no dead code or parameters the tools miss. |
| 4 | Structure | Logic sits in the right place: React components in `client/src/components` or the visualiser folders, animation logic in `visualiser-src/*/animation-producer`. |
| 5 | Consistency | Naming, imports, and error handling match the surrounding code and the rest of the branch. Flag two files that solve the same concern in different ways. |
| 6 | Tests | The new or changed test would fail without the change, and checks what a student sees. User-visible debugger behaviour changes have an e2e test, or an entry in `e2e/known-failures.json` with a reason. CI accepts a pytest alone, so this part is on the reviewer. |
| 7 | Hardcoded values | No new hardcoded colours outside the theme or palette (the lint rule only warns for now), no magic numbers that belong in a `constants.ts`, no secrets. |
| 8 | Security | Nothing user-controlled reaches a shell, gdb MI command, or nsjail config without escaping. See the path notes in `.coderabbit.yaml`. |
| 9 | Docs | READMEs, `docs/`, and `e2e/README.md` still describe the code. Outdated docs are a finding. |
| 10 | Scope | Every change relates to the branch's purpose. Flag drive-by edits. |

Correctness, removal safety, and security findings are blockers. Style nits are warnings.

CI already fails a PR for these, so don't spend review time on them: unused imports and variables (ESLint), dead files (knip), page internals or sleeps in e2e tests (e2e lint), debugger changes with no test change, deleted or gutted test files, `[DEBUG-` lines, and forbidden files. See `scripts/pr-rules.mjs`.

## 4. Run the checks

Only after the static review has no blockers. From the repo root:

```bash
pnpm install   # a fresh worktree has no node_modules
pnpm check:changed
```

It runs the fast checks for the areas the branch touched. When the branch changes `client/`, `debugger/` or `e2e/`, also run the e2e suite, since `check:changed` only type-checks and lints e2e: `docker compose up -d debugger`, then `pnpm run e2e`. CI also runs the client build.

A `skipped` line in the output means that check did not run. Report it as unverified, not as passed.

UI changes also need screenshots of the affected screens; see `ui-visual-test`.

## 5. Report

Lead with blockers. Cite file, line, and the checklist row for each finding.

```text
Branch review: <branch>, <N> files changed

Blockers
1. <file>:<line>: <what is wrong and why> (row N)

Warnings
1. ...

Checks: client tsc/lint/build <pass|fail|skipped>, debugger <...>, e2e <x/y working>
Verdict: ready for PR | needs fixes
```

On a clean pass, report only the verdict, file count, and check results.

Do not commit, push, or open the PR from this skill.
