---
name: how
description: Explain how a part of the codebase works from the current source, without editing anything. Use for "how does X work", "walk me through", "where should this live", or "which part owns this".
argument-hint: how does <subsystem> work
---

# How

Give a clear mental model of a subsystem from the current source before anyone edits it. Read the code; do not answer from memory.

For a large or unfamiliar area, send an Explore subagent to map it first, then read the key files yourself before explaining.

## Output

Answer in chat with these sections, in this order. Leave out any section that would be empty.

- Overview
- Key concepts
- How it works
- Where things live
- Gotchas

Name real files, classes, and functions so the user can jump to the code. Write prose instead of pasting code. Include at most one short snippet, only when a mechanism is hard to say in words. Do not state a fact about the source you did not read.

Write plainly; see `unslop`.

## Critique mode

Default is explanation only. Switch to critique only when the user asks for problems, risks, or improvements.

1. Give the explanation first.
2. Spawn one read-only critic (`opus`) to review the explained subsystem for problems.
3. You are the lead. Put every finding in one bucket: Act on, Consider, Noted, or Dismissed.
4. Dismiss findings that add abstraction without a concrete failure.

Never edit files from this skill.
