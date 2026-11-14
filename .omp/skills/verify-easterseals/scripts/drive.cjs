#!/usr/bin/env node
// Browser + DB driver for verify-easterseals. Run through `control-easterseals drive|db`,
// which sets NODE_PATH to the scratch deps (playwright-core, sqlite3).
'use strict'
const fs = require('fs')
const path = require('path')
const sqlite3 = require('sqlite3')

const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

function parseArgs (argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i]
    else out._.push(argv[i])
  }
  return out
}

function query (dbPath, sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) return reject(err)
      db.all(sql, params, (e, rows) => { db.close(); e ? reject(e) : resolve(rows) })
    })
  })
}

async function events (dbPath, sessionId) {
  const rows = await query(dbPath, 'SELECT event, value, timestamp FROM session_event_log WHERE sessionId = ? ORDER BY rowid', [sessionId])
  return rows.map((r) => ({ ...r, value: JSON.parse(r.value) }))
}

class Run {
  constructor (args) {
    this.args = args
    this.out = args.out
    this.n = 0
    this.checks = []
    fs.mkdirSync(this.out, { recursive: true })
    this.logFile = path.join(this.out, 'journey.log')
    fs.writeFileSync(this.logFile, '')
  }

  log (line) {
    const l = `${new Date().toISOString()} ${line}`
    console.log(l)
    fs.appendFileSync(this.logFile, l + '\n')
  }

  check (ok, what) {
    this.checks.push({ ok: !!ok, what })
    this.log(`${ok ? 'PASS' : 'FAIL'} ${what}`)
    if (!ok) throw new Error(`check failed: ${what}`)
  }

  async snap (page, name) {
    const base = path.join(this.out, `${String(++this.n).padStart(2, '0')}-${name}`)
    await page.screenshot({ path: `${base}.png`, fullPage: true })
    fs.writeFileSync(`${base}.aria.yml`, `# url: ${page.url()}\n${await page.locator('body').ariaSnapshot()}\n`)
    this.log(`evidence ${path.basename(base)}.png/.aria.yml (${page.url()})`)
  }

  saveJson (name, data) {
    fs.writeFileSync(path.join(this.out, name), JSON.stringify(data, null, 2) + '\n')
    this.log(`evidence ${name}`)
  }
}

async function openBrowser (run) {
  const { chromium } = require('playwright-core')
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const net = fs.createWriteStream(path.join(run.out, 'network.jsonl'))
  page.on('response', async (r) => {
    const req = r.request()
    if (!['document', 'fetch', 'xhr'].includes(req.resourceType())) return
    net.write(JSON.stringify({ method: req.method(), url: r.url(), status: r.status(), post: req.postData() || undefined }) + '\n')
  })
  page.on('requestfailed', (req) => net.write(JSON.stringify({ method: req.method(), url: req.url(), failed: req.failure()?.errorText }) + '\n'))
  page.on('console', (m) => fs.appendFileSync(path.join(run.out, 'console.log'), `${m.type()} ${m.text()}\n`))
  return { browser, page, close: async () => { await browser.close(); net.end() } }
}

const logEvent = (page, event) => page.waitForResponse((r) => {
  if (!r.url().endsWith('/log-event') || r.request().method() !== 'POST') return false
  try { return JSON.parse(r.request().postData()).event === event } catch { return false }
})

// Fill and submit the real setup form at "/" the way a researcher does.
async function submitSetup (page, base, cfg) {
  await page.goto(`${base}/`)
  await page.locator('#sessionId').fill(cfg.sessionId)
  await page.locator('#sessionLength').fill(String(cfg.sessionLength))
  await page.locator('#sessionLengthType').selectOption(cfg.sessionLengthType)
  if (cfg.continueAfterLimit) await page.locator('#continueAfterLimit').check()
  await page.locator('#buttonActive').selectOption(cfg.buttonActive)
  for (const side of ['left', 'middle', 'right']) {
    if (cfg[`${side}ButtonShape`]) await page.locator(`#${side}ButtonShape`).selectOption(cfg[`${side}ButtonShape`])
    if (cfg[`${side}ButtonColor`]) await page.locator(`#${side}ButtonColor`).fill(cfg[`${side}ButtonColor`])
  }
  await page.locator('#pointsAwarded').fill(String(cfg.pointsAwarded))
  await page.locator('#clicksNeeded').fill(String(cfg.clicksNeeded))
  await page.locator('#startingPoints').fill(String(cfg.startingPoints))
}

async function startSession (run, page, cfg) {
  await submitSetup(page, run.args.base, cfg)
  const started = logEvent(page, 'start')
  await page.getByRole('button', { name: 'Submit' }).click()
  await page.waitForURL(`${run.args.base}/session/${encodeURIComponent(cfg.sessionId)}`)
  run.check((await started).status() === 200, `session ${cfg.sessionId} page logged its start event (200)`)
}

async function click (page, side, extraEvents = []) {
  const waits = [logEvent(page, 'click'), ...extraEvents.map((e) => logEvent(page, e))]
  await page.locator(`button[name="${side}"]`).click()
  for (const r of await Promise.all(waits)) if (r.status() !== 200) throw new Error(`log-event ${r.status()}`)
}

const points = async (page) => (await page.locator('#pointsDisplay').innerText()).trim()

const journeys = {
  async setup (run, page) {
    const { base, db } = run.args
    const id = run.args.session
    await page.goto(`${base}/`)
    run.check(await page.title() === 'Setup Form', 'setup form renders at /')
    await run.snap(page, 'setup-form')

    await startSession(run, page, {
      sessionId: id, sessionLength: 5, sessionLengthType: 'points', buttonActive: 'left',
      leftButtonShape: 'circle', leftButtonColor: '#ff0000', middleButtonShape: 'square', middleButtonColor: '#0000ff',
      rightButtonShape: 'rectangle', rightButtonColor: '#00ff00', pointsAwarded: 1, clicksNeeded: 1, startingPoints: 2
    })
    run.check(await points(page) === '2', 'session page shows starting points 2')
    run.check(await page.locator('button[type="submit"]').count() === 3, 'session page shows 3 buttons')
    const left = page.locator('button[name="left"]')
    run.check(await left.getAttribute('class') === 'circle', 'left button uses configured shape "circle"')
    run.check((await left.evaluate((b) => getComputedStyle(b).backgroundColor)) === 'rgb(255, 0, 0)', 'left button uses configured color #ff0000')
    await run.snap(page, 'session-page')

    const cfgRows = await query(db, 'SELECT config FROM session_configuration WHERE sessionId = ?', [id])
    run.check(cfgRows.length === 1, 'DB: one session_configuration row')
    const stored = JSON.parse(cfgRows[0].config)
    run.check(stored.leftButtonShape === 'circle' && stored.pointsAwarded === '1' && stored.startingPoints === '2' && stored.sessionLengthType === 'points',
      'DB: stored config matches submitted form')
    const ev = await events(db, id)
    run.check(ev.length === 1 && ev[0].event === 'start' && ev[0].value.pointsCounter === 2, 'DB: exactly one start event with pointsCounter 2')

    await submitSetup(page, base, { sessionId: id, sessionLength: 1, sessionLengthType: 'seconds', buttonActive: 'left', pointsAwarded: 1, clicksNeeded: 1, startingPoints: 0 })
    const [dup] = await Promise.all([page.waitForResponse((r) => r.url().endsWith('/setup')), page.getByRole('button', { name: 'Submit' }).click()])
    await page.waitForLoadState()
    run.check(dup.status() === 400, 'duplicate session ID is rejected with 400')
    run.check((await page.locator('body').innerText()).includes('Session ID already exists. Please enter a different one.'), 'duplicate shows "Session ID already exists" message')
    await run.snap(page, 'duplicate-rejected')
    run.check((await query(db, 'SELECT count(*) n FROM session_configuration WHERE sessionId = ?', [id]))[0].n === 1, 'DB: still one config row after duplicate')

    const missing = await page.goto(`${base}/session/${id}-missing`)
    run.check(missing.status() === 404 && (await page.locator('body').innerText()).includes('Config not found'), 'unknown session URL returns 404 "Config not found"')
    await run.snap(page, 'unknown-session')
    run.saveJson('db-session.json', { config: stored, events: ev })
  },

  async 'points-session' (run, page) {
    const { db } = run.args
    const id = run.args.session
    await startSession(run, page, {
      sessionId: id, sessionLength: 3, sessionLengthType: 'points', buttonActive: 'left',
      pointsAwarded: 1, clicksNeeded: 2, startingPoints: 0
    })
    await run.snap(page, 'session-start')
    await click(page, 'middle')
    run.check(await points(page) === '0', 'inactive middle button click awards nothing (0)')
    const expected = ['0', '1', '1', '2', '2']
    for (let i = 0; i < 5; i++) {
      await click(page, 'left')
      run.check(await points(page) === expected[i], `left click ${i + 1}: points ${expected[i]}`)
    }
    await run.snap(page, 'before-limit')
    await click(page, 'left', ['end'])
    run.check(await points(page) === '3', 'left click 6: points capped at 3')
    run.check((await page.locator('#sessionOverDisplay').innerText()).trim() === 'Max points reached, session ended.', 'session over message shown')
    for (const side of ['left', 'middle', 'right']) run.check(await page.locator(`button[name="${side}"]`).isDisabled(), `${side} button disabled after limit`)
    await run.snap(page, 'session-ended')

    const ev = await events(db, id)
    const count = (e) => ev.filter((x) => x.event === e).length
    run.check(count('start') === 1 && count('click') === 7 && count('end') === 1, `DB: 1 start, 7 click, 1 end events (got ${count('start')}/${count('click')}/${count('end')})`)
    const end = ev.find((x) => x.event === 'end').value
    run.check(end.pointsEarnedFinal === 3 && end.limitReached === true, 'DB: end event pointsEarnedFinal 3, limitReached true')
    const last = ev.filter((x) => x.event === 'click').sort((a, b) => a.value.total - b.value.total).pop().value
    run.check(last.total === 7 && last.left === 6 && last.middle === 1 && last.pointsCounter === 3, 'DB: final click totals left 6, middle 1, total 7, points 3')
    run.saveJson('db-events.json', ev)
  },

  async 'timed-session' (run, page) {
    const { db } = run.args
    const id = run.args.session
    await startSession(run, page, {
      sessionId: id, sessionLength: 2, sessionLengthType: 'seconds', buttonActive: 'right',
      pointsAwarded: 5, clicksNeeded: 1, startingPoints: 0
    })
    const ended = logEvent(page, 'end')
    await click(page, 'right')
    run.check(await points(page) === '5', 'active right click awards 5 points')
    await run.snap(page, 'timed-running')
    await ended
    await page.locator('#sessionOverDisplay', { hasText: 'Time limit reached. Session ended.' }).waitFor({ timeout: 5000 })
    run.check(await page.locator('button[name="right"]').isDisabled(), 'buttons disabled after time limit')
    await run.snap(page, 'timed-ended')
    let ev = await events(db, id)
    const end = ev.find((x) => x.event === 'end')
    run.check(end && end.value.limitReached === true && end.value.pointsEarnedFinal === 5, 'DB: end event limitReached true, pointsEarnedFinal 5')

    const cid = `${id}-continue`
    const cEnded = logEvent(page, 'end')
    await startSession(run, page, {
      sessionId: cid, sessionLength: 1, sessionLengthType: 'seconds', continueAfterLimit: true, buttonActive: 'left',
      pointsAwarded: 1, clicksNeeded: 1, startingPoints: 0
    })
    await cEnded
    run.check(!(await page.locator('button[name="left"]').isDisabled()), 'continue-after-limit: buttons stay enabled after time limit')
    run.check((await page.locator('#sessionOverDisplay').innerText()).trim() === '', 'continue-after-limit: no session over message')
    await click(page, 'left')
    run.check(await points(page) === '1', 'continue-after-limit: click after limit still awards points')
    await run.snap(page, 'continue-after-limit')
    const cev = await events(db, cid)
    run.check(cev.map((e) => e.event).join(',') === 'start,end,click', `DB: continue session events start,end,click (got ${cev.map((e) => e.event).join(',')})`)
    ev = { [id]: ev, [cid]: cev }
    run.saveJson('db-events.json', ev)
  },

  async graphs (run, page) {
    const { base } = run.args
    const id = run.args.session
    await startSession(run, page, {
      sessionId: id, sessionLength: 100, sessionLengthType: 'points', buttonActive: 'left',
      pointsAwarded: 1, clicksNeeded: 1, startingPoints: 0
    })
    for (const side of ['left', 'left', 'middle', 'left', 'right']) await click(page, side)
    run.check(await points(page) === '3', 'seeded 5 clicks (3 active left) -> 3 points')

    await page.goto(`${base}/`)
    await page.getByRole('link', { name: 'View Graphs' }).click()
    await page.waitForURL(`${base}/graphs`)
    run.check(await page.getByRole('heading', { name: 'Session Data' }).isVisible(), 'graphs page heading "Session Data"')
    run.check(await page.locator(`select[name="sessionId"] option[value="${id}"]`).count() === 1, `session picker lists ${id}`)
    await run.snap(page, 'graphs-picker')
    const [resp] = await Promise.all([
      page.waitForResponse((r) => r.url() === `${base}/graphs/${id}`),
      page.locator('select[name="sessionId"]').selectOption(id)
    ])
    const data = await resp.json()
    run.saveJson('graphs-response.json', data)
    run.check(data.allClicks.length === 5 && data.startEvent && data.endEvent === undefined, 'GET /graphs/:id returns 5 clicks, a start event, no end event')
    await page.locator('#clickTimeline2 svg circle').nth(4).waitFor({ timeout: 10000 })
    run.check(await page.locator('#clickTimeline2 svg circle').count() === 5, 'total-clicks chart plots 5 dots')
    const per = async (s) => page.locator(`#clickTimeline1 svg circle.dot.${s}`).count()
    run.check(await per('left') === 3 && await per('middle') === 1 && await per('right') === 1, 'per-button chart plots left 3, middle 1, right 1')
    await run.snap(page, 'graphs-rendered')
  }
}

async function main () {
  const args = parseArgs(process.argv.slice(2))
  const cmd = args._[0]
  if (cmd === 'tables') {
    const rows = await query(args.db, "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    console.log(rows.map((r) => r.name).join(','))
    return
  }
  if (cmd === 'dump') {
    const where = args.session ? ' WHERE sessionId = ?' : ''
    const p = args.session ? [args.session] : []
    console.log(JSON.stringify({
      session_configuration: (await query(args.db, `SELECT * FROM session_configuration${where}`, p)).map((r) => ({ ...r, config: JSON.parse(r.config) })),
      session_event_log: (await query(args.db, `SELECT * FROM session_event_log${where} ORDER BY rowid`, p)).map((r) => ({ ...r, value: JSON.parse(r.value) }))
    }, null, 2))
    return
  }
  const journey = journeys[cmd]
  if (!journey) throw new Error(`unknown journey "${cmd}"; one of: ${Object.keys(journeys).join(', ')}`)
  for (const k of ['base', 'db', 'out', 'session']) if (!args[k]) throw new Error(`missing --${k}`)
  const run = new Run(args)
  run.log(`journey ${cmd} session ${args.session} base ${args.base}`)
  const b = await openBrowser(run)
  let ok = false
  try {
    await journey(run, b.page)
    ok = true
  } catch (e) {
    run.log(`ERROR ${e.message}`)
    await run.snap(b.page, 'failure').catch(() => {})
  } finally {
    await b.close()
    run.saveJson('result.json', { journey: cmd, session: args.session, ok, checks: run.checks })
    run.log(`RESULT ${cmd}: ${ok ? 'PASS' : 'FAIL'} (${run.checks.filter((c) => c.ok).length}/${run.checks.length} checks)`)
  }
  process.exitCode = ok ? 0 : 1
}

main().catch((e) => { console.error(e.stack || e); process.exit(1) })
