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
}