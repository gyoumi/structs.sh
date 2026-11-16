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
- **Consider**: a real finding that is out of scope. Becomes a follow-up.
- **Noted**: minor. Becomes a follow-up.
- **Dismissed**: speculative generality, extra edge states, frozen contracts, or state machines nobody asked for. Show these to the user so they can override.

## Flow

1. If the user said "pull latest" or "rebase", update from the base first (`git fetch` and rebase onto `origin/dev`, or `upstream/dev` in a fork). The orchestrator runs that only because the user asked.
2. Run `sol-loop` in code mode with step `branch`, the diff from `merge-base HEAD <base>`, and the two axes plus the `review-branch` checklist in the brief's rules.
3. Rounds, budget, re-review of Act-on deltas, and follow-ups follow `sol-loop`.
4. When Sol approves, run the `review-branch` checks once more on the final tree and report.

## Hard stops

- Never apply findings before the review returns.
- Workers never run git writes.
