require("dotenv").config();
const express = require("express");
const cors = require("cors");
const sqlite = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const os = require("os");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

function haversineMeters(lat1, lng1, lat2, lng2) {
    const earthRadius = 6371000;
    const toRadians = (degrees) => (degrees * Math.PI) / 180;
    const deltaLat = toRadians(lat2 - lat1);
    const deltaLng = toRadians(lng2 - lng1);
    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(toRadians(lat1)) *
    Math.cos(toRadians(lat2)) *
    Math.sin(deltaLng / 2) *
    Math.sin(deltaLng / 2);
    return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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
            .prepare("SELECT id, name, lat, lng FROM locations")
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

// Save a GPS point(s) to the path
app.post("/api/path", (req, res) => {
    const points = Array.isArray(req.body) ? req.body : [req.body];
    if (points.length === 0)
        return res.status(400).json({ error: "No points provided" });

    const insert = db.prepare("INSERT INTO gps_path (lat, lng) VALUES (?, ?)");
    const lastRow = db
        .prepare("SELECT lat, lng FROM gps_path ORDER BY id DESC LIMIT 1")
        .get();
    let lastLat = lastRow ? lastRow.lat : null;
    let lastLng = lastRow ? lastRow.lng : null;
    const insertMany = db.transaction((pts) => {
        for (const pt of pts) {
            if (pt.lat !== undefined && pt.lng !== undefined) {
                if (lastLat !== null && lastLng !== null) {
                    const distance = haversineMeters(lastLat, lastLng, pt.lat, pt.lng);
                    if (distance < 5) {
                        continue;
                    }
                }

                insert.run(pt.lat, pt.lng);
                lastLat = pt.lat;
                lastLng = pt.lng;
            }
        }
    });

    insertMany(points);
    res.json({ success: true });
});

// Get the full GPS path
app.get("/api/path", (req, res) => {
    const pathData = db
        .prepare(
            "SELECT id, lat, lng, timestamp FROM gps_path ORDER BY timestamp ASC",
        )
        .all();
    res.json(pathData);
});

// Math helpers for DP
function segDistSq(pt, p1, p2) {
    let x = p1.lat;
    let y = p1.lng;
    let dx = p2.lat - x;
    let dy = p2.lng - y;

    if (dx !== 0 || dy !== 0) {
        const t = ((pt.lat - x) * dx + (pt.lng - y) * dy) / (dx * dx + dy * dy);
        if (t > 1) {
            x = p2.lat;
            y = p2.lng;
        } else if (t > 0) {
            x += dx * t;
            y += dy * t;
        }
    }

    dx = pt.lat - x;
    dy = pt.lng - y;

    // Scale longitude by cos(latitude)
    const latRad = pt.lat * (Math.PI / 180);
    dy = dy * Math.cos(latRad);

    return dx * dx + dy * dy;
}

// Douglas-Peucker simplification
function simplifyDPStep(points, first, last, sqTolerance, keptSet) {
    let maxSqDist = sqTolerance;
    let index = -1;

    for (let i = first + 1; i < last; i++) {
        const sqDist = segDistSq(points[i], points[first], points[last]);
        if (sqDist > maxSqDist) {
            index = i;
            maxSqDist = sqDist;
        }
    }

    if (maxSqDist > sqTolerance) {
        if (index - first > 1)
            simplifyDPStep(points, first, index, sqTolerance, keptSet);
        keptSet.add(points[index].id);
        if (last - index > 1)
            simplifyDPStep(points, index, last, sqTolerance, keptSet);
    }
}

function simplifyDP(points, distanceThresholdMeters) {
    if (points.length <= 2) return new Set(points.map((p) => p.id));

    const tolDegrees = distanceThresholdMeters / 111320;
    const sqTolerance = tolDegrees * tolDegrees;

    const keptSet = new Set();
    const last = points.length - 1;

    keptSet.add(points[0].id);
    simplifyDPStep(points, 0, last, sqTolerance, keptSet);
    keptSet.add(points[last].id);

    return keptSet;
}

// Normalize the GPS path: simplifies points using Douglas-Peucker inside selection bounds
app.post("/api/path/normalize", (req, res) => {
    const bounds = req.body.bounds; // optional: { minLat, maxLat, minLng, maxLng }
    const distanceThreshold = req.body.distance || 30;

    const points = db
        .prepare("SELECT id, lat, lng FROM gps_path ORDER BY timestamp ASC")
        .all();
    if (points.length < 2) return res.json({ success: true, removed: 0 });

    let removed = 0;
    const deleteStmt = db.prepare("DELETE FROM gps_path WHERE id = ?");

    let currentSegment = [];

    const processSegment = () => {
        if (currentSegment.length <= 2) return;
        const kept = simplifyDP(currentSegment, distanceThreshold);
        for (const pt of currentSegment) {
            if (!kept.has(pt.id)) {
                deleteStmt.run(pt.id);
                removed++;
            }
        }
    };

    db.transaction(() => {
        for (let i = 0; i < points.length; i++) {
            const pt = points[i];

            let inBounds = true;
            if (bounds) {
                inBounds =
                    pt.lat >= bounds.minLat &&
          pt.lat <= bounds.maxLat &&
          pt.lng >= bounds.minLng &&
          pt.lng <= bounds.maxLng;
            }

            if (inBounds) {
                currentSegment.push(pt);
            } else {
                if (currentSegment.length > 0) {
                    // To ensure DP connects perfectly, we theoretically need to include
                    // the bounding outside points as constraints, but just doing it
                    // on the inside sequence is usually enough.
                    processSegment();
                    currentSegment = [];
                }
            }
        }
        if (currentSegment.length > 0) processSegment();
    })();

    res.json({ success: true, removed });
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

        // Node.js 18+ has native fetch
        const response = await fetch(url);
        const data = await response.json();

        let speedLimit = null;
        if (data.routes && data.routes.length > 0) {
            const spans = data.routes[0].sections[0].spans;
            if (spans && spans.length > 0 && spans[0].speedLimit) {
                speedLimit = Math.round(spans[0].speedLimit * 3.6);
            }
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
            "INSERT INTO locations (id, name, lat, lng) VALUES (?, ?, ?, ?)",
        );

        // Clear and insert
        db.transaction((locs) => {
            db.prepare("DELETE FROM locations").run();
            for (const loc of locs) {
                if (loc.name && loc.lat !== undefined && loc.lng !== undefined) {
                    // If it has an existing ID, keep it, else let sqlite generate one
                    if (loc.id !== undefined) {
                        insert.run(loc.id, loc.name, loc.lat, loc.lng);
                    } else {
                        db.prepare(
                            "INSERT INTO locations (name, lat, lng) VALUES (?, ?, ?)",
                        ).run(loc.name, loc.lat, loc.lng);
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
app.post("/api/locations/single", (req, res) => {
    try {
        const { name, lat, lng } = req.body;
        if (!name || lat === undefined || lng === undefined) {
            return res.status(400).json({ error: "Missing name, lat, or lng" });
        }
        const info = db
            .prepare("INSERT INTO locations (name, lat, lng) VALUES (?, ?, ?)")
            .run(name, lat, lng);
        res.json({ success: true, id: info.lastInsertRowid });
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

// SPA fallback for frontend router
app.use((req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
    const nets = os.networkInterfaces();
    const results = [];
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
            if (net.family === "IPv4" && !net.internal) {
                results.push(net.address);
            }
        }
    }
    const localIp = results.length > 0 ? results[0] : "localhost";

    console.log(`Server is running locally at http://localhost:${PORT}`);
    console.log(`Access on your phone using   http://${localIp}:${PORT}`);
});
