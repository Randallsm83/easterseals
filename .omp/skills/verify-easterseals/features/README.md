# Easterseals verification map

This directory is the maintained source for verifying the user-facing behavior of the Easterseals research-study tracker. A researcher configures a session in the browser, a participant clicks buttons that earn points, and the researcher reviews click timelines on the graphs page. Read the index before driving the app, then use the matching feature file as the recipe.

## Baseline preconditions

- `node` on PATH (`source ~/.config/zsh/agent-env.zsh` in agent shells) and Google Chrome at `/Applications/Google Chrome.app` (or `CHROME_PATH`).
- `C=.omp/skills/verify-easterseals/scripts/control-easterseals`, run from the repo root.
- `$C deps` has succeeded once.
- A run launched with `$C launch <RUN_ID>`: the checkout's `app.js` on `http://127.0.0.1:415xx` with an empty scratch `es.db` under `$STATE/runs/<RUN_ID>/`.
- `$C doctor <RUN_ID>` prints no `FAIL` line.
- Never drive the user's own instance on port 8001 or any instance this run did not launch.

## Driving conventions

- Every journey creates its own session through the setup form with ID `verify-<RUN_ID>-<journey>`; journeys do not depend on each other and can run in any order on one launch.
- Address form fields by their `id`, session buttons by `button[name="left|middle|right"]` (all are labelled `Click Me`), the submit button by role `button` / name `Submit`, and the graphs link by role `link` / name `View Graphs`.
- Wait for each `POST /log-event` response before asserting; the page logs asynchronously.
- Session IDs are permanent within a DB: re-running a journey on the same `RUN_ID` hits the duplicate-ID rejection. Launch a new run instead.

## Proof and skip reporting

- Capture the user action and the resulting state: each step writes a screenshot and an ARIA snapshot to `$STATE/evidence/<RUN_ID>/<journey>/`.
- Every mutation is read back from the scratch SQLite DB (`db-*.json`) in addition to what the page shows.
- `result.json` records each check and the overall result; quote the `RESULT` line and the evidence path.
- Report an unreachable path with the command run and the unmet precondition (for example the d3 CDN being unreachable). Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with control-easterseals`, `Gotchas`.

## Features

- [Set up a session](./setup-session.md) covers the setup form, stored configuration, button appearance, duplicate-ID rejection and unknown session URLs.
- [Points session](./points-session.md) covers clicking the active and inactive buttons, the award interval, the points cap, the end-of-session lock and the click log.
- [Timed session](./timed-session.md) covers seconds-based sessions ending on a timer, with and without "Continue Session After Limit?".
- [Session graphs](./session-graphs.md) covers the `View Graphs` link, the session picker, the session-data JSON and both d3 click timelines.
