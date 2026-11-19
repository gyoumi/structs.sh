---
name: ui-visual-test
description: Check a UI change by screenshotting the running client with Playwright at fixed viewports. Use after a new screen, a layout or styling change, an animation change in a visualiser, or when asked to review screenshots.
argument-hint: <route or screen to check>
---

# UI visual test

There is no committed screenshot-baseline suite. A visual check is Playwright screenshots of the running client, read by you and shown to the user. Type checks and a green e2e run do not prove a layout is right.

This skill does not cover click-path behaviour tests. Those belong in `e2e/tests/`; see `e2e/README.md`.

## Setup

- The client runs on `http://localhost:3000` (`pnpm --dir client start`, or `docker compose up client`). Reuse a dev server that is already running; do not start a second one on another port.
- The debugger page (`/debugger`) runs in the browser and needs no backend, only the instrumenter built once with `pnpm run instrumenter`.
- Use the Playwright installed at the repo root (`pnpm install && pnpm exec playwright install chromium` if needed).

## Routes

| Screen | Path |
|---|---|
| Home | `/` |
| A visualiser | `/visualiser/<topic>`, where `<topic>` is the topic title lowercased with spaces as dashes (`titleToUrl` in `client/src/utils/url.ts`), for example `/visualiser/linked-list` |
| Visual debugger | `/debugger` |
| 404 | any unknown path |

## Viewports

Capture each affected screen at:

- 1440×900 (laptop)
- 1280×800 (small laptop)
- 390×844 (phone), when the screen is meant to work on mobile

Use `deviceScaleFactor: 1`. Do not use the host window size.

## Steps

1. Write a throwaway script under a gitignored folder (for example `e2e/test-results/visual/`) that opens each route at each viewport and saves a full-page screenshot there.
2. For visualisers, drive the operation being changed (insert, delete, search, step) and screenshot both mid-animation and the final state. Wait on a visible element or the animation's end, not a fixed sleep.
3. Read every screenshot yourself. Check for clipped or overlapping text, nodes or arrows drawn off the canvas, wrong theme colours, and controls hidden at small widths.
4. Show the user the screenshots that matter, with the path to each.
5. Delete the throwaway script, or leave it in the ignored folder. Never commit screenshots.

## Done when

- Every affected route was captured at the viewports above.
- You looked at each image and listed any problems.
- No screenshot or script was staged.
