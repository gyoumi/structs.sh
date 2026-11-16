---
name: develop
description: Short form for orchestrating planned ticket phases. Use for /develop phase N of ticket T or /develop phases N, M of ticket T.
argument-hint: phase <N> of ticket <T>  |  phases <N>, <M> of ticket <T>
---

# Develop

Follow `orchestrate-phase` end to end with these arguments. This session is the orchestrator. Apply the defaults from `orchestrate-defaults` (sonnet workers, opus phase review, checks, then visual or e2e verify) without asking the user to restate them.

Accepted forms:

- `/develop phase 2 of ticket 323`
- `/develop phases 2, 3, and 4 of ticket 277`
- `/develop phase 2 of .tickets/208.md`
