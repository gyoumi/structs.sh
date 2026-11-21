---
name: unslop
description: Write or rewrite prose plainly and cut AI tells. Use for any real Markdown or HTML prose (docs, READMEs, PR bodies, issue text), and when the user says "unslop", "rewrite for humans", "make this readable", "in plain English", or "say that again".
argument-hint: (optional text or file to rewrite)
---

# Unslop

Plain, specific writing for people. Applies to documentation in `docs/`, READMEs, PR and issue bodies, and chat summaries. Does not apply to source code, code comments, or one-line mechanical edits (typos, version bumps, checkboxes).

When the user says "unslop" or "make this readable" with no file named, rewrite the named text or your last message in place.

## Plain language

- Say the mechanism or the number, not how it feels.
- One idea per sentence. Name the actor: client, debugger, compiler, the user.
- Use the plain word. If a reader would need the source open to parse a phrase, rewrite it.
- Do not invent abstract nouns for ordinary actions. Say "show as", "tear down", "where the code decides", not "demote", "posture", "control point".
- Put issue numbers, enum values, and file paths after the plain explanation, not in the opening sentence.
- If a sentence could appear unchanged in another project's docs, cut it.

## Explaining a bug

Use this shape every time:

- **What you see**: the visible symptom in everyday words.
- **Why**: one short cause, naming the actor.
- **Next**: the fix direction, or the one decision needed from the user.

One bug per block. Do not weave two bugs into one sentence.

## Current state only

When deleting, reverting, replacing, retitling, or updating text, write only the resulting state. A reader who never saw the old version must not learn it existed. No "was X, now Y", no "this replaces", no notes about abandoned approaches.

Exceptions: commit messages that must describe a change, diagnosis reports explaining a regression, forward dependencies that are still true ("Depends on #421"), and changelogs the user asked for.

## Cut AI tells

- **Banned words, metaphors, filler, chat phrases, em dashes and curly quotes**: the list is in `.vale/styles/Unslop/`. CI checks docs and READMEs against it; run `vale <file>` locally. Apply the same list to PR bodies and chat, which Vale doesn't see.
- **Content**: no vague attributions (experts believe) or "despite challenges, it thrives".
- **Style**: no colon as a mid-sentence crutch, forced groups of three, synonym cycling, or false ranges ("from X to Y"). No bold on every noun. No bold-label lists that repeat the line. Sentence-case headings. No decorative emoji. Cut stacked hedges.

## When rewriting

| Change freely | Never change |
|---|---|
| Wording, sentence length, active voice | Facts, numbers, paths, commands |
| Heading text, section order | Decisions and their reasons |
| Table versus prose | Required sections, links that must stay |

Do not add a caveat, risk, or requirement the source did not have. Ask instead.

## Docs in this repo

`docs/` is an mkdocs site (`docs/mkdocs.yml`). Keep new pages in its existing nav structure, and preview with `cd docs && uv run mkdocs serve` when a page's layout matters.
