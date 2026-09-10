// Back up trip.db to trip.db.<timestamp>.bak — run before deploys.
// Usage: npm run backup
const sqlite = require("better-sqlite3");
const path = require("path");

const sourcePath = process.env.TRIP_DB
    ? path.resolve(process.env.TRIP_DB)
    : path.join(__dirname, "..", "trip.db");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const destPath = `${sourcePath}.${stamp}.bak`;
const db = sqlite(sourcePath);
db.backup(destPath)
    .then(() => {
        console.log(`Backed up ${sourcePath} -> ${destPath}`);
    })
    .catch((err) => {
        console.error("Backup failed:", err);
        process.exitCode = 1;
    })
    .finally(() => {
        try {
            db.close();
        } catch {
            // ignore
        }
    });
