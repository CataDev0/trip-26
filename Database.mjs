import { Utils } from './Utils.mjs'
import fs from "fs"
import path from 'path';

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

  // Locations can optionally belong to a trip
  addColumnIfMissing(db, 'locations', 'trip_id', 'INTEGER REFERENCES trips(id)');

  // Soft-deleted trips end up in the trash bin
  addColumnIfMissing(db, 'trips', 'deleted_at', 'DATETIME');

  // Trips can be hidden from public viewing
  addColumnIfMissing(db, 'trips', 'hidden', 'INTEGER NOT NULL DEFAULT 0');

  if (!columnExists(db, 'gps_path', 'trip_id')) {
    db.prepare(`ALTER TABLE gps_path ADD COLUMN trip_id INTEGER REFERENCES trips(id)`).run();
    migrateTripIds(db);
  }
  addColumnIfMissing(db, 'gps_path', 'current_speed', 'INTEGER');

  db.prepare(`CREATE INDEX IF NOT EXISTS idx_gps_path_trip_id ON gps_path(trip_id)`).run();

  // Drop visited marks pointing at locations that no longer exist
  db.prepare(`DELETE FROM visited_locations WHERE id NOT IN (SELECT id FROM locations)`).run();

  normalizeTimestamps(db);
  seedLocations(db);
}

/**
 * Seed locations from JSON if database is empty and locations.json is populated
 * @param {import('better-sqlite3').Database} db
 */
function seedLocations(db) {
  const locationsPath = path.join(path.dirname("."), "locations.json");
  if (fs.existsSync(locationsPath)) {
    const locationsData = fs.readFileSync(locationsPath, "utf8");
    const rawLocations = JSON.parse(locationsData);
    if (Array.isArray(rawLocations) && rawLocations.length > 0) {
      const count = db.prepare("SELECT COUNT(*) as count FROM locations").get();
      if (count.count === 0) {
        try {
          if (fs.existsSync(locationsPath)) {
            const insert = db.prepare(
              "INSERT INTO locations (name, lat, lng) VALUES (?, ?, ?)",
            );
            const insertMultiple = db.transaction((locs) => {
              for (const loc of locs) {
                if (loc.name && loc.lat && loc.lng) {
                  insert.run(loc.name, loc.lat, loc.lng);
                }
              }
            });
            insertMultiple(rawLocations);
            console.log("Seeded database with locations.json");
          }
        } catch (e) {
          console.error("Error seeding database:", e);
        }
      }
    }
  }
}

/**
 * One-time, idempotent migration: convert legacy "YYYY-MM-DD HH:MM:SS" timestamps
 * (SQLite CURRENT_TIMESTAMP format) to ISO 8601 so string ordering is correct.
 * @param {import('better-sqlite3').Database} db
 */
function normalizeTimestamps(db) {
  const tables = [
    ['gps_path', 'timestamp'],
    ['trips', 'started_at'],
    ['trips', 'ended_at'],
    ['trips', 'deleted_at'],
  ];

  for (const [table, column] of tables) {
    const updated = db.prepare(
      `UPDATE ${table} SET ${column} = substr(${column}, 1, 10) || 'T' || substr(${column}, 12) || 'Z' WHERE instr(${column}, 'T') = 0 AND length(${column}) >= 19`
    ).run();
    if (updated.changes > 0) {
      console.log(`Normalize timestamps: converted ${updated.changes} ${table}.${column} rows to ISO 8601.`);
    }
  }
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
