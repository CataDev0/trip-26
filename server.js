const express = require('express');
const sqlite = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
app.use(express.json());

// Simple Basic Authentication Middleware
app.use((req, res, next) => {
  const isHome = req.path === '/';
  const isFile = req.path.includes('.');
  const isPublicApi = req.path.startsWith('/api/') && (
    req.method === 'GET' || 
    req.path === '/api/visited' || 
    req.path === '/api/path'
  );

  if (!isHome && !isFile && !isPublicApi) {
    const b64auth = (req.headers.authorization || '').split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    if (login === 'natcotine' && password === 'Norway') {
      return next();
    }

    res.set('WWW-Authenticate', 'Basic realm="Authentication Required"');
    res.status(401).send('Authentication required.');
  } else {
    next();
  }
});

app.use(express.static('public'));

const db = sqlite('trip.db');

// Initialize database
db.prepare(`
  CREATE TABLE IF NOT EXISTS visited_locations (
    id INTEGER PRIMARY KEY
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

db.prepare(`
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    lat REAL,
    lng REAL
  )
`).run();

// Seed locations from JSON if database is empty
const count = db.prepare('SELECT COUNT(*) as count FROM locations').get();
if (count.count === 0) {
  try {
    const locationsPath = path.join(__dirname, 'locations.json');
    if (fs.existsSync(locationsPath)) {
      const locationsData = fs.readFileSync(locationsPath, 'utf8');
      const rawLocations = JSON.parse(locationsData);
      const insert = db.prepare('INSERT INTO locations (name, lat, lng) VALUES (?, ?, ?)');
      const insertMultiple = db.transaction((locs) => {
        for (const loc of locs) {
          if (loc.name && loc.lat && loc.lng) {
            insert.run(loc.name, loc.lat, loc.lng);
          }
        }
      });
      insertMultiple(rawLocations);
      console.log('Seeded database with locations.json');
    }
  } catch (e) {
    console.error('Error seeding database:', e);
  }
}

// API Endpoints

// Get predefined locations
app.get('/api/locations', (req, res) => {
  try {
    const locations = db.prepare('SELECT id, name, lat, lng FROM locations').all();
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
    const newLocations = req.body;
    const insert = db.prepare('INSERT INTO locations (id, name, lat, lng) VALUES (?, ?, ?, ?)');
    
    // Clear and insert
    db.transaction((locs) => {
      db.prepare('DELETE FROM locations').run();
      for (const loc of locs) {
        if (loc.name && loc.lat !== undefined && loc.lng !== undefined) {
          // If it has an existing ID, keep it, else let sqlite generate one
          if (loc.id !== undefined) {
             insert.run(loc.id, loc.name, loc.lat, loc.lng);
          } else {
             db.prepare('INSERT INTO locations (name, lat, lng) VALUES (?, ?, ?)').run(loc.name, loc.lat, loc.lng);
          }
        }
      }
    })(newLocations);
    
    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not save locations' });
  }
});

// Add a single location (used for saving attractions)
app.post('/api/locations/single', (req, res) => {
  try {
    const { name, lat, lng } = req.body;
    if (!name || lat === undefined || lng === undefined) {
      return res.status(400).json({ error: 'Missing name, lat, or lng' });
    }
    const info = db.prepare('INSERT INTO locations (name, lat, lng) VALUES (?, ?, ?)').run(name, lat, lng);
    res.json({ success: true, id: info.lastInsertRowid });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not save location' });
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