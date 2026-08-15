require("dotenv").config({ "quiet": true });

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error(
        "Missing ADMIN_USERNAME or ADMIN_PASSWORD in .env — refusing to start with insecure defaults.",
    );
    process.exit(1);
}
if (ADMIN_PASSWORD.length < 8) {
    console.warn("WARNING: ADMIN_PASSWORD is shorter than 8 characters.");
}
if (ADMIN_PASSWORD === ADMIN_USERNAME) {
    console.warn("WARNING: ADMIN_PASSWORD equals ADMIN_USERNAME.");
}

const express = require("express");
const cors = require("cors");
const sqlite = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const rateLimit = require("express-rate-limit");
const { Utils } = require("./Utils.mjs");
const { initializeDatabase } = require("./Database.mjs");

const app = express();
app.set("trust proxy", Number(process.env.TRUST_PROXY || 0));

if (process.env.CORS_ORIGINS) {
    app.use(cors({ origin: process.env.CORS_ORIGINS.split(",") }));
}
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "25mb" }));
// Explicit allowlist of public GET endpoints. Everything else under /api
// requires HTTP Basic auth — fail closed, no heuristics.
const PUBLIC_GET_PATHS = new Set([
    "/api/path",
    "/api/trips",
    "/api/locations",
    "/api/visited",
    "/api/live-tracking",
    "/api/visitors",
]);

// True when the request carries valid Basic auth credentials — used both by
// the middleware and by public GET handlers that serve extra data when authed
function isAuthenticatedRequest(req) {
    const b64auth = (req.headers.authorization || "").split(" ")[1] || "";
    const [login, password] = Buffer.from(b64auth, "base64")
        .toString()
        .split(":");

    return login === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

// Simple Basic Authentication Middleware
app.use((req, res, next) => {
    const isApi = req.path.startsWith("/api/");
    const isPreflight = req.method === "OPTIONS";
    const isPublicGet = isApi && req.method === "GET" && PUBLIC_GET_PATHS.has(req.path);

    if (!isApi || isPreflight || isPublicGet || isAuthenticatedRequest(req)) {
        return next();
    }

    res.set("WWW-Authenticate", "Basic realm=\"Authentication Required\"");
    res.status(401).send("Authentication required.");
});

// Rate limiting: one tier for public GETs, one for authenticated writes
const publicGetLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_PUBLIC_PER_MIN) || 120,
    standardHeaders: true,
    legacyHeaders: false,
});
const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_WRITE_PER_MIN) || 30,
    standardHeaders: true,
    legacyHeaders: false,
});
const speedLimitLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_SPEED_PER_MIN) || 30,
    standardHeaders: true,
    legacyHeaders: false,
});

app.use("/api", (req, res, next) => {
    const limiter = req.method === "GET" ? publicGetLimiter : writeLimiter;
    limiter(req, res, next);
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

const db = sqlite(process.env.TRIP_DB || "trip.db");
db.pragma("foreign_keys = ON");

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

// Get predefined locations — locations belonging to hidden trips are only
// included for authenticated requests
app.get("/api/locations", (req, res) => {
    try {
        const locations = isAuthenticatedRequest(req)
            ? db
                .prepare("SELECT id, name, lat, lng, trip_id FROM locations")
                .all()
            : db
                .prepare(
                    `SELECT id, name, lat, lng, trip_id FROM locations
                     WHERE trip_id IS NULL OR trip_id NOT IN (SELECT id FROM trips WHERE hidden = 1)`,
                )
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
        const findTrip = db.prepare("SELECT id FROM trips WHERE id = ?");
        const insertTrip = db.prepare(
            "INSERT INTO trips (id, started_at) VALUES (?, ?)"
        );
        const updateEndedAt = db.prepare(
            "UPDATE trips SET ended_at = ? WHERE id = ? AND (ended_at IS NULL OR ended_at < ?)"
        );

        // Client-generated trip ids (Date.now()) can collide with AUTOINCREMENT
        // rowids — remap to the actual trip id used for this batch
        const runBatch = db.transaction((pts) => {
            const distinctTripIds = [...new Set(pts.map((p) => p.tripId))];
            const actualTripIds = new Map();

            distinctTripIds.forEach((tripId) => {
                if (findTrip.get(tripId)) {
                    actualTripIds.set(tripId, tripId);
                    return;
                }
                const firstPoint = pts.find((p) => p.tripId === tripId);
                try {
                    insertTrip.run(tripId, firstPoint.timestamp);
                    actualTripIds.set(tripId, tripId);
                } catch {
                    // AUTOINCREMENT already handed out this id — allocate a fresh one
                    const result = db.prepare(
                        "INSERT INTO trips (started_at) VALUES (?)",
                    ).run(firstPoint.timestamp);
                    actualTripIds.set(tripId, Number(result.lastInsertRowid));
                }
            });

            const lastPointByTrip = new Map();
            for (const pt of pts) {
                const last = lastPointByTrip.get(pt.tripId);
                if (last) {
                    const distance = Utils.haversineMeters(last.lat, last.lng, pt.lat, pt.lng);
                    if (distance < 3) continue;
                }
                insert.run(pt.lat, pt.lng, actualTripIds.get(pt.tripId), pt.speed ?? null, pt.timestamp);
                lastPointByTrip.set(pt.tripId, { lat: pt.lat, lng: pt.lng });
            }

            distinctTripIds.forEach((tripId) => {
                const tripPoints = pts.filter((p) => p.tripId === tripId);
                const latestTimestamp = tripPoints.reduce((max, p) => (p.timestamp > max ? p.timestamp : max), tripPoints[0].timestamp);
                updateEndedAt.run(latestTimestamp, actualTripIds.get(tripId), latestTimestamp);
            });

            return actualTripIds;
        });

        const actualTripIds = runBatch(points);
        Utils.resetLiveTrackTimer();
        res.json({ success: true, tripIds: Object.fromEntries(actualTripIds) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not save points" });
    }
});

// Get the full GPS path (optionally filtered to a single trip).
// Points of hidden trips are only included for authenticated requests.
app.get("/api/path", (req, res) => {
    const { trip_id } = req.query;
    const includeHidden = isAuthenticatedRequest(req);

    let pathData;
    if (trip_id !== undefined) {
        pathData = db
            .prepare("SELECT * FROM gps_path WHERE trip_id = ? ORDER BY timestamp ASC")
            .all(trip_id);
        if (!includeHidden) {
            const trip = db.prepare("SELECT hidden FROM trips WHERE id = ?").get(trip_id);
            if (trip && trip.hidden) {
                pathData = [];
            }
        }
    } else if (includeHidden) {
        pathData = db
            .prepare("SELECT * FROM gps_path ORDER BY timestamp ASC")
            .all();
    } else {
        pathData = db
            .prepare(
                `SELECT * FROM gps_path
                 WHERE trip_id IS NULL OR trip_id NOT IN (SELECT id FROM trips WHERE hidden = 1)
                 ORDER BY timestamp ASC`,
            )
            .all();
    }

    // Data only changes while actively tracking; lets browsers skip re-fetching.
    // Vary on Authorization so authed responses are never served from the public cache
    res.set("Cache-Control", "public, max-age=30");
    res.set("Vary", "Authorization");
    res.json(pathData);
});

// Replace the full GPS path — preserves trip_id and current_speed where provided,
// and backfills trip_id for new vertices from the nearest preceding point
app.put("/api/path", (req, res) => {
    const points = req.body;
    if (!Array.isArray(points))
        return res.status(400).json({ error: "Points must be an array" });

    const insert = db.prepare(
        "INSERT INTO gps_path (lat, lng, timestamp, trip_id, current_speed) VALUES (?, ?, ?, ?, ?)",
    );

    try {
        db.transaction((pts) => {
            db.prepare("DELETE FROM gps_path").run();

            let lastTripId = null;
            for (const pt of pts) {
                if (pt.lat !== undefined && pt.lng !== undefined) {
                    // Points without a trip_id (newly drawn vertices) inherit the
                    // most recent trip_id seen so far in the batch
                    const tripId = pt.trip_id ?? lastTripId;
                    insert.run(
                        pt.lat,
                        pt.lng,
                        pt.timestamp || new Date().toISOString(),
                        tripId,
                        pt.current_speed ?? null,
                    );
                    if (tripId !== null) {
                        lastTripId = tripId;
                    }
                }
            }
        })(points);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not save updated path" });
    }
});

// Get all trips. Include ?trashed=true to list soft-deleted trips instead.
// Hidden trips are only included for authenticated requests.
app.get("/api/trips", (req, res) => {
    try {
        const { trashed } = req.query;
        const includeHidden = isAuthenticatedRequest(req);
        const trips = db
            .prepare(
                `
                SELECT t.id, t.started_at, t.ended_at, t.name, t.deleted_at, t.hidden,
                       (SELECT COUNT(*) FROM gps_path p WHERE p.trip_id = t.id) AS point_count
                FROM trips t
                WHERE ${trashed === "true" ? "t.deleted_at IS NOT NULL" : "t.deleted_at IS NULL"}
                  AND ${includeHidden ? "1=1" : "(t.hidden IS NULL OR t.hidden = 0)"}
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
            .prepare("INSERT INTO trips (name, started_at) VALUES (?, ?)")
            .run(name || "New Trip", new Date().toISOString());
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

// Hide a trip from public viewing (or show it again)
app.post("/api/trips/:id/hidden", (req, res) => {
    try {
        const { hidden } = req.body;
        if (typeof hidden !== "boolean") {
            return res.status(400).json({ error: "Missing hidden (boolean)" });
        }

        const result = db
            .prepare("UPDATE trips SET hidden = ? WHERE id = ?")
            .run(hidden ? 1 : 0, req.params.id);
        if (result.changes === 0) return res.status(404).json({ error: "Trip not found" });

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not update trip visibility" });
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
                `UPDATE trips SET deleted_at = ? WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
            )
            .run(new Date().toISOString(), ...ids);
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
            db.prepare(
                "DELETE FROM visited_locations WHERE id NOT IN (SELECT id FROM locations)",
            ).run();
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

// Proxy route for HERE Speed Limit — requires auth (paid API key, tracker only)
app.get("/api/speed-limit", speedLimitLimiter, async (req, res) => {
    const { lat, lng } = req.query;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (
        !Number.isFinite(latNum) || !Number.isFinite(lngNum) ||
        latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180
    ) {
        return res.status(400).json({ error: "Missing or invalid lat or lng" });
    }

    try {
        const apiKey = process.env.HERE_API_KEY;
        if (!apiKey || apiKey === "YOUR_HERE_API_KEY") {
            return res.json({ speedLimit: null });
        }

        const url = new URL("https://revgeocode.search.hereapi.com/v1/revgeocode");
        url.searchParams.set("at", `${latNum},${lngNum}`);
        url.searchParams.set("showNavAttributes", "speedLimits");
        url.searchParams.set("apikey", apiKey);

        const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
        const data = await response.json();

        let speedLimit = null;
        if (data.items && data.items.length > 0) {
            speedLimit = data.items[0].navigationAttributes?.speedLimits[0]?.maxSpeed || null;
        }

        res.json({ speedLimit });
    } catch (error) {
        console.error("Speed limit proxy error:", error);
        res.status(502).json({ error: "Failed to fetch speed limit" });
    }
});

// Update locations based on UI edits — upserts each location so existing ids
// (and the visited_locations references pointing at them) are preserved
app.post("/api/locations", (req, res) => {
    try {
        const newLocations = req.body;
        if (!Array.isArray(newLocations)) {
            return res.status(400).json({ error: "Locations must be an array" });
        }

        const findLoc = db.prepare("SELECT id FROM locations WHERE id = ?");
        const updateLoc = db.prepare(
            "UPDATE locations SET name = ?, lat = ?, lng = ?, trip_id = ? WHERE id = ?",
        );
        const insertLoc = db.prepare(
            "INSERT INTO locations (name, lat, lng, trip_id) VALUES (?, ?, ?, ?)",
        );

        db.transaction((locs) => {
            const keptIds = [];
            for (const loc of locs) {
                if (!loc.name || loc.lat === undefined || loc.lng === undefined) {
                    continue;
                }

                if (loc.id !== undefined && loc.id !== null && findLoc.get(loc.id)) {
                    updateLoc.run(loc.name, loc.lat, loc.lng, loc.trip_id ?? null, loc.id);
                    keptIds.push(loc.id);
                } else {
                    const result = insertLoc.run(loc.name, loc.lat, loc.lng, loc.trip_id ?? null);
                    keptIds.push(Number(result.lastInsertRowid));
                }
            }

            // Remove locations that are no longer part of the set
            if (keptIds.length > 0) {
                const placeholders = keptIds.map(() => "?").join(",");
                db.prepare(
                    `DELETE FROM locations WHERE id NOT IN (${placeholders})`,
                ).run(...keptIds);
            }
        })(newLocations);

        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not save locations" });
    }
});

// Add or update a single location -
// used for saving attractions
app.put("/api/locations/single", (req, res) => {
    try {
        const loc = req.body;
        if (!loc.name || loc.lat === undefined || loc.lng === undefined) {
            return res.status(400).json({ error: "Missing name, lat, or lng" });
        }

        const findLoc = db.prepare("SELECT id FROM locations WHERE id = ?");
        let id;

        // Update an existing location if the id is known, else insert a new one
        if (loc.id !== undefined && loc.id !== null && findLoc.get(loc.id)) {
            db.prepare(
                "UPDATE locations SET name = ?, lat = ?, lng = ?, trip_id = ? WHERE id = ?",
            ).run(loc.name, loc.lat, loc.lng, loc.trip_id ?? null, loc.id);
            id = loc.id;
        } else {
            const result = db.prepare(
                "INSERT INTO locations (name, lat, lng, trip_id) VALUES (?, ?, ?, ?)",
            ).run(loc.name, loc.lat, loc.lng, loc.trip_id ?? null);
            id = result.lastInsertRowid;
        }

        // Return the ID as a string to avoid parsing bigint
        res.json({ success: true, id: String(id) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not save location" });
    }
});

// Splice out messy GPS history section based on ID bounds within a single trip
app.delete("/api/path/splice", (req, res) => {
    const { startId, endId, tripId } = req.body;
    if (!startId || !endId || tripId === undefined || tripId === null) {
        return res.status(400).json({ error: "Missing startId, endId, or tripId" });
    }

    try {
        // Sort IDs to allow backward/forward selection
        const bounds = [Number(startId), Number(endId)].sort((a, b) => a - b);
        const result = db
            .prepare("DELETE FROM gps_path WHERE trip_id = ? AND id >= ? AND id <= ?")
            .run(tripId, bounds[0], bounds[1]);

        res.json({ success: true, removed: result.changes });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Could not splice path" });
    }
});

// Send last GPS point for live tracking — hidden when the active trip is
// hidden and the request is unauthenticated
app.get("/api/live-tracking", (req, res) => {
    if (!Utils.isLiveTracking) {
        return res.status(404).json({ error: "Live Tracking is not available" });
    }

    try {
        const lastPoint = db
            .prepare(
                `SELECT p.lat, p.lng, t.hidden AS trip_hidden
                 FROM gps_path p
                 LEFT JOIN trips t ON t.id = p.trip_id
                 ORDER BY p.timestamp DESC LIMIT 1`,
            )
            .get();
        if (lastPoint) {
            if (lastPoint.trip_hidden && !isAuthenticatedRequest(req)) {
                return res.status(404).json({ error: "Live Tracking is not available" });
            }
            res.json({ lat: lastPoint.lat, lng: lastPoint.lng });
        } else {
            res.status(404).json({ error: "Live Tracking last point not available" });
        }
    } catch {
        res.status(500).json({ error: "Could not fetch live tracking data" });
    }
});

// Fail closed: unregistered API routes must 404, never fall through to the SPA
app.use("/api", (req, res) => {
    res.status(404).json({ error: "Not found" });
});

// SPA fallback for frontend router
app.use((req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    console.log("Server is running: http://localhost:" + PORT);
});
