# Points session

A participant on `/session/<id>` clicks the three `Click Me` buttons. Only clicks on the configured active button count toward the award interval; every N-th active click adds the configured points to the counter. In a points-length session the counter is capped at the session length, the buttons lock and `Max points reached, session ended.` appears. Every click and the session end are logged to the database.

## Sub-features

- `points-inactive` clicks on a non-active button are logged but award nothing.
- `points-interval` points are awarded once per `clicksNeeded` active clicks.
- `points-cap` the counter stops at `sessionLength`; the end event records `pointsEarnedFinal` and `limitReached: true`.
- `points-lock` with "Continue Session After Limit?" off, all buttons become disabled and the end message shows.
- `points-log` each click posts a `click` event with running per-button totals and points.

## How to get to it (user POV)

- Submit the Setup Form at `/` with `Length` in `Pts`; the browser lands on the session page.
- Reopen an existing session at `/session/<id>` (starts a fresh in-page count, see Gotchas).

## Driving it with control-easterseals

Preconditions:

- A launched run whose `$C doctor <RUN_ID>` is clean.
- No session `verify-<RUN_ID>-points-session` exists yet.

- **Start session.** Run `$C drive <RUN_ID> points-session`. It submits the form with length 3 `points`, active `left`, `#pointsAwarded`=1, `#clicksNeeded`=2, `#startingPoints`=0. The session page loads and its `start` event returns 200; `01-session-start.png` shows `0`.
- **Inactive click.** Click `button[name="middle"]`. `#pointsDisplay` stays `0`.
- **Award interval.** Click `button[name="left"]` five times. The counter reads `0,1,1,2,2` after each click; `02-before-limit.png`.
- **Hit the cap.** Click `button[name="left"]` a sixth time. The counter reads `3`, `#sessionOverDisplay` reads `Max points reached, session ended.`, all three buttons are disabled, and an `end` event is posted; `03-session-ended.png`.
- **Confirm the log.** `db-events.json` contains 1 `start`, 7 `click`, 1 `end`; the end value has `pointsEarnedFinal: 3, limitReached: true`; the last click has `total: 7, left: 6, middle: 1, pointsCounter: 3`.

## Gotchas

- Disabled buttons look identical to enabled ones; assert `disabled`, not the screenshot.
- Clicks post asynchronously and the server stores the client timestamp; order rows by the value's `total`, not insertion order, when clicks are fast.
- The setup form only offers `Left` or `Right` as the active button; the middle button can never award points.
- The counter is in-page state: reloading the session page resets it to `startingPoints` and logs a second `start` event, while earlier clicks remain in the DB.
- `clicksNeeded` of 0 makes every click (on any button) award points, because the interval check runs for all clicks.
