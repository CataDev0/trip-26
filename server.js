require("dotenv").config({ "quiet": true });
const express = require("express");
const cors = require("cors");
const sqlite = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const { Utils } = require("./Utils.mjs");
const { initializeDatabase } = require("./Database.mjs");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

// Simple Basic Authentication Middleware
app.use((req, res, next) => {
    const isHome = req.path === "/";
    const isFile = req.path.includes(".");
    const isPublicApi = req.path.startsWith("/api/") && req.method === "GET";
    const isPreflight = req.method === "OPTIONS";

    // Allow unauthenticated access to the homepage, static files, GET API endpoints, and preflight requests
    if (!isHome && !isFile && !isPublicApi && !isPreflight) {
        const b64auth = (req.headers.authorization || "").split(" ")[1] || "";
        const [login, password] = Buffer.from(b64auth, "base64")
            .toString()
            .split(":");

        const expectedUser = process.env.ADMIN_USERNAME || "admin";
        const expectedPass = process.env.ADMIN_PASSWORD || "password";

        if (login === expectedUser && password === expectedPass) {
            return next();
        }

        res.set("WWW-Authenticate", "Basic realm=\"Authentication Required\"");
        res.status(401).send("Authentication required.");
    } else {
        next();
    }
});

app.use(express.static("public"));

const activeVisitors = new Map();

// API endpoint for live visitors
app.get("/api/visitors", (req, res) => {
    const visitorId = req.query.id || req.ip || req.socket.remoteAddress;
    const now = Date.now();
    activeVisitors.set(visitorId, now);

    // Clean up visitors older than 2 minutes (allowing a little buffer over the 1 min polling)
    for (const [vId, lastSeen] of activeVisitors.entries()) {
        if (now - lastSeen > 2 * 60 * 1000) {
            activeVisitors.delete(vId);
        }
    }

    res.json({ count: activeVisitors.size });
});

const db = sqlite("trip.db");

// Initialize database
initializeDatabase(db);

// Seed locations from JSON if database is empty
const count = db.prepare("SELECT COUNT(*) as count FROM locations").get();
if (count.count === 0) {
    try {
        const locationsPath = path.join(__dirname, "locations.json");
        if (fs.existsSync(locationsPath)) {
            const locationsData = fs.readFileSync(locationsPath, "utf8");
            const rawLocations = JSON.parse(locationsData);
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

// API Endpoints

// Get predefined locations
app.get("/api/locations", (req, res) => {
    try {
        const locations = db
            .prepare("SELECT id, name, lat, lng, trip_id FROM locations")
            .all();
        res.json(locations);
    } catch {
        res.status(500).json({ error: "Could not load locations" });
    }
});

// Get visited locations
app.get("/api/visited", (req, res) => {
    const visited = db
        .prepare("SELECT id FROM visited_locations")
        .all()
        .map((row) => row.id);
    res.json(visited);
});

// Mark location as visited
app.post("/api/visited", (req, res) => {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "Missing id" });

    db.prepare("INSERT OR IGNORE INTO visited_locations (id) VALUES (?)").run(id);
    res.json({ success: true });
});

// Save GPS point(s) to the path
app.post("/api/path", (req, res) => {
    try {
        const points = Array.isArray(req.body) ? req.body : [req.body];
        if (points.length === 0) {
            return res.status(400).json({ error: "No points provided" });
        }

        const invalid = points.some(
            (p) => p.lat === undefined || p.lng === undefined || !p.tripId || !p.timestamp
        );
        if (invalid) {
            return res.status(400).json({ error: "Each point requires lat, lng, tripId, and timestamp" });
        }

        const insert = db.prepare(
            "INSERT INTO gps_path (lat, lng, trip_id, current_speed, timestamp) VALUES (?, ?, ?, ?, ?)"
        );
        const insertOrIgnoreTrip = db.prepare(
            "INSERT OR IGNORE INTO trips (id, started_at) VALUES (?, ?)"
        );
        const updateEndedAt = db.prepare(
            "UPDATE trips SET ended_at = ? WHERE id = ? AND (ended_at IS NULL OR ended_at < ?)"
        );

        const runBatch = db.transaction((pts) => {
            const distinctTripIds = [...new Set(pts.map((p) => p.tripId))];
            distinctTripIds.forEach((tripId) => {
                const firstPoint = pts.find((p) => p.tripId === tripId);
                insertOrIgnoreTrip.run(tripId, firstPoint.timestamp);
            });

            const lastPointByTrip = new Map();
            for (const pt of pts) {
                const last = lastPointByTrip.get(pt.tripId);
                if (last) {
                    const distance = Utils.haversineMeters(last.lat, last.lng, pt.lat, pt.lng);
                    if (distance < 3) continue;
                }
                insert.run(pt.lat, pt.lng, pt.tripId, pt.speed ?? null, pt.timestamp);
                lastPointByTrip.set(pt.tripId, { lat: pt.lat, lng: pt.lng });
            }

            distinctTripIds.forEach((tripId) => {
                const tripPoints = pts.filter((p) => p.tripId === tripId);
                const latestTimestamp = tripPoints.reduce((max, p) => (p.timestamp > max ? p.timestamp : max), tripPoints[0].timestamp);
                updateEndedAt.run(latestTimestamp, tripId, latestTimestamp);
            });
        });

        runBatch(points);
        Utils.resetLiveTrackTimer();
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not save points" });
    }
});

// Get the full GPS path
app.get("/api/path", (req, res) => {
    const pathData = db
        .prepare(
            "SELECT * FROM gps_path ORDER BY timestamp ASC",
        )
        .all();
    res.json(pathData);
});

// Replace the full GPS path
app.put("/api/path", (req, res) => {
    const points = req.body;
    if (!Array.isArray(points))
        return res.status(400).json({ error: "Points must be an array" });

    const insert = db.prepare(
        "INSERT INTO gps_path (lat, lng, timestamp) VALUES (?, ?, ?)",
    );

    try {
        db.transaction((pts) => {
            db.prepare("DELETE FROM gps_path").run();
            for (const pt of pts) {
                if (pt.lat !== undefined && pt.lng !== undefined) {
                    // Keep existing timestamp if provided, otherwise it will use default via sqlite although we pass undefined
                    insert.run(pt.lat, pt.lng, pt.timestamp || new Date().toISOString());
                }
            }
        })(points);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not save updated path" });
    }
});

// Get all trips. Include ?trashed=true to list soft-deleted trips instead
app.get("/api/trips", (req, res) => {
    try {
        const { trashed } = req.query;
        const trips = db
            .prepare(
                `
                SELECT t.id, t.started_at, t.ended_at, t.name, t.deleted_at,
                       (SELECT COUNT(*) FROM gps_path p WHERE p.trip_id = t.id) AS point_count
                FROM trips t
                WHERE ${trashed === "true" ? "t.deleted_at IS NOT NULL" : "t.deleted_at IS NULL"}
                ORDER BY t.started_at DESC
                `,
            )
            .all();
        res.json(trips);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not load trips" });
    }
});

// Create a new (empty) trip
app.post("/api/trips", (req, res) => {
    try {
        const { name } = req.body;
        const result = db
            .prepare("INSERT INTO trips (name) VALUES (?)")
            .run(name || "New Trip");
        res.json({ success: true, id: Number(result.lastInsertRowid) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not create trip" });
    }
});

// Update a trip (rename)
app.put("/api/trips/:id", (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: "Missing name" });

        const result = db
            .prepare("UPDATE trips SET name = ? WHERE id = ?")
            .run(name, req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: "Trip not found" });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not update trip" });
    }
});

// Move trips to the trash bin (soft delete)
app.delete("/api/trips", (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: "Missing ids" });
        }

        const placeholders = ids.map(() => "?").join(",");
        const result = db
            .prepare(
                `UPDATE trips SET deleted_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
            )
            .run(...ids);
        res.json({ success: true, moved: result.changes });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not remove trips" });
    }
});

// Restore trips from the trash bin
app.post("/api/trips/restore", (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: "Missing ids" });
        }

        const placeholders = ids.map(() => "?").join(",");
        const result = db
            .prepare(
                `UPDATE trips SET deleted_at = NULL WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`,
            )
            .run(...ids);
        res.json({ success: true, restored: result.changes });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not restore trips" });
    }
});

// Permanently delete trips (and any locations or GPS points belonging to them)
app.post("/api/trips/purge", (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: "Missing ids" });
        }

        const placeholders = ids.map(() => "?").join(",");
        const purge = db.transaction(() => {
            db.prepare(
                `DELETE FROM gps_path WHERE trip_id IN (${placeholders})`,
            ).run(...ids);
            db.prepare(
                `DELETE FROM locations WHERE trip_id IN (${placeholders})`,
            ).run(...ids);
            return db
                .prepare(`DELETE FROM trips WHERE id IN (${placeholders})`)
                .run(...ids).changes;
        });
        const removed = purge();
        res.json({ success: true, removed });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not purge trips" });
    }
});

// Proxy route for HERE Speed Limit
app.get("/api/speed-limit", async (req, res) => {
    const { lat, lng } = req.query;
    if (!lat || !lng)
        return res.status(400).json({ error: "Missing lat or lng" });

    try {
        const apiKey = process.env.HERE_API_KEY;
        if (!apiKey || apiKey === "YOUR_HERE_API_KEY") {
            return res.json({ speedLimit: null });
        }

        const url = new URL("https://revgeocode.search.hereapi.com/v1/revgeocode");
        url.searchParams.set("at", `${lat},${lng}`);
        url.searchParams.set("showNavAttributes", "speedLimits");
        url.searchParams.set("apikey", apiKey);

        const response = await fetch(url);
        const data = await response.json();

        let speedLimit = null;
        if (data.items && data.items.length > 0) {
            speedLimit = data.items[0].navigationAttributes?.speedLimits[0]?.maxSpeed || null;
        }

        res.json({ speedLimit });
    } catch (error) {
        console.error("Speed limit proxy error:", error);
        res.status(500).json({ error: "Failed to fetch speed limit" });
    }
});

// Update locations based on UI edits
app.post("/api/locations", (req, res) => {
    try {
        const newLocations = req.body;
        const insert = db.prepare(
            "INSERT INTO locations (id, name, lat, lng, trip_id) VALUES (?, ?, ?, ?, ?)",
        );

        // Clear and insert
        db.transaction((locs) => {
            db.prepare("DELETE FROM locations").run();
            for (const loc of locs) {
                if (loc.name && loc.lat !== undefined && loc.lng !== undefined) {
                    // If it has an existing ID, keep it, else let sqlite generate one
                    if (loc.id !== undefined) {
                        insert.run(loc.id, loc.name, loc.lat, loc.lng, loc.trip_id ?? null);
                    } else {
                        db.prepare(
                            "INSERT INTO locations (name, lat, lng, trip_id) VALUES (?, ?, ?, ?)",
                        ).run(loc.name, loc.lat, loc.lng, loc.trip_id ?? null);
                    }
                }
            }
        })(newLocations);

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not save locations" });
    }
});

// Add a single location -
// used for saving attractions
app.put("/api/locations/single", (req, res) => {
    try {
        const loc = req.body;
        if (!loc.name || loc.lat === undefined || loc.lng === undefined) {
            return res.status(400).json({ error: "Missing name, lat, or lng" });
        }

        const insert = db.prepare(
            "INSERT INTO locations (id, name, lat, lng, trip_id) VALUES (?, ?, ?, ?, ?)",
        );
        let result;

        // If it has an existing ID, keep it, else let sqlite generate one
        if (loc.id !== undefined) {
            result = insert.run(loc.id, loc.name, loc.lat, loc.lng, loc.trip_id ?? null);
        } else {
            result = db.prepare(
                "INSERT INTO locations (name, lat, lng, trip_id) VALUES (?, ?, ?, ?)",
            ).run(loc.name, loc.lat, loc.lng, loc.trip_id ?? null);
        }

        // Return the ID of the inserted location as a string to avoid parsing bigint
        res.json({ success: true, id: String(result.lastInsertRowid) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not save location" });
    }
});

// Splice out messy GPS history section based on ID bounds
app.delete("/api/path/splice", (req, res) => {
    const { startId, endId } = req.body;
    if (!startId || !endId) return res.status(400).json({ error: "Missing startId or endId" });

    try {
        // Sort IDs to allow backward/forward selection
        const bounds = [startId, endId].sort((a, b) => a - b);
        const result = db.prepare("DELETE FROM gps_path WHERE id >= ? AND id <= ?").run(bounds[0], bounds[1]);

        res.json({ success: true, removed: result.changes });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not splice path" });
    }
});

// Send last GPS point for live tracking
app.get("/api/live-tracking", (req, res) => {
    if (!Utils.isLiveTracking) {
        return res.status(404).json({ error: "Live Tracking is not available" });
    }

    try {
        const lastPoint = db
            .prepare("SELECT lat, lng FROM gps_path ORDER BY timestamp DESC LIMIT 1")
            .get();
        if (lastPoint) {
            res.json({ lat: lastPoint.lat, lng: lastPoint.lng });
        } else {
            res.status(404).json({ error: "Live Tracking last point not available" });
        }
    } catch {
        res.status(500).json({ error: "Could not fetch live tracking data" });
    }
});

// SPA fallback for frontend router
app.use((req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log("Server is running: http://localhost:" + PORT);
});
