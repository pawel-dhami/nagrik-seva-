const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const cors = require('cors');
const multer = require('multer');
const serverless = require('serverless-http');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// serve static files from project root
app.use(express.static(path.join(__dirname, '..')));
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
const upload = multer({ dest: path.join(__dirname, '..', 'uploads/') });

// open or create database file
const db = new sqlite3.Database(path.join(__dirname, '..', 'data.db'));

// initialize schema
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS citizens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aadhaar TEXT UNIQUE,
      name TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS authorities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE,
      password TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      citizen_id INTEGER,
      priority TEXT,
      description TEXT,
      location TEXT,
      phone TEXT,
      ward TEXT,
      photos TEXT,
      anonymous_public INTEGER,
      anonymous_authority INTEGER,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(citizen_id) REFERENCES citizens(id)
    )
  `);
});

// seed authority account if missing
const DEFAULT_AUTH_EMAIL = 'admin@municipalcorp.gov.in';
const DEFAULT_AUTH_PASSWORD = 'password';
db.get('SELECT * FROM authorities WHERE email = ?', [DEFAULT_AUTH_EMAIL], (err, row) => {
  if (!row) {
    db.run('INSERT INTO authorities (email, password) VALUES (?, ?)', [DEFAULT_AUTH_EMAIL, DEFAULT_AUTH_PASSWORD]);
    console.log('created default authority account');
  }
});

const sessions = {}; // in-memory session map
function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

function authenticateCitizen(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing token' });
  }
  const token = auth.slice(7);
  const sess = sessions[token];
  if (!sess || sess.type !== 'citizen') {
    return res.status(401).json({ error: 'invalid token' });
  }
  req.user = sess;
  next();
}

function authenticateAuthority(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'missing token' });
  }
  const token = auth.slice(7);
  const sess = sessions[token];
  if (!sess || sess.type !== 'authority') {
    return res.status(401).json({ error: 'invalid token' });
  }
  req.user = sess;
  next();
}

app.post('/api/auth/citizen', (req, res) => {
  const { aadhaar, otp } = req.body;
  if (!aadhaar || !otp) {
    return res.status(400).json({ error: 'aadhaar and otp required' });
  }
  if (otp !== '123456') {
    return res.status(401).json({ error: 'invalid OTP' });
  }
  db.get('SELECT * FROM citizens WHERE aadhaar = ?', [aadhaar], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (row) {
      const token = generateToken();
      sessions[token] = { type: 'citizen', userId: row.id };
      return res.json({ token, user: { id: row.id, aadhaar: row.aadhaar } });
    }
    db.run('INSERT INTO citizens (aadhaar) VALUES (?)', [aadhaar], function(err) {
      if (err) return res.status(500).json({ error: err.message });
      const id = this.lastID;
      const token = generateToken();
      sessions[token] = { type: 'citizen', userId: id };
      res.json({ token, user: { id, aadhaar } });
    });
  });
});

app.post('/api/auth/authority', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password required' });
  }
  db.get('SELECT * FROM authorities WHERE email = ?', [email], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row || row.password !== password) {
      return res.status(401).json({ error: 'invalid credentials' });
    }
    const token = generateToken();
    sessions[token] = { type: 'authority', userId: row.id };
    res.json({ token, user: { id: row.id, email: row.email } });
  });
});

app.post('/api/reports', authenticateCitizen, upload.array('photos', 5), (req, res) => {
  const { description, location, phone, ward, priority } = req.body;
  if (!description || !location) {
    return res.status(400).json({ error: 'description and location required' });
  }
  const anonPub = 0;
  const anonAuth = 0;
  const photoPaths = (req.files || []).map(f => '/uploads/' + f.filename);
  db.run(
    `INSERT INTO reports (citizen_id, priority, description, location, phone, ward, photos, anonymous_public, anonymous_authority)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [req.user.userId, priority || 'medium', description, location, phone || '', ward || '', JSON.stringify(photoPaths), anonPub, anonAuth],
    function(err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.get('/api/reports', authenticateAuthority, (req, res) => {
  db.all('SELECT * FROM reports', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const parsed = rows.map(r => {
      if (r.photos) {
        try { r.photos = JSON.parse(r.photos); } catch {}
      } else {
        r.photos = [];
      }
      return r;
    });
    res.json(parsed);
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

module.exports = app;
module.exports.handler = serverless(app);
