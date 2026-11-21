# Contributing to Structs.sh

!!! note "Before you begin"
    Feel free to use your preferred LLM to help along the way. The guidelines below are kept short on purpose.

## Getting started

- Install [pnpm](https://pnpm.io/installation), then clone the repository and install the development dependencies:

  ```bash
  git clone {{ extra.repo_clone_url }} structs
  cd structs
  pnpm install
  ```

- Build the debugger's instrumenter, which needs [Rust](https://rustup.rs/) (see `instrumenter/README.md`), then start the project locally:

  ```bash
  pnpm run instrumenter
  docker compose up --build
  ```

## Before you push

Run the fast checks for what you changed:

```bash
pnpm check:changed
```

It compares your branch with the branch it will merge into (its open PR's
base, or `origin/dev` before there's a PR; pass `--base <branch>` to
choose) and runs type checks, lint, the client's unit tests, the e2e
lint rules, knip, and the instrumenter's cargo checks, for
the areas you touched. CI runs these plus
the client build and the e2e suite.

CI also checks every PR for a few things a reviewer would otherwise have to
catch (`scripts/pr-rules.mjs`). These rules run from the base branch, so a
PR that edits them is judged by the rules it started from:

| Check | Fails when | A maintainer can waive it with |
|---|---|---|
| Forbidden files | A non-pnpm lockfile, an `.env` file, a `.tsbuildinfo`, or a screenshot outside the image folders is committed | (not waivable) |
| Debug tags | A temporary `[DEBUG-xxxx]` line is left in | (not waivable) |
| Agent config alone | `.claude/` changes are mixed with other changes | (not waivable) |
| Debugger needs a test | Code in `instrumenter/src` or `client/src/Services/debugger` changes without an e2e test, a Vitest or cargo test, or a known-failures entry | `no-test-needed` label |
| Large removal | A test file is deleted, or a source file is emptied or cut to under 30% of its size | `removal-ok` label |
| Protected paths | CI, lint config, the `scripts` in a `package.json`, agent config or the known-failures list changes | `human-approved` label |

The PR title must be a [Conventional Commit](https://www.conventionalcommits.org/), because squash merges use it as the commit message.

## Contribution models

There are two ways to contribute to Structs.sh:

### [<u>Subcommittee members</u>]({{ extra.github_team_url }})

- Follow GitHub's [shared repository model](https://docs.github.com/en/pull-requests/reference/pull-requests#shared-repository-model).
- Use [Conventional Branch](https://conventionalbranch.org/#summary) when naming branches.
- Discuss ideas, questions, or ongoing work in the internal Discord server.

### External contributors

- Follow GitHub's [fork and pull model](https://docs.github.com/en/pull-requests/how-tos/create-pull-requests/creating-a-pull-request-from-a-fork).
- If you need a hand, open a `help wanted` issue or [contact us](mailto:{{ extra.email }}).
