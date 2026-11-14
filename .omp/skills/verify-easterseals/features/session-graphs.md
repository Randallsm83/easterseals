# Session graphs

A researcher follows `View Graphs` from the setup page to "Session Data", picks a session from the dropdown, and sees two d3 scatter charts of that session's clicks over time: clicks per button (colored by button) and total clicks.

## Sub-features

- `graphs-picker` `/graphs` lists every configured session ID in `select[name="sessionId"]`.
- `graphs-data` choosing a session fetches `/graphs/<id>` JSON with `sessionConfig`, `startEvent`, `endEvent` (when present) and `allClicks`.
- `graphs-per-button` `#clickTimeline1` plots one `circle.dot.<button>` per click on that button.
- `graphs-total` `#clickTimeline2` plots one circle per click.

## How to get to it (user POV)

- Choose the `View Graphs` link under the Setup Form at `/`.
- Open `/graphs` directly.

## Driving it with control-easterseals

Preconditions:

- A launched run whose `$C doctor <RUN_ID>` is clean.
- Network access to `cdnjs.cloudflare.com` (d3 7.8.5).
- No session `verify-<RUN_ID>-graphs` exists yet; the journey seeds it through the UI.

- **Seed clicks.** Run `$C drive <RUN_ID> graphs`. It sets up a 100-point session (active `left`, interval 1) and clicks `left, left, middle, left, right`; the counter reads `3`.
- **Open graphs.** From `/`, click link `View Graphs`. The URL is `/graphs`, heading `Session Data` is visible and the picker lists the session; `01-graphs-picker.png`.
- **Pick the session.** Select the session in `select[name="sessionId"]`. `GET /graphs/<id>` returns 5 clicks, a start event and no end event; saved as `graphs-response.json`.
- **See the charts.** `#clickTimeline2` holds 5 circles; `#clickTimeline1` holds 3 `left`, 1 `middle`, 1 `right` dots; `02-graphs-rendered.png`.

## Gotchas

- With the d3 CDN unreachable the charts never render; `network.jsonl` shows a `requestfailed` for `d3.js`. Report that as an unmet precondition.
- The x axis uses whole seconds, so a fast scripted session shows every tick as `0`; that is the app's formatting, not missing data.
- Selecting a session without a `start` event throws in the page script (`startEvent.timestamp` of undefined, see `console.log`) and draws nothing; a session with a start but no clicks draws axes with no dots.
- The picker lists every session in the DB, including other journeys' sessions from the same run.
