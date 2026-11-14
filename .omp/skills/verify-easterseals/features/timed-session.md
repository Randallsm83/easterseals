# Timed session

A session whose length is in seconds ends on a timer that starts when the session page loads. With "Continue Session After Limit?" unchecked the buttons lock and `Time limit reached. Session ended.` appears; with it checked the session keeps accepting clicks and awarding points after the limit, and only the `end` event marks the limit.

## Sub-features

- `timed-end` after `sessionLength` seconds an `end` event is logged with `limitReached: true` and the points at that moment.
- `timed-lock` without continue-after-limit, buttons disable and the time-limit message shows.
- `timed-continue` with continue-after-limit, buttons stay enabled, no message shows, and later clicks still log and award.

## How to get to it (user POV)

- Submit the Setup Form at `/` with `Length` in `Secs`, optionally ticking `Continue Session After Limit?`.

## Driving it with control-easterseals

Preconditions:

- A launched run whose `$C doctor <RUN_ID>` is clean.
- No sessions `verify-<RUN_ID>-timed-session` or `verify-<RUN_ID>-timed-session-continue` exist yet.

- **Start a 2 s session.** Run `$C drive <RUN_ID> timed-session`. It submits length 2 `seconds`, active `right`, 5 points per click, interval 1.
- **Earn before the limit.** Click `button[name="right"]`. `#pointsDisplay` reads `5`; `01-timed-running.png`.
- **Timer fires.** Within about 2 s an `end` event posts, `#sessionOverDisplay` reads `Time limit reached. Session ended.` and the buttons are disabled; `02-timed-ended.png`. The DB end event has `limitReached: true, pointsEarnedFinal: 5`.
- **Continue after limit.** A second session (length 1 s, continue ticked, active `left`) waits for its `end` event; buttons stay enabled and the message is empty. One `left` click then shows `1`; `03-continue-after-limit.png`.
- **Confirm the log.** `db-events.json` shows the continue session's events in order `start,end,click`.

## Gotchas

- The timer starts on page load, not on the first click; a slow driver can hit the limit before its first click. Keep lengths of at least 1 s and click immediately.
- The `end` event is logged once; nothing marks clicks after the limit in a continue session except their position after `end`.
- A seconds session never caps points, even if `sessionLength` is small.
