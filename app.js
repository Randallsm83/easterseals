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

  db.serialize(() => {
    db.run("CREATE TABLE IF NOT EXISTS session (sessionId TEXT, event TEXT, value TEXT, timestamp DATETIME)", [], (err) => {
      if (err) {
        throw err.message
      } else {
        console.log('Session table setup is ready.')
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
  //TODO validation?

  db.get("SELECT * FROM session WHERE sessionId = ?", [data.sessionId], (err, row) => {
    if (err) {
      console.error(err.message)
      res.status(500).send("Internal Server Error")
    } else if (row) {
      console.error('Session not started, ID already exists.')
      res.status(400).send("Session ID already exists. Please enter a different one.")
    } else {
      const timestamp = new Date().toISOString()

      db.run("INSERT INTO session (sessionId, event, value, timestamp) VALUES (?, ?, ?, ?)", [data.sessionId, 'config', JSON.stringify(data), timestamp], (err) => {
        if (err) {
          console.error(err.message)
          res.status(500).send("Internal Server Error")
        } else {
          console.log(`Logged config for session ${data.sessionId}`)
          db.run("INSERT INTO session (sessionId, event, value, timestamp) VALUES (?, ?, ?, ?)", [data.sessionId, 'session', 'start', timestamp], (err) => {
            if (err) {
              console.error(err.message)
            } else {
              console.log('Logged event session with value start')
            }
          })

          res.redirect(`/session/${data.sessionId}`)
        }
      })
    }
  })
})

app.get('/session/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId

  db.get("SELECT value FROM session WHERE sessionId = ? and event = ?", [sessionId, 'config'], (err, config) => {
    if (err) {
      console.error(err.message)
      res.status(500).send("Internal Server Error")
    } else if (!config) {
      console.error('No config found for session')
      res.status(404).send("Config not found")
    } else {
      res.render('session', { config: JSON.parse(config.value) })
    }
  })
})

app.post('/log-event', (req, res) => {
  const { sessionId, event, value } = req.body
  let timestamp = req.body.timestamp ? req.body.timestamp : new Date().toISOString()

  db.run("INSERT INTO session (sessionId, event, value, timestamp) VALUES (?, ?, ?, ?)", [sessionId, event, value, timestamp], (err) => {
    if (err) {
      console.error(err.message)
      return
    } else {
      console.log(`Logged event ${event} with value ${value}`)
      res.send("Logged event")
    }
  })
})

app.get('/graphs', (req, res) => {
  const query = `SELECT DISTINCT sessionId FROM session ORDER BY sessionId ASC`

  db.all(query, [], (err, rows) => {
    if (err) {
      console.error(err.message)
      res.status(500).send("Internal Server Error")
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
      db.get("SELECT value FROM session WHERE sessionId = ? AND event = 'config' LIMIT 1", [sessionId], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })

    // Session Start Time
    const startTime = await new Promise((resolve, reject) => {
      db.get("SELECT timestamp FROM session WHERE sessionId = ? AND event = 'session' AND value = 'start' ORDER BY timestamp ASC LIMIT 1", [sessionId], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })

    // Session End Time (Limit Reached)
    const endTime = await new Promise((resolve, reject) => {
      db.get("SELECT timestamp FROM session WHERE sessionId = ? AND event = 'session' AND value = 'end' ORDER BY timestamp DESC LIMIT 1", [sessionId], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })

    // First Click
    const firstClick = await new Promise((resolve, reject) => {
      db.get("SELECT timestamp, value FROM session WHERE sessionId = ? AND event = 'click' ORDER BY timestamp ASC LIMIT 1", [sessionId], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })

    // Last Click
    const lastClick = await new Promise((resolve, reject) => {
      db.get("SELECT timestamp, value FROM session WHERE sessionId = ? AND event = 'click' ORDER BY timestamp DESC LIMIT 1", [sessionId], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })

    // Time To First Click
    let timeToFirstClick
    if (startTime && firstClick) {
      timeToFirstClick = new Date(firstClick.timestamp) - new Date(startTime.timestamp)
    }

     // All Clicks
    const allClicks = await new Promise((resolve, reject) => {
      db.all("SELECT timestamp, value FROM session WHERE sessionId = ? AND event = 'click' ORDER BY timestamp ASC", [sessionId], (err, rows) => {
        if (err) reject(err)
        else resolve(rows)
      })
    })

    // Count of Each Button Clicked
    // const buttonCounts = await new Promise((resolve, reject) => {
      // db.all("SELECT value, COUNT(*) as count FROM session WHERE sessionId = ? AND event = 'click' GROUP BY value", [sessionId], (err, rows) => {
        // if (err) reject(err)
        // else resolve(rows)
      // })
    // })
    // const buttonCountsHash = buttonCounts.reduce((acc, current) => {
      // acc[current.value] = current.count
      // return acc
    // }, {})

    // Add Total Clicks Overall
    // const totalClicks = buttonCounts.reduce((acc, current) => acc + current.count, 0)
    // buttonCountsHash['total'] = totalClicks

    // Points Awarded
    const pointsAwarded = await new Promise((resolve, reject) => {
      db.all("SELECT timestamp, value FROM session WHERE sessionId = ? AND event = 'pointsAwarded' ORDER BY timestamp ASC", [sessionId], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })

    // Points Tally
    const pointsTally = await new Promise((resolve, reject) => {
      db.all("SELECT timestamp, value FROM session WHERE sessionId = ? AND event = 'pointsTally' ORDER BY timestamp ASC", [sessionId], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })

    // Final Points
    const pointsFinal = await new Promise((resolve, reject) => {
      db.get("SELECT value FROM session WHERE sessionId = ? AND event = 'pointsFinal' LIMIT 1", [sessionId], (err, row) => {
        if (err) reject(err)
        else resolve(row)
      })
    })

    const responseData = {
      sessionConfig: sessionConfig ? sessionConfig.value : null,
      startTime: startTime ? startTime.timestamp : null,
      endTime: endTime ? endTime.timestamp : null,
      firstClick: firstClick,// ? firstClick : null,
      lastClick: lastClick,// ? firstClick : null,
      timeToFirstClick: timeToFirstClick ? timeToFirstClick / 1000 : null,
      allClicks: allClicks,
      // buttonCounts: buttonCountsHash,
      pointsAwarded,
      pointsTally,
      pointsFinal: pointsFinal ? pointsFinal.value : null,
    }
    console.log(responseData)

    res.json(responseData)
  } catch (error) {
    console.error('Error fetching session data:', error)
    res.status(500).send("Internal Server Error")
  }
})

// app.get('/session/logs/:sessionId', (req, res) => {
  // const { sessionId } = req.params
//
  // const query = `SELECT event, timestamp FROM session WHERE sessionId = ? AND event IN ('start', 'click', 'final') ORDER BY timestamp ASC`
//
  // db.all(query, [sessionId], (err, rows) => {
    // if (err) {
      // console.error(err.message)
      // res.status(500).send("Internal Server Error")
    // } else {
      // res.json(rows)
    // }
  // })
// })

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`)
})

