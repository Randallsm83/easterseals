const express = require('express');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = 8001;

const db = new sqlite3.Database('es.db', (err) => {
  if (err) {
    throw err;
  } else {
    console.log('Connected to the database.');

    db.exec('PRAGMA foreign_keys = ON;', function(error)  {
    if (error){
        console.error("===ERROR=== Pragma statement didn't work.");
    } else {
        console.log("Foreign Key Enforcement is on.");
    }
});

    db.serialize(() => {
      db.run("CREATE TABLE IF NOT EXISTS setup (sessionId TEXT PRIMARY KEY, buttonActive TEXT, leftButtonShape TEXT, leftButtonColor TEXT, middleButtonShape TEXT, middleButtonColor TEXT, rightButtonShape TEXT, rightButtonColor TEXT, pointsAwarded INTEGER, clicksNeeded INTEGER, startingPoints INTEGER, sessionLength INTEGER, sessionLengthType TEXT, continueAfterLimit BOOLEAN)", [], (err) => {
        if (err) {
          throw err.message
        } else {
          console.log('Setup table setup is ready.');
        }
      });
    });

    db.serialize(() => {
      db.run("CREATE TABLE IF NOT EXISTS session (sessionId TEXT, clickedButton TEXT, timestamp DATETIME, FOREIGN KEY (sessionId) REFERENCES setup(sessionId))", [], (err) => {
        if (err) {
          throw err.message
        } else {
          console.log('Session table setup is ready.');
        }
      });
    });

    db.serialize(() => {
      db.run("CREATE TABLE IF NOT EXISTS final (sessionId TEXT PRIMARY KEY, finalPoints INTEGER, FOREIGN KEY (sessionId) REFERENCES setup(sessionId))", [], (err) => {
        if (err) {
          throw err.message
        } else {
          console.log('Final table setup is ready.');
        }
      });
    });
  }
});

app.set('view engine', 'pug');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.render('setupForm');
});

app.post('/setup', (req, res) => {
  const { sessionId, buttonActive, leftButtonShape, leftButtonColor, middleButtonShape, middleButtonColor, rightButtonShape, rightButtonColor, pointsAwarded, clicksNeeded, startingPoints, sessionLength, sessionLengthType, continueAfterLimit } = req.body;

  const continueAfterLimitBool = continueAfterLimit === 'on';

  db.get("SELECT * FROM setup WHERE sessionId = ?", [sessionId], (err, row) => {
    if (err) {
      console.error(err.message);
      res.status(500).send("Internal Server Error");
    } else if (row) {
      res.status(400).send("Session ID already exists. Please enter a different one.");
    } else {
      db.run("INSERT INTO setup (sessionId, buttonActive, leftButtonShape, leftButtonColor, middleButtonShape, middleButtonColor, rightButtonShape, rightButtonColor, pointsAwarded, clicksNeeded, startingPoints, sessionLength, sessionLengthType, continueAfterLimit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [sessionId, buttonActive, leftButtonShape, leftButtonColor, middleButtonShape, middleButtonColor, rightButtonShape, rightButtonColor, pointsAwarded, clicksNeeded, startingPoints, sessionLength, sessionLengthType, continueAfterLimitBool],
        (err) => {
          if (err) {
            console.error(err.message);
            res.status(500).send("Internal Server Error");
          } else {
            res.redirect(`/session/${sessionId}`);
          }
      });
    }
  });
});

app.get('/session/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;

  db.get("SELECT * FROM setup WHERE sessionId = ?", [sessionId], (err, row) => {
    if (err) {
      console.error(err.message);
      res.status(500).send("Internal Server Error");
    } else if (!row) {
      res.status(404).send("Session not found");
    } else {
      res.render('session', { session: row });
    }
  });
});

app.post('/log-click', (req, res) => {
  const { sessionId, clickedButton } = req.body;
  const timestamp = new Date().toISOString();

  db.get("SELECT * FROM setup WHERE sessionId = ?", [sessionId], (err, row) => {
    if (err) {
      console.error(err.message);
      res.status(500).send("Internal Server Error");
    } else if (!row) {
      res.status(404).send("Invalid session, not found");
    } else {
      db.run("INSERT INTO session (sessionId, clickedButton, timestamp) VALUES (?, ?, ?)", [sessionId, clickedButton, timestamp], (err) => {
        if (err) {
          console.error(err.message);
        } else {
          res.send("Logged click");
        }
      });
    }
  });
});

app.post('/log-final', (req, res) => {
  const { sessionId, finalPoints } = req.body;

  db.get("SELECT * FROM setup WHERE sessionId = ?", [sessionId], (err, row) => {
    if (err) {
      console.error(err.message);
      res.status(500).send("Internal Server Error");
    } else if (!row) {
      res.status(404).send("Invalid session, not found");
    }
  });
  db.get("SELECT * FROM final WHERE sessionId = ?", [sessionId], (err, row) => {
    if (err) {
      console.error(err.message);
      return res.status(500).send("Internal Server Error");
    } else if (row) {
      console.error(`Session ${sessionId} already has points? Final of ${finalPoints} not entered.`);
      res.status(500).send("Points already exist in the database for this session?");
    }
  });

  db.run("INSERT INTO final (sessionId, finalPoints) VALUES (?, ?)", [sessionId, finalPoints], (err) => {
    if (err) {
      console.error(err.message);
    } else {
      console.log(`Logged ${finalPoints} points for session ${sessionId}`);
      res.send(`Logged ${finalPoints} points for session ${sessionId}`);
    }
  });
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

