const express = require('express');
const sqlite = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(express.json());

// Simple Basic Authentication Middleware
app.use((req, res, next) => {
  const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
  const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

  if (login === 'natcotine' && password === 'Norway') {
    return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Authentication Required"');
  res.status(401).send('Authentication required.');
});

app.use(express.static('public'));

const db = sqlite('trip.db');

// Initialize database
db.prepare(`
  CREATE TABLE IF NOT EXISTS visited_places (
    name TEXT PRIMARY KEY
  )
`).run();

db.prepare(`
  CREATE TABLE IF NOT EXISTS gps_path (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lat REAL,
    lng REAL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// API Endpoints

// Get predefined locations
app.get('/api/locations', (req, res) => {
  try {
    const locationsPath = path.join(__dirname, 'locations.json');
    const locationsData = fs.readFileSync(locationsPath, 'utf8');
    const rawLocations = JSON.parse(locationsData);
    const locations = rawLocations.map((loc, index) => ({ id: index, ...loc }));
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: 'Could not load locations' });
  }
});

// Get visited locations
app.get('/api/visited', (req, res) => {
  const visited = db.prepare('SELECT id FROM visited_locations').all().map(row => row.id);
  res.json(visited);
});

// Mark location as visited
app.post('/api/visited', (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: 'Missing id' });
  
  db.prepare('INSERT OR IGNORE INTO visited_locations (id) VALUES (?)').run(id);
  res.json({ success: true });
});

// Save a GPS point to the path
app.post('/api/path', (req, res) => {
  const { lat, lng } = req.body;
  if (lat === undefined || lng === undefined) return res.status(400).json({ error: 'Missing lat or lng' });
  
  db.prepare('INSERT INTO gps_path (lat, lng) VALUES (?, ?)').run(lat, lng);
  res.json({ success: true });
});

// Get the full GPS path
app.get('/api/path', (req, res) => {
  const pathData = db.prepare('SELECT lat, lng, timestamp FROM gps_path ORDER BY timestamp ASC').all();
  res.json(pathData);
});

// Update locations based on UI edits
app.post('/api/locations', (req, res) => {
  try {
    const locationsPath = path.join(__dirname, 'locations.json');
    // Save pretty formatted JSON exactly as an array
    fs.writeFileSync(locationsPath, JSON.stringify(req.body, null, 2), 'utf8');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Could not save locations' });
  }
});

// SPA fallback for frontend router
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  const nets = os.networkInterfaces();
  const results = [];
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
      if (net.family === 'IPv4' && !net.internal) {
        results.push(net.address);
      }
    }
  }
  const localIp = results.length > 0 ? results[0] : 'localhost';

  console.log(`Server is running locally at http://localhost:${PORT}`);
  console.log(`Access on your phone using   http://${localIp}:${PORT}`);
});