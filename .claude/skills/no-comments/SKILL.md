---
name: no-comments
description: Delete comments that explain our own code, and make the code say it instead. Spawns the comment-sicko agent to find them, then fixes what it accepts. Use for /no-comments, "prune comments", or checkpoint 5b of the debugger rewrite.
license: Adapted from cursor/plugins pstack (MIT). Complete terms in LICENSE.txt
---

# No comments

Adapted from [pstack's `no-comments`](https://github.com/cursor/plugins/blob/main/pstack/skills/no-comments/SKILL.md).

A comment that explains our own code is a sign the code isn't clear. Delete it, and where the code is unclear without it, rename, retype or reshape the code so it says the same thing. Only a few kinds of comment stay (see the agent's keep list).

## Scope

Use the files or diff the caller names. Otherwise use the diff from the branch's base (for the debugger rewrite, `origin/debugger-rewrite`; elsewhere `origin/dev`) to the working tree. Test files are out of scope unless the caller says otherwise. Their comments belong to whoever owns the tests (see `.claude/rules/testing.md`).

## Steps

1. **Hunt.** Spawn the `comment-sicko` agent (`.claude/agents/comment-sicko.md`) with the scope. It deletes the comments it condemns, and reports the code that needs reshaping as `MUST KILL` flags. It never changes code.
2. **Judge its report and diff.** Reject:
   - edits to anything but comments;
   - files outside the scope;
   - deleted comments that fit the keep list;
   - `MUST KILL` reasons that misstate what the code does.

   Before accepting or rejecting an `IMPORTANT` or `do not remove` comment, trace the symbol it names: read the code, `git log -S`, `git blame`. If a keep still can't be proven true today, the comment goes. Check that lint and TypeScript suppressions (`eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`) were looked at too. One that hides a real bug is a `MUST KILL`. If you reject a report, revert it and rerun once with the reason. If the second report fails too, stop and report it open.
3. **Fix the flags.** Delete dead paths, drop unused parameters, use the real API. Where a flag needs a new shape, sketch it first: the names, the types and where the code moves. Then make the smallest change that removes the need for the comment. Don't add guards for symptoms. If the real fix is outside the scope, make the smallest in-scope change and report the rest open.
4. **Constraint comments** ("do not remove", "keep this wording", "talk to X first") about things we can't change stay. For ones about our own code, offer the cheapest way to enforce the rule instead: a type, a runtime check, a test or a lint rule. Wait for the user to approve that, unless the caller already did. If approved, encode it and delete the comment. Otherwise, delete it and report the constraint open.
5. **Check.** Run the checks for the touched areas (`.claude/rules/testing.md`, Commands). A comments pass changes no behaviour, so every test passes unchanged.
6. **Report:**
   - how many comments were deleted, and which were restored and why;
   - any reruns;
   - the reshapes made;
   - constraints encoded, and constraints left open;
   - other open work.
