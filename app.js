const express = require('express');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const port = 8001;

const db = new sqlite3.Database('setup.db');

db.serialize(() => {
  db.run("CREATE TABLE IF NOT EXISTS setup (id INTEGER PRIMARY KEY AUTOINCREMENT, sessionId TEXT, buttonActive TEXT, pointsAwarded INTEGER, clicksNeeded INTEGER, startingPoints INTEGER, sessionLength INTEGER)");
});

app.set('view engine', 'pug');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static('public'));

app.get('/', (req, res) => {
  res.render('setupForm');
});

app.post('/setup', (req, res) => {
  const { sessionId, buttonActive, pointsAwarded, clicksNeeded, startingPoints, sessionLength } = req.body;

  db.get("SELECT * FROM setup WHERE sessionId = ?", [sessionId], (err, row) => {
    if (err) {
      console.error(err.message);
      res.status(500).send("Internal Server Error");
    } else if (row) {
      res.status(400).send("Session ID already exists. Please enter a different one.");
    } else {
      db.run("INSERT INTO setup (sessionId, buttonActive, pointsAwarded, clicksNeeded, startingPoints, sessionLength) VALUES (?, ?, ?, ?, ?, ?)",
        [sessionId, buttonActive, pointsAwarded, clicksNeeded, startingPoints, sessionLength],
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

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});
