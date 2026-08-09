import L from "leaflet";
import type { PathPoint } from "./mapData";
import { gpsPath } from "../stores/tripStore";
import { routeCoords } from "../stores/appStore";
import { get } from "svelte/store";
import { CHUNKS_PER_TRIP } from "./Constants";
import { getLayerControl } from "./sharedMap";

type PointsWithPx = {
    original: PathPoint;
    px: L.Point;
}[]
export type LatLngTuple = [number, number];
let pathLayerGroup: L.LayerGroup | null = null;

// Convert array of PathPoint to array of LatLngTuple for Leaflet
export function toLatLngPath(pathData: PathPoint[]): LatLngTuple[] {
    return pathData.map((point) => [point.lat, point.lng] as LatLngTuple);
}

// Haversine formula to calculate distance between two lat/lng points in meters
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
    const earthRadius = 6371000;
    const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
    const deltaLat = toRadians(lat2 - lat1);
    const deltaLng = toRadians(lng2 - lng1);
    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(deltaLng / 2) *
        Math.sin(deltaLng / 2);
    return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Split path data into separate trips based on time gaps and distance gaps
export function splitTripsByGap(
    pathData: PathPoint[],
    gapMinutes = 30,
): PathPoint[][] {

    // This should execute always
    const hasTripIds = pathData.every((p) => p.trip_id);

    if (hasTripIds) {
        const grouped = new Map<number, PathPoint[]>();
        pathData.forEach((p) => {
            const key = p.trip_id!;
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key)!.push(p);
        });
        return Array.from(grouped.values());
    }

    // Fallback to gap based splits if trip_id is missing
    const trips: PathPoint[][] = [];
    let currentTrip: PathPoint[] = [];
    const gapMs = gapMinutes * 60 * 1000;
    let previousTimestamp: number | null = null;
    let previousPoint: PathPoint | null = null;

    for (const point of pathData) {
        const nextTimestamp = point.timestamp ? Date.parse(point.timestamp) : Number.NaN;
        let hasGap = false;
    
        if (currentTrip.length > 0) {
            // Split trips if timestamps are longer than gapMinutes (30m)
            if (previousTimestamp !== null && Number.isFinite(nextTimestamp) && (nextTimestamp - previousTimestamp > gapMs)) {
                hasGap = true;
            } else if (previousPoint !== null) {
                // Break trips apart if the distance is larger than (5km)
                const dist = haversineMeters(previousPoint.lat, previousPoint.lng, point.lat, point.lng);
                if (dist > 5000) {
                    hasGap = true;
                }
            }
        }

        if (hasGap) {
            trips.push(currentTrip);
            currentTrip = [];
        }

        currentTrip.push(point);

        if (Number.isFinite(nextTimestamp)) {
            previousTimestamp = nextTimestamp;
        }
        previousPoint = point;
    }

    if (currentTrip.length > 0) {
        trips.push(currentTrip);
    }

    return trips;
}

// Render the trip path on the map, splitting into segments with color gradient
export function renderTripPath(
    map: L.Map,
    pathData: PathPoint[],
    existingLayerGroup: L.LayerGroup | null,
): L.LayerGroup | null {
    const trips = splitTripsByGap(pathData);
    const chunkLayers: L.Polyline[] = [];

    trips.forEach((trip) => {
        if (trip.length < 2) return;
        const simplified = simplifyTripByZoom(map, trip, 3);
        if (simplified.length < 2) return;

        const numChunks = Math.min(CHUNKS_PER_TRIP, simplified.length - 1);
        const chunkSize = Math.ceil(simplified.length / numChunks);

        for (let c = 0; c < numChunks; c++) {
            const start = c * chunkSize;
            const end = Math.min(start + chunkSize + 1, simplified.length);
            const chunkCoords = simplified.slice(start, end);
            if (chunkCoords.length < 2) continue;

            const fraction = numChunks > 1 ? c / (numChunks - 1) : 0;
            const hue = 280 - fraction * 160;

            chunkLayers.push(
                L.polyline(
                    chunkCoords.map((p) => [p.lat, p.lng] as [number, number]),
                    { color: `hsl(${hue}, 100%, 50%)`, weight: 5, smoothFactor: 1 },
                ),
            );
        }
    });

    if (chunkLayers.length === 0) {
        if (existingLayerGroup) map.removeLayer(existingLayerGroup);
        return existingLayerGroup ? null : null;
    }

    if (existingLayerGroup) {
        // Reuse the SAME object so anything referencing it (like the layer control) stays valid
        existingLayerGroup.clearLayers();
        chunkLayers.forEach((line) => existingLayerGroup.addLayer(line));
        return existingLayerGroup; // deliberately NOT calling .addTo(map) — preserves current show/hide state
    }

    // First-ever render: create the group, but don't add to map here —
    // let the caller decide (so it can wire up the layer control first)
    return L.layerGroup(chunkLayers);
}

export function renderPath(map: L.Map) {
    if (pathLayerGroup && !map.hasLayer(pathLayerGroup)) {
        return;
    }

    const isFirstRender = !pathLayerGroup;
    pathLayerGroup = renderTripPath(map, get(gpsPath), pathLayerGroup);

    if (isFirstRender && pathLayerGroup) {
        pathLayerGroup.addTo(map);
        const control = getLayerControl();
        control.addOverlay(pathLayerGroup, "GPS Trip Traces");

        map.on("overlayadd", (e: L.LayersControlEvent) => {
            if (e.layer === pathLayerGroup) {
                renderPath(map);
            }
        });
    }
}

let tripSelectionGroup: L.LayerGroup | null = null;

// Show one or more trips on the map as highlighted traces.
// Returns the bounding box of the shown trips, or null if nothing was shown.
export function showTripsOnMap(map: L.Map, tripIds: number[]): L.LatLngBounds | null {
    const ids = new Set(tripIds);
    const points = get(gpsPath).filter(
        (p) => p.trip_id !== undefined && p.trip_id !== null && ids.has(p.trip_id),
    );

    if (points.length === 0) {
        clearTripsFromMap(map);
        return null;
    }

    const grouped = new Map<number, PathPoint[]>();
    points.forEach((p) => {
        const key = p.trip_id!;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key)!.push(p);
    });

    if (!tripSelectionGroup) {
        tripSelectionGroup = L.layerGroup();
    }
    tripSelectionGroup.clearLayers();

    grouped.forEach((tripPoints) => {
        if (tripPoints.length < 2) return;
        L.polyline(toLatLngPath(tripPoints), {
            color: "#ff8c00",
            weight: 6,
            smoothFactor: 1,
        }).addTo(tripSelectionGroup!);
    });

    if (!map.hasLayer(tripSelectionGroup)) {
        tripSelectionGroup.addTo(map);
    }
    return L.latLngBounds(toLatLngPath(points));
}

export function clearTripsFromMap(map: L.Map) {
    if (tripSelectionGroup && map.hasLayer(tripSelectionGroup)) {
        map.removeLayer(tripSelectionGroup);
    }
    tripSelectionGroup = null;
}

// Highlight a single trip as a navigation route, remembering its coordinates
// for guidance. Returns the bounding box of the route, or null if unavailable.
export function showTripRoute(map: L.Map, tripId: number): L.LatLngBounds | null {
    const points = get(gpsPath).filter((p) => p.trip_id === tripId);
    if (points.length < 2) return null;

    routeCoords.set(points.map((p) => L.latLng(p.lat, p.lng)));
    return showTripsOnMap(map, [tripId]);
}

// Simplify a trip's points using perpendicular distance threshold
export function simplifyTrip(map: L.Map, points: { lat: number; lng: number }[], toleranceMeters = 8): typeof points {
    if (points.length <= 2) return points;

    const latlngs = points.map((p) => L.latLng(p.lat, p.lng));
    const simplified = L.LineUtil.simplify(
        latlngs.map((ll) => map.latLngToLayerPoint(ll)),
        // This is in pixel-space, not meters
        toleranceMeters / 10 
    );
    // Leaflet simplify works in pixel space only
    return simplified.map((pt) => {
        const ll = map.layerPointToLatLng(pt);
        return { lat: ll.lat, lng: ll.lng };
    });
}

function simplifyTripByZoom(
    map: L.Map,
    trip: PathPoint[],
    pixelTolerance = 3
): PathPoint[] {
    if (trip.length <= 2) return trip;

    // Project to screen pixels at current zoom
    const points = trip.map((p) => ({
        original: p,
        px: map.project([p.lat, p.lng], map.getZoom()),
    }));

    return dp(points, pixelTolerance).map((p) => p.original);
}

function perpendicularDistance(p: L.Point, a: L.Point, b: L.Point): number {
    if (a.equals(b)) return p.distanceTo(a);
    const num = Math.abs(
        (b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x
    );
    const den = Math.sqrt((b.y - a.y) ** 2 + (b.x - a.x) ** 2);
    return num / den;
}

function dp(pts: PointsWithPx, tol: number): PointsWithPx {
    if (pts.length <= 2) return pts;
    let maxDist = 0;
    let index = 0;
    for (let i = 1; i < pts.length - 1; i++) {
        const d = perpendicularDistance(pts[i].px, pts[0].px, pts[pts.length - 1].px);
        if (d > maxDist) {
            maxDist = d;
            index = i;
        }
    }
    if (maxDist > tol) {
        const left = dp(pts.slice(0, index + 1), tol);
        const right = dp(pts.slice(index), tol);
        return [...left.slice(0, -1), ...right];
    }
    return [pts[0], pts[pts.length - 1]];
}