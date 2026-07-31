import { Utils } from './Utils.mjs'

/**
 * Initializes the database schema.
 * @param {import('better-sqlite3').Database} db
 */
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
      CREATE TABLE IF NOT EXISTS trips (
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

  if (!columnExists(db, 'gps_path', 'trip_id')) {
    db.prepare(`ALTER TABLE gps_path ADD COLUMN trip_id INTEGER REFERENCES trips(id)`).run();
    migrateTripIds(db);
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

/**
 * Initializes the database schema.
 * @param {import('better-sqlite3').Database} db
 */
function migrateTripIds(db) {
  const unmigrated = db.prepare(`SELECT COUNT(*) as count FROM gps_path WHERE trip_id IS NULL`).get();
  if (unmigrated.count === 0) {
    console.log("Migrate Trip IDs: All points already have a trip_id — skipping migration.");
    return;
  }

  const gpsPathRows = db.prepare(`SELECT * FROM gps_path ORDER BY id`).all();

  if (gpsPathRows.length === 0) {
    console.log("Migrate Trip IDs: No gps_path rows to migrate.");
    return;
  }

  const trips = Utils.SplitTripsByGap(gpsPathRows, 30); 
  console.log(`Detected ${trips.length} trips from ${gpsPathRows.length} points.`);

  const insertTrip = db.prepare(
    `INSERT INTO trips (started_at, ended_at, name) VALUES (?, ?, ?)`
  );
  const updatePoint = db.prepare(
    `UPDATE gps_path SET trip_id = ? WHERE id = ?`
  );

  const runMigration = db.transaction((trips) => {
    trips.forEach((trip, index) => {
      if (trip.length === 0) return;

      const startedAt = trip[0].timestamp ?? null;
      const endedAt = trip[trip.length - 1].timestamp ?? null;
      const name = `Legacy Trip ${index + 1}`;

      const result = insertTrip.run(startedAt, endedAt, name);
      const tripId = result.lastInsertRowid;

      trip.forEach((point) => {
        updatePoint.run(tripId, point.id);
      });
    });
  });

  runMigration(trips);
  console.log(`Migration complete: created ${trips.length} trips, updated ${gpsPathRows.length} points.`);
}