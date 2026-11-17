---
name: git-clean-commit
description: Pre-commit check that only source files are staged, with no build output, test reports, caches, or editor files. Use before any git add or git commit, especially after running a build, the e2e suite, or installing packages.
---

# Git clean commit

Ignore rules are split across folders. The root `.gitignore` only covers `.idea`, `.DS_Store`, and `node_modules/`. `client/`, `debugger/`, and `e2e/` have their own. `docs/` has none. Check before staging.

## 1. Check ignored paths

Before staging a path, especially a list another agent gave you:

```bash
git check-ignore --no-index -v <path>
```

`--no-index` is needed: without it, `git check-ignore` reports nothing for a path that is already tracked, even if it matches an ignore pattern.

- Match and untracked: drop it from staging.
- Match and already tracked (`git ls-files <path>` prints it): untrack it with `git rm --cached <path>` in its own commit, before the requested commit.
- No match: continue.

## 2. Expand untracked files

```bash
git status --short --untracked-files=all
```

Never stage a directory name without expanding it first.

## 3. Exclude generated files

These are already ignored: `client/build/`, `client/.env`, `e2e/playwright-report/`, `e2e/test-results/`, and the Python caches and `.venv` under `debugger/`.

These are not ignored. If they show up, do not stage them. Suggest a `.gitignore` entry instead.

| Path | Why |
|---|---|
| `docs/.venv/`, `docs/site/` | uv environment and mkdocs build output; `docs/` has no `.gitignore` |
| `__pycache__/`, `.pytest_cache/`, `.ruff_cache/` outside `debugger/` | Python caches |
| `*.tsbuildinfo` | TypeScript incremental cache |
| `.env` files outside `client/` and `debugger/` | Secrets |
| Stray `*.png` screenshots in the repo root or `e2e/` | Agent or manual screenshots |
| Any `package-lock.json`, `yarn.lock`, or `bun.lock` | Created by another package manager; this repo uses pnpm and `pnpm-lock.yaml` |
| `.claude/settings.local.json` | Personal Claude Code settings |

## 4. Stage explicitly

```bash
git add <specific paths>   # not git add .
git status                 # review the staged set
git diff --cached --stat
```

## 5. Commit message

The `commit-msg` hook runs commitlint with `@commitlint/config-conventional`, so the message must be a conventional commit:

```text
<type>(<optional scope>): <summary>
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `ci`, `build`, `perf`, `style`. Scopes used in this repo's history include `debugger`, `ci`, `docs`, `deps`, and `api`; name the area the change touches.

Pass multi-line messages with a heredoc. Do not skip the hook with `--no-verify` unless the user asks.
