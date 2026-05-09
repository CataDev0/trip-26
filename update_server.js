const fs = require('fs');

let serverCode = fs.readFileSync('server.js', 'utf8');

// 1. Add table initialization and default loading
const tableInit = `
db.prepare(\`
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    lat REAL,
    lng REAL
  )
\`).run();

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
`;

serverCode = serverCode.replace(
  /db\.prepare\([\s\S]*?gps_path[\s\S]*?run\(\);/,
  match => match + '\n' + tableInit
);

// 2. Update GET /api/locations
const getLocations = `
app.get('/api/locations', (req, res) => {
  try {
    const locations = db.prepare('SELECT id, name, lat, lng FROM locations').all();
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: 'Could not load locations' });
  }
});
`;

serverCode = serverCode.replace(
  /app\.get\('\/api\/locations'[\s\S]*?}\);/,
  getLocations.trim()
);

// 3. Update POST /api/locations (Array replacement) and add Single add
const postLocations = `
// Update locations array based on UI edits
app.post('/api/locations', (req, res) => {
  try {
    const newLocations = req.body;
    const insert = db.prepare('INSERT INTO locations (name, lat, lng) VALUES (?, ?, ?)');
    
    // Clear and insert
    db.transaction((locs) => {
      db.prepare('DELETE FROM locations').run();
      for (const loc of locs) {
        if (loc.name && loc.lat && loc.lng) {
          insert.run(loc.name, loc.lat, loc.lng);
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
`;

serverCode = serverCode.replace(
  /app\.post\('\/api\/locations'[\s\S]*?}\);/,
  postLocations.trim()
);

fs.writeFileSync('server.js', serverCode);
