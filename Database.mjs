export function initializeDatabase(db) {
  db.prepare(
    `
      CREATE TABLE IF NOT EXISTS visited_locations (
        id INTEGER PRIMARY KEY
      )
    `,
  ).run();

  db.prepare(
    `
      CREATE TABLE trips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ended_at DATETIME,
        name TEXT
      );
      `
  ).run();

  db.prepare(
    `
      CREATE TABLE IF NOT EXISTS gps_path (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lat REAL,
        lng REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `,
  ).run();

  db.prepare(
    `
      CREATE TABLE IF NOT EXISTS locations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        lat REAL,
        lng REAL
      )
    `,
  ).run();

  addColumnIfMissing(db, 'gps_path', 'trip_id', 'INTEGER REFERENCES trips(id)');
  if (!columnExists(db, 'gps_path', 'current_speed')) {
  }
  addColumnIfMissing(db, 'gps_path', 'current_speed', 'INTEGER');
}

function columnExists(db, table, column) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  return columns.some((col) => col.name === column);
}

function addColumnIfMissing(db, table, column, definition) {
  if (!columnExists(db, table, column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}
