# Set up a session

A researcher fills the Setup Form at `/` (session ID, length and its unit, continue-after-limit, active button, shape and color of each of the three buttons, points awarded, award interval, starting points) and submits it. The configuration is stored and the browser lands on that session's page with the configured buttons and starting points. A session ID can be used only once, and an unknown session URL shows an error.

## Sub-features

- `setup-render` the Setup Form renders at `/` with title `Setup Form`.
- `setup-save` submitting stores the configuration and redirects to `/session/<id>`, which logs a `start` event.
- `setup-appearance` the session page shows the starting points and each button's configured shape (CSS class) and color.
- `setup-duplicate` reusing a session ID returns 400 `Session ID already exists. Please enter a different one.` and stores nothing new.
- `setup-unknown` `/session/<unknown id>` returns 404 `Config not found`.

## How to get to it (user POV)

- Open `/` in a browser; the form is the landing page.
- Type a session URL `/session/<id>` directly (reopens an existing session page; unknown IDs show the 404 text).

## Driving it with control-easterseals

Preconditions:

- A launched run whose `$C doctor <RUN_ID>` is clean.
- No session `verify-<RUN_ID>-setup` exists yet (fresh run).

- **Open form.** Load `/`. Run `$C drive <RUN_ID> setup`. Check `setup form renders at /` passes; `01-setup-form.png` shows the three fieldsets.
- **Submit config.** Fill `#sessionId`, `#sessionLength`=5, `#sessionLengthType`=`points`, `#buttonActive`=`left`, left `circle` `#ff0000`, middle `square` `#0000ff`, right `rectangle` `#00ff00`, `#pointsAwarded`=1, `#clicksNeeded`=1, `#startingPoints`=2, then click `Submit`. The URL becomes `/session/verify-<RUN_ID>-setup` and the `start` log-event returns 200.
- **See the session page.** `#pointsDisplay` reads `2`, three `Click Me` buttons, the left one has class `circle` and background `rgb(255, 0, 0)`; `02-session-page.png`.
- **Confirm storage.** `db-session.json` holds one `session_configuration` row whose config echoes the form (string values, e.g. `"pointsAwarded": "1"`) and exactly one `start` event with `pointsCounter: 2`.
- **Duplicate ID.** Submit the form again with the same ID. Response 400 with the duplicate message; `03-duplicate-rejected.png`; the DB still has one config row.
- **Unknown session.** Load `/session/verify-<RUN_ID>-setup-missing`. Response 404 `Config not found`; `04-unknown-session.png`.

## Gotchas

- The duplicate and unknown-session responses are bare text pages, not the form with an inline error; assert the body text and status.
- Config values are stored exactly as the form posts them (strings; the checkbox is `"on"` or absent). There is no server-side validation, so a mismatch in types is app behavior, not a harness bug.
- Opening the session page is what logs `start`; reloading `/session/<id>` logs another `start` event for the same session.
- Re-running on the same RUN_ID fails at the submit step with the duplicate message. Launch a fresh run.
