---
name: grill-me
description: Interview the user with plain-language questions, one at a time, until a plan's outcome, scope, and verification are clear, then write the answers into the plan. Use at the start of planning, when scope is ambiguous, or when the user says "grill me".
---

# Grill me

Make planning rigorous before implementation. Ask until the outcome, scope, verification, and major unknowns are concrete. Grilling ends only when the answers are written into the plan and checked against it.

## 1. Read first, then start broad

Read the issue (`gh issue view <n>`), the user's message, and any linked docs before asking anything. Do not ask what the code or issue already answers.

Move from broad to narrow:

- What counts as done
- What is out of scope
- Constraints and dependencies (for example the in-browser compiler, the recording format, existing visualisers)
- How the result will be verified
- UI and interaction details, when relevant
- Edge cases, cleanup, and order of work

Pick the next question by the biggest remaining uncertainty, not a fixed list.

## 2. One question at a time

Ask with the `AskUserQuestion` tool. Batch two or three only when they are tightly coupled on one narrow topic. Each question:

- offers options ordered most to least recommended, with the top one marked recommended;
- includes a concrete default or example;
- allows a free-form answer.

## 3. Plain language

The user must understand the question and the options without knowing the code.

- Ask about the visible outcome first, not internal terms.
- One decision per question, in one short sentence. Keep questions and options under about 20 words.
- Use the user's own words where possible. Explain any unavoidable technical term.
- Each option starts with the answer, for example `Show it in the console (Recommended)`, plus at most one short reason.

Test before asking: could the user answer without opening the code? If not, rewrite it.

```text
Bad:  Should the MI response handler propagate the error state to the store?
Good: When the program doesn't compile, where should the student see the error?
Good option: In the console panel (Recommended). That is where other compile errors appear.
```

## 4. Keep going until it is clear

Keep asking while any of these are unclear: what success looks like, what is out of scope, how it will be verified, ordering, and hidden dependencies. More questions are better than a vague plan.

For UI work, ask for a screenshot, mockup, or an existing screen to match. Warn if there is none, but do not block on it.

## 5. Stop phrases

Stop asking and propose the plan when the user says something like "stop asking", "just plan it", "enough questions", or "propose now". Step 6 still applies.

## 6. Write the answers into the plan

Collecting answers in chat is not completion.

1. Find the existing plan first: the issue body, a plan file the user named, or the current plan in this session. Do not claim there is none without looking.
2. Write every binding answer into it: requirements, key decisions, how each part will be verified, and what is out of scope.
3. If no plan exists, write one where the user wants it (a plan file, or the issue body if they ask). Do not edit a GitHub issue without permission.
4. Re-read the plan and compare it with every answer. Fix gaps and contradictions.
5. Report the exact place you updated.
