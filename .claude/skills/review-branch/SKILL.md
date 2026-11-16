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

Review committed, uncommitted, and untracked changes together. Untracked files that belong in the PR count; build output and reports do not (see `git-clean-commit`).

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
| 3 | Redundancy | No duplicated logic, dead code, unused imports, variables, or parameters. |
| 4 | Structure | Logic sits in the right place: React components in `client/src/components` or the visualiser folders, animation logic in `visualiser-src/*/animation-producer`, page internals for e2e only in `e2e/support/debugger-page.ts`. |
| 5 | Consistency | Naming, imports, and error handling match the surrounding code and the rest of the branch. Flag two files that solve the same concern in different ways. |
| 6 | Tests | Behaviour changes in the debugger have a pytest or e2e test. User-visible debugger behaviour changes have an e2e test, or an entry in `e2e/known-failures.json` with a reason. |
| 7 | Hardcoded values | No hardcoded colours outside the theme or palette, no magic numbers that belong in a `constants.ts`, no secrets. |
| 8 | Security | Nothing user-controlled reaches a shell, gdb MI command, or nsjail config without escaping. See the path notes in `.coderabbit.yaml`. |
| 9 | Docs | READMEs, `docs/`, and `e2e/README.md` still describe the code. Outdated docs are a finding. |
| 10 | Scope | Every change relates to the branch's purpose. Flag drive-by edits. |

Correctness, removal safety, and security findings are blockers. Style nits are warnings.

## 4. Run the CI checks

Only after the static review has no blockers. These match `.github/workflows/pre-merge.yml` and `e2e.yml`. Run the ones whose area changed, in parallel where possible:

| Area changed | Commands |
|---|---|
| `client/` | `cd client && npm run tsc && npm run lint && npm run build` |
| `debugger/` | `cd debugger && uv sync --locked --all-extras --dev` and the relevant pytest |
| `client/` or `debugger/` or `e2e/` | `docker compose up -d debugger`, then `cd e2e && npm run typecheck && npm test` |

Run each check once. If you change files afterwards, re-run only the checks for the changed area.

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
