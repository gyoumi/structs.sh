---
name: eval
description: Test whether a skill or prompt change actually changes agent behaviour, using blinded candidate runs and one judge, before keeping it. Use for /eval, "eval this skill", or proving every line of a skill is worth keeping.
argument-hint: (skill name, or describe the variant)
disable-model-invocation: true
---

# Eval

Run blinded candidates to prove a skill or prompt change changed behaviour before promoting it. Models come from `orchestrate-defaults`. No git writes.

The orchestrator designs the run, plants variants, spawns candidates and one judge, reads the outputs, and synthesises. It never writes the final skill body until the user approves. Silence, or "continue" about something else, is not approval.

## Modes

1. **Variant** (default): one change under test. Control is the current file; treatment is the variant. Promote only if treatment wins on the rubric.
2. **Skill prune**: prove every claim in one skill is worth keeping. One skill per run. Do not start the next until the user names it.

## Models

| Role | Model |
|---|---|
| Candidates (2 by default) | one `sonnet`, one `opus`, both `general-purpose` |
| Judge (one, read-only) | `sonnet`, `general-purpose` |

## Blinding

Non-negotiable. Candidates must never see:

- The words eval, test, judge, experiment, rubric, score, compare, benchmark, candidate, or arena in any folder, file, or prompt.
- A meta request. The prompt reads as an organic user request: "Rewrite this README section so a new contributor can follow it" is fine; "show me you follow unslop" is not.
- Questions about which skills or files they used. Grade from what they actually opened and produced.
- Unsanitized names. Use names a user might pick, not `candidate-1`.
- That other candidates exist.

The judge may know it is judging. It sees outputs by sanitized label only, never a model name and never "control" or "treatment". When comparing two variants, one judge scores both sets in one pass on one scale.

## Variant

1. Write 3 to 6 concrete rubric criteria, for the judge only. Concrete: "the rewritten section never mentions the old setup steps". Vague: "follows the skill".
2. Plant the smallest fixture that makes the organic prompt real (see Setup).
3. Run control and treatment with the same prompt.
4. Judge both sets in one pass. Read every output yourself.
5. Reply promote or do-not-promote, and wait for approval.

## Skill prune

1. List the skill's atomic claims (C1, C2, ...): each sentence or bullet that could change a decision, quoted, with file:line.
2. Group claims that encode the same behaviour. One group is one ablation.
3. Static cut without a run is allowed only for a line that restates its heading, or copies a rule owned by another skill. List those as "CUT (static)" so the user can demand a run.
4. Everything else runs: control is the full skill, treatment has that group removed, same organic prompt for every candidate.
5. Verdict per group: KEEP (control meets the rubric, treatment misses), CUT (both meet it, or treatment is better), REWRITE (both miss it), RERUN (the prompt leaked the measure, the rubric was ambiguous, or you and the judge disagree).
6. Hand back a keep/cut table and wait for approval.

## Setup

- Claims that need this repo: `git worktree add` a disposable worktree outside the repo with an organic name (for example `../structs-linked-list-docs`), off current HEAD. Replace only the skill under test with the variant in that worktree's `.claude/skills/`. Run the candidate with that worktree as its working directory.
- Claims that do not need the repo: a small scratch folder with a stub task and the planted skill where a candidate would naturally find it.
- One folder per variant. Never two writers in one folder.
- Remove the worktrees and scratch folders after the run.

## Run

- Spawn all candidates for one group in one message. Wait for all of them before the judge. Never act on the first-finished result.
- Spawn one blinded judge with the rubric and the outputs by sanitized label.
- Read every candidate output end to end. Where you need to know what a candidate opened, read its session transcript under `~/.claude/projects/` for that worktree only. Citing a skill is not reading it; reading it is not applying it.
- If you and the judge disagree, mark RERUN. Do not promote on a split.

## Reply

In order: what was tested, the rubric, notes per candidate (sanitized labels), the judge's verdict, your synthesis, and the keep/cut table or promote decision. Do not start the next skill unless the user names it.

## Hard stops

- Never leak the measure to candidates.
- Never write the skill body before approval. Write it following `unslop`.
- Never commit or push.
- Judges and reviewers never write files.
