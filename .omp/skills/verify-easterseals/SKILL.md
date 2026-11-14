---
name: verify-easterseals
description: Drive the Easterseals research-study tracker (Express + Pug + SQLite web app in this repo) through its real browser UI on a scratch database and capture proof. Use when you need to show that session setup, the three-button click session (points or timed), event logging, or the d3 session graphs actually work, or when anything in app.js or views/ changed.
---

# verify-easterseals

The only user surface is a server-rendered web UI served by `app.js` (no API clients, no CLI):

| Route | User sees |
|---|---|
| `GET /` | "Setup Form": session ID, length (Secs/Pts), continue-after-limit, active button, per-button shape/color, reward settings, `View Graphs` link |
| `POST /setup` | saves config, redirects to `/session/<id>`; duplicate ID → 400 text page |
| `GET /session/<id>` | points counter + three `Click Me` buttons; page JS posts `start`/`click`/`end` events to `POST /log-event` |
| `GET /graphs` | "Session Data" page, session picker, two d3 charts fed by `GET /graphs/<id>` JSON |

`app.js` hardcodes port `8001` and opens `es.db` relative to its cwd. The harness never runs it from the repo: it runs the checkout's `app.js` from a scratch run directory (symlinked `views/`, `public/`) with a preload that rebinds `8001` to a loopback port in `41500-41599`. Every run gets its own port, DB and evidence dir, so several runs can sit side by side; the user's own `npm run dev` on 8001 is never touched.

All helpers need `node` on PATH. In agent shells prefix with `source ~/.config/zsh/agent-env.zsh &&`. Set once:

```sh
C=.omp/skills/verify-easterseals/scripts/control-easterseals   # run from the repo root
```

## Launch

```sh
$C deps                 # one time: installs express/pug/sqlite3 (repo ranges) + playwright-core into $STATE/deps; never touches the checkout
$C launch [RUN_ID]      # RUN_ID defaults to <timestamp>-<pid>
```

`$STATE` is `${XDG_STATE_HOME:-$HOME/.local/state}/verify-easterseals`. Launch starts from an empty DB every time: the app creates `session_configuration` and `session_event_log` on connect. It prints `RUN_ID=`, `URL=`, `PID=`, `DB=`, `EVIDENCE=` and returns only when the log contains `Session event log table setup is ready.` and `GET /` serves `<title>Setup Form</title>`. If it exits non-zero it prints `app.log`; run `$C cleanup <RUN_ID>` before retrying. Pin a port with `VERIFY_PORT=415xx $C launch ...` (must stay inside 41500-41599). No seed data exists or is needed: every journey creates its own session through the setup form.

Teardown is `$C cleanup <RUN_ID>` (see Cleanup).

## Doctor

```sh
$C doctor <RUN_ID>
```

Read-only. Checks: the recorded PID is alive and runs this checkout's `app.js`; its cwd is the run dir (so `es.db` is the scratch DB); the port is listened on by that PID and nobody else; `/` renders the Setup Form; the scratch DB has both tables; the repo has no `es.db`. Prints the repo revision. Any `FAIL` line means do not drive this instance: clean it up and relaunch.

## Drive

Harness: `scripts/drive.cjs` (playwright-core driving the installed Google Chrome headless with a throwaway profile; override with `CHROME_PATH`). Run journeys through the control script:

```sh
$C drive <RUN_ID> setup            # features/setup-session.md
$C drive <RUN_ID> points-session   # features/points-session.md
$C drive <RUN_ID> timed-session    # features/timed-session.md
$C drive <RUN_ID> graphs           # features/session-graphs.md
$C db <RUN_ID> [sessionId]         # read-only JSON dump of the scratch DB
```

Each journey uses session ID `verify-<RUN_ID>-<journey>`, fills the real form at `/`, submits with the `Submit` button, and clicks session buttons by their stable `name` attribute (`button[name="left|middle|right"]`; all three are labelled `Click Me`). Form fields are addressed by id: `#sessionId`, `#sessionLength`, `#sessionLengthType`, `#continueAfterLimit`, `#buttonActive`, `#<side>ButtonShape`, `#<side>ButtonColor`, `#pointsAwarded`, `#clicksNeeded`, `#startingPoints`. Session state lives in `#pointsDisplay` and `#sessionOverDisplay`; graphs use `select[name="sessionId"]`, `#clickTimeline1`, `#clickTimeline2`. Every click waits for its `POST /log-event` 200 before the next assertion. A journey exits 0 only if every check passed; it prints `RESULT <journey>: PASS|FAIL (n/m checks)`.

For an ad-hoc step not covered by a journey, add a function to `journeys` in `drive.cjs` reusing `startSession`, `click`, `points`, `run.check`, `run.snap`; do not poke `/log-event` with curl, that skips the page logic under test.

The graphs page loads d3 from `cdnjs.cloudflare.com`; it needs network. A `requestfailed` line for d3 in `network.jsonl` means the journey failed for that reason, not because of the app.

## Evidence

Everything lands in `$STATE/evidence/<RUN_ID>/<journey>/`:

- `NN-<step>.png` full-page screenshot and `NN-<step>.aria.yml` ARIA snapshot (first line is the URL) for each user step, in order, including a `failure` snap when a check throws.
- `journey.log`: every action and `PASS`/`FAIL` check with timestamps; `result.json`: machine-readable checks and overall `ok`.
- `network.jsonl`: every document/fetch request with method, status and posted body (the `/log-event` payloads are the click record the study depends on); `console.log`: browser console.
- `db-*.json` / `graphs-response.json`: the stored side effect read back from the scratch DB (read-only) or the graphs API.
- `app.log` (copied at stop): server log for the run.

Proof standards: drive the real user path (form submit, button clicks, session picker), never insert rows or call `/log-event` directly. Capture the action and the resulting state (before/after screenshots), and verify the side effect in SQLite alongside what the page shows. A visible counter alone is not proof: the DB rows are what researchers analyse. There are no external systems to mock.

## Cleanup

```sh
$C cleanup <RUN_ID>    # stop + remove scratch run dir; evidence stays
$C stop <RUN_ID>       # stop only, keep the DB for inspection with `$C db`
```

`stop` kills only the PID recorded at launch, and only if that PID still runs this checkout's `app.js`; it never kills by name. `cleanup` then deletes `$STATE/runs/<RUN_ID>/` (scratch `es.db`, symlinks, pid/port files) and lists the surviving evidence under `$STATE/evidence/<RUN_ID>/`. Evidence is never deleted by the harness; remove old evidence dirs by hand when no longer needed. `$STATE/deps` is a reusable cache, not run state.

## Helpers

- `scripts/control-easterseals deps | launch [RUN_ID] | doctor RUN_ID | drive RUN_ID <journey> | db RUN_ID [sessionId] | stop RUN_ID | cleanup RUN_ID`: lifecycle wrapper (bash). Exits non-zero on any failure.
- `scripts/drive.cjs <journey|tables|dump> --base URL --db PATH --out DIR --session ID`: browser and DB driver; call it through `control-easterseals`, which sets `NODE_PATH` and the arguments.
- `scripts/remap-port.cjs`: `node -r` preload that rebinds the hardcoded `8001` to `VERIFY_PORT` on 127.0.0.1. Verification scaffolding only; the product code is unchanged.

Feature recipes: `features/README.md`. Keep the map current with `/maintain-verification-skill` when routes or views change.
