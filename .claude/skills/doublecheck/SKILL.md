---
name: doublecheck
description: Verify an answer's technical claims before the user acts on it, in three passes - self-audit, source check, adversarial review. Use when output contains file paths, commands, flags, API names, version numbers, or citations stated from memory, or when the user says "doublecheck" or "are you sure".
---

# Doublecheck

Surface every verifiable claim with a confidence rating and a source, and flag anything that looks invented.

Do not use this for brainstorming, casual planning, or claims the user already confirmed in a terminal.

## Pass 1: Self-audit

Re-read the target text and list every verifiable claim with an id (C1, C2, ...):

| Category | Examples |
|---|---|
| Technical | File paths, function names, import paths, command flags, socket event names, gdb MI commands |
| Version | Package versions, config keys, timeouts |
| Citation | Docs, specs, issues, PRs |
| Causal | "X causes Y", "this prevents Z" |

Check for contradictions inside the text first. These need no lookup.

## Pass 2: Source check

Find a source for each claim:

- File paths and line numbers: Glob or Read the file.
- Names (functions, types, events, constants): Grep the repo for the exact name.
- Command flags: run `<cmd> --help` or read the tool's docs.
- Package behaviour: read the installed version in `node_modules/` or `debugger/.venv/`, or the upstream docs for that version.
- External facts: WebSearch or WebFetch the primary source.

Record each as: found, not found, or contradicted.

## Pass 3: Adversarial review

Assume at least one claim is wrong and hunt for it:

1. Plausible file paths that do not exist.
2. Flags that were right in an older version.
3. Names renamed in a recent refactor (check `git log -S '<name>'`).
4. Confident detail that passes 1 and 2 did not actually verify.

## Ratings

| Rating | Meaning |
|---|---|
| VERIFIED | Source found and it confirms the claim |
| PLAUSIBLE | Consistent with the code, no specific source |
| UNVERIFIED | Could not confirm or deny |
| DISPUTED | A source contradicts it |
| FABRICATION RISK | Looks invented: path not found, name not matched |

## Report

```text
Doublecheck

| ID | Claim | Rating | Source |
|----|-------|--------|--------|
| C1 | "..." | VERIFIED | client/src/utils/url.ts:8 |
| C2 | "..." | FABRICATION RISK | no match for `foo` in repo |

Action required: <DISPUTED and FABRICATION RISK items, with the correction>
```

If anything is DISPUTED or FABRICATION RISK, put a short heads-up above the table.

VERIFIED means a source was found, not that the claim is certainly right. The model that wrote the text is checking it, so it can share the same blind spots.
