const express = require('express')
const sqlite3 = require('sqlite3').verbose()

const app = express()
const port = 8001

const db = new sqlite3.Database('es.db', (err) => {
  if (err) {
    throw err
  } else {
    console.log('Connected to the database.')
  }

  db.exec('PRAGMA foreign_keys = ON;', function (error) {
    if (error) {
      console.error("===ERROR=== Pragma statement didn't work.")
    } else {
      console.log('Foreign Key Enforcement is on.')
    }
  })

  db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS session_configuration (sessionId TEXT NOT NULL PRIMARY KEY, config TEXT)', [], (err) => {
      if (err) {
        throw err.message
      } else {
        console.log('Session config table setup is ready.')
      }
    })
  })

  db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS session_event_log (sessionId TEXT, event TEXT, value TEXT, timestamp DATETIME, FOREIGN KEY (sessionId) REFERENCES session_configuration(sessionId))', [], (err) => {
      if (err) {
        throw err.message
      } else {
        console.log('Session event log table setup is ready.')
      }
    })
  })
})

app.set('view engine', 'pug')
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(express.static('public'))

app.get('/', (req, res) => {
  res.render('setupForm')
})

app.post('/setup', (req, res) => {
  const data = req.body
  // TODO validation?

  db.get('SELECT * FROM session_configuration WHERE sessionId = ?', [data.sessionId], (err, row) => {
    if (err) {
      console.error(err.message)
      res.status(500).send('Internal Server Error')
    } else if (row) {
      console.error('Session not started, ID already exists.')
      res.status(400).send('Session ID already exists. Please enter a different one.')
    } else {
      db.run('INSERT INTO session_configuration (sessionId, config) VALUES (?, ?)', [data.sessionId, JSON.stringify(data)], (err) => {
        if (err) {
          console.error(err.message)
          res.status(500).send('Internal Server Error')
        } else {
          console.log(`Logged config for session ${data.sessionId}`)

          res.redirect(`/session/${data.sessionId}`)
        }
      })
    }
  })
})

app.get('/session/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId
  // TODO dont let a session get logged if there is already events for one?

  db.get('SELECT config FROM session_configuration WHERE sessionId = ?', [sessionId], (err, config) => {
    if (err) {
      console.error(err.message)
      res.status(500).send('Internal Server Error')
    } else if (!config) {
      console.error('No config found for session')
      res.status(404).send('Config not found')
    } else {
      res.render('session', { config: JSON.parse(config.config) })
    }
  })
})

app.post('/log-event', (req, res) => {
  const { sessionId, event } = req.body
  const timestamp = req.body.timestamp ? req.body.timestamp : new Date().toISOString()
  const value = JSON.stringify(req.body.value)

  db.get('SELECT sessionId FROM session_configuration WHERE sessionId = ?', [sessionId], (err, row) => {
    if (err) {
      console.error(err.message)
      res.status(500).send('Internal Server Error')
    } else if (!row) {
      console.error(`Session ${sessionId} not found`)
      res.status(404).send('Session not found')
    } else {
      db.run('INSERT INTO session_event_log (sessionId, event, value, timestamp) VALUES (?, ?, ?, ?)', [sessionId, event, value, timestamp], (err) => {
        if (err) {
          console.error(err.message)
        } else {
          console.log(`Logged event ${event} with value ${value}`)
          res.send('Logged event')
        }
      })
    }
  })
})

app.get('/graphs', (req, res) => {
  const query = 'SELECT DISTINCT sessionId FROM session_configuration ORDER BY sessionId ASC'

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error(err.message)
      res.status(500).send('Internal Server Error')
    } else {
      res.render('sessionGraphs', { data: rows })
    }
  })
})

app.get('/graphs/:sessionId', async (req, res) => {
  const sessionId = req.params.sessionId

  try {
    // Session Config
    const sessionConfig = await new Promise((resolve, reject) => {
      db.get('SELECT config FROM session_configuration WHERE sessionId = ? LIMIT 1', [sessionId], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
    // Session Start
    const startEvent = await new Promise((resolve, reject) => {
      db.get('SELECT value, timestamp FROM session_event_log WHERE sessionId = ? AND event = ? LIMIT 1', [sessionId, 'start'], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
    // Session End
    const endEvent = await new Promise((resolve, reject) => {
      db.get('SELECT value, timestamp FROM session_event_log WHERE sessionId = ? AND event = ? LIMIT 1', [sessionId, 'end'], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })
    // All Clicks
    const allClicks = await new Promise((resolve, reject) => {
      db.all("SELECT value, timestamp FROM session_event_log WHERE sessionId = ? AND event = 'click' ORDER BY timestamp ASC", [sessionId], (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })

    const responseData = {
      sessionConfig,
      startEvent,
      endEvent,
      allClicks
    }

    res.json(responseData)
  } catch (error) {
    console.error('Error fetching session data:', error)
    res.status(500).send('Internal Server Error')
  }
})

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`)
})
