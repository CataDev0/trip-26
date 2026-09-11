import L from "leaflet";
import type { PathPoint } from "./mapData";
import { gpsPath, highlightedTripIds } from "../stores/tripStore";
import { routeCoords } from "../stores/appStore";
import { get } from "svelte/store";
import { MAX_SEGMENTS_PER_TRIP, MAX_TRACE_POINTS, MIN_TRACE_TOLERANCE_PX } from "./Constants";
import { getLayerControl } from "./sharedMap";
import { fillSpeedGaps, speedColor, timeColor } from "./traceColor";

type PointsWithPx = {
    original: PathPoint;
    px: L.Point;
}[]
export type LatLngTuple = [number, number];
let pathLayerGroup: L.LayerGroup | null = null;

// Shared canvas renderer for all gradient trace segments. One renderer
// instance redraws every segment in a single 2D context, which scales
// much better than thousands of SVG nodes. Map.getRenderer auto-adds it
// to the map when the first segment is rendered, and it stays on the map
// (it is a map layer, not a group member) when segments are rebuilt.
let sharedTraceRenderer: L.Canvas | null = null;

function getSharedTraceRenderer(): L.Canvas {
    if (!sharedTraceRenderer) {
        sharedTraceRenderer = L.canvas();
    }
    return sharedTraceRenderer;
}

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

        // Map raw points to their index so segments can look up
        // speed / fraction along the trip (simplification returns the same
        // object references, so lookups work).
        const rawIndex = new Map<PathPoint, number>();
        trip.forEach((p, i) => rawIndex.set(p, i));

        // null => legacy trip with no speed data => time-based gradient
        const speeds = fillSpeedGaps(trip.map((p) => p.current_speed ?? null));

        const simplified = simplifyTripByBudget(map, trip);
        if (simplified.length < 2) return;

        const n = simplified.length;

        // Segments connect adjacent simplified points — the budget search above
        // already picked the best-representing points for this zoom
        for (let start = 0; start < n - 1; start += 1) {
            const end = start + 1;
            const a = simplified[start];
            const b = simplified[end];
            if (a.lat === b.lat && a.lng === b.lng) continue;

            let color: string;
            if (speeds) {
                // Average speed over the span, so long low-zoom segments
                // represent the whole stretch they cover.
                const i0 = rawIndex.get(a)!;
                const i1 = rawIndex.get(b)!;
                let sum = 0;
                for (let i = i0; i <= i1; i++) sum += speeds[i];
                color = speedColor(sum / (i1 - i0 + 1));
            } else {
                // Time-based fallback: fraction along the raw trip
                color = timeColor(rawIndex.get(a)! / (trip.length - 1));
            }

            chunkLayers.push(
                L.polyline(
                    [[a.lat, a.lng], [b.lat, b.lng]] as LatLngTuple[],
                    {
                        color,
                        weight: 5,
                        smoothFactor: 1,
                        renderer: getSharedTraceRenderer(),
                        interactive: false,
                    },
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

    // Re-render the trip selection so it stays above the re-optimized traces
    reRenderTripSelection(map);
}

let tripSelectionGroup: L.LayerGroup | null = null;
let shownTripIds: number[] = [];

const TRIP_SELECTION_PANE = "trip-selection-pane";

// Dedicated pane for the highlighted trip selection. 
// Z-index above the overlay pane at 400, so the highlight can never be covered by traces
// Markers (600), tooltips (650) popups (700) 
function getTripSelectionPane(map: L.Map): HTMLElement {
    let pane = map.getPane(TRIP_SELECTION_PANE);
    if (!pane) {
        pane = map.createPane(TRIP_SELECTION_PANE);
        const parent = map.getPane("rotatePane") || map.getPane("mapPane");
        parent?.appendChild(pane);
        pane.style.zIndex = "450";
        pane.style.pointerEvents = "none";
    }
    return pane;
}

// Render the trip with a highlight
function addHighlightPolyline(group: L.LayerGroup, coords: LatLngTuple[]) {
    // Outer glow
    L.polyline(coords, {
        color: "#ff8c00",
        weight: 14,
        opacity: 0.3,
        smoothFactor: 1,
        pane: TRIP_SELECTION_PANE,
    }).addTo(group);
    // White casing
    L.polyline(coords, {
        color: "#ffffff",
        weight: 9,
        opacity: 1,
        smoothFactor: 1,
        pane: TRIP_SELECTION_PANE,
    }).addTo(group);
    // Main orange line
    L.polyline(coords, {
        color: "#ff8c00",
        weight: 5,
        opacity: 1,
        smoothFactor: 1,
        pane: TRIP_SELECTION_PANE,
    }).addTo(group);
}

function renderTripSelection(map: L.Map, tripIds: number[]): L.LatLngBounds | null {
    const ids = new Set(tripIds);
    const points = get(gpsPath).filter(
        (p) => p.trip_id !== undefined && p.trip_id !== null && ids.has(p.trip_id),
    );

    if (points.length === 0) {
        clearTripsFromMap(map);
        return null;
    }

    getTripSelectionPane(map);

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
        const simplified = simplifyTripByTolerance(map, tripPoints, 3);
        if (simplified.length < 2) return;
        addHighlightPolyline(tripSelectionGroup!, toLatLngPath(simplified));

        // Start and end markers for this trip
        const start = tripPoints[0];
        const end = tripPoints[tripPoints.length - 1];
        L.circleMarker([start.lat, start.lng], {
            radius: 7,
            color: "#ffffff",
            weight: 2,
            fillColor: "#28a745",
            fillOpacity: 1,
            pane: TRIP_SELECTION_PANE,
        }).bindTooltip("Start", { "permanent": true }).openTooltip().addTo(tripSelectionGroup!);
        L.circleMarker([end.lat, end.lng], {
            radius: 7,
            color: "#ffffff",
            weight: 2,
            fillColor: "#dc3545",
            fillOpacity: 1,
            pane: TRIP_SELECTION_PANE,
        }).bindTooltip("End", { "permanent": true }).openTooltip().addTo(tripSelectionGroup!);
    });

    if (!map.hasLayer(tripSelectionGroup)) {
        tripSelectionGroup.addTo(map);
    }
    return L.latLngBounds(toLatLngPath(points));
}

// Re-render the currently shown trip highlight (e.g. after a zoom change
// re-optimized the GPS traces beneath it).
function reRenderTripSelection(map: L.Map) {
    if (tripSelectionGroup && shownTripIds.length > 0) {
        renderTripSelection(map, shownTripIds);
    }
}

// Show one or more trips on the map as highlighted traces.
// Returns the bounding box of the shown trips, or null if nothing was shown.
export function showTripsOnMap(map: L.Map, tripIds: number[]): L.LatLngBounds | null {
    shownTripIds = [...tripIds];
    const bounds = renderTripSelection(map, tripIds);
    if (bounds) {
        highlightedTripIds.set([...tripIds]);
    }
    return bounds;
}

export function clearTripsFromMap(map: L.Map) {
    if (tripSelectionGroup && map.hasLayer(tripSelectionGroup)) {
        map.removeLayer(tripSelectionGroup);
    }
    tripSelectionGroup = null;
    shownTripIds = [];
    highlightedTripIds.set([]);
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

function perpendicularDistance(p: L.Point, a: L.Point, b: L.Point): number {
    if (a.equals(b)) return p.distanceTo(a);
    const num = Math.abs(
        (b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x
    );
    const den = Math.sqrt((b.y - a.y) ** 2 + (b.x - a.x) ** 2);
    return num / den;
}

// Iterative Douglas-Peucker. When maxPoints is given, aborts as soon as more
// than maxPoints points would be kept and returns null — this makes budget
// searches cheap because oversized runs stop early
function dpIterative(pts: PointsWithPx, tol: number, maxPoints?: number): PointsWithPx | null {
    if (pts.length <= 2) return pts;

    const kept = new Set<PointsWithPx[number]>();
    kept.add(pts[0]);
    kept.add(pts[pts.length - 1]);

    const stack: Array<[number, number]> = [[0, pts.length - 1]];
    while (stack.length > 0) {
        const [first, last] = stack.pop()!;
        let maxDist = tol;
        let index = -1;
        for (let i = first + 1; i < last; i++) {
            const d = perpendicularDistance(pts[i].px, pts[first].px, pts[last].px);
            if (d > maxDist) {
                maxDist = d;
                index = i;
            }
        }
        if (index !== -1) {
            kept.add(pts[index]);
            if (maxPoints !== undefined && kept.size > maxPoints) {
                return null;
            }
            stack.push([first, index]);
            stack.push([index, last]);
        }
    }

    return pts.filter((p) => kept.has(p));
}

function projectToPixels(map: L.Map, trip: PathPoint[]): PointsWithPx {
    return trip.map((p) => ({
        original: p,
        px: map.project([p.lat, p.lng], map.getZoom()),
    }));
}

// Simplify with a fixed pixel tolerance — keeps whatever fits the tolerance
function simplifyTripByTolerance(
    map: L.Map,
    trip: PathPoint[],
    pixelTolerance: number,
): PathPoint[] {
    if (trip.length <= 2) return trip;

    const result = dpIterative(projectToPixels(map, trip), pixelTolerance);
    return result ? result.map((p) => p.original) : trip;
}

// Simplify a trip for the speed-colored traces. The point budget scales with
// the trip's pixel size at the current zoom, so pixel-level detail stays
// roughly constant at every zoom. A fixed budget instead renders the same
// coarse shape at all zooms: fine far out, but ruinously low-detail zoomed in.
function simplifyTripByBudget(map: L.Map, trip: PathPoint[]): PathPoint[] {
    if (trip.length <= 2) return trip;

    const points = projectToPixels(map, trip);

    // A trip N pixels across needs at most ~N/6 vertices to stay within a few
    // pixels of the true path
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const { px } of points) {
        if (px.x < minX) minX = px.x;
        if (px.x > maxX) maxX = px.x;
        if (px.y < minY) minY = px.y;
        if (px.y > maxY) maxY = px.y;
    }
    const diagonalPx = Math.hypot(maxX - minX, maxY - minY);
    const maxPoints = Math.min(
        MAX_TRACE_POINTS,
        Math.max(MAX_SEGMENTS_PER_TRIP, Math.ceil(diagonalPx / 6)),
    );

    if (trip.length <= maxPoints) return trip;

    let tolerance = MIN_TRACE_TOLERANCE_PX;
    while (true) {
        const result = dpIterative(points, tolerance, maxPoints);
        if (result) {
            return result.map((p) => p.original);
        }
        tolerance *= 2;
        if (tolerance > 1e6) {
            // Degenerate input — fall back to an even sample
            const stride = Math.ceil(trip.length / maxPoints);
            return trip.filter((_, i) => i % stride === 0 || i === trip.length - 1);
        }
    }
}