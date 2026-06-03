import L from "leaflet";
import type { PathPoint } from "./mapData";
import { gpsPath } from "../stores/tripStore";
import { get } from "svelte/store";

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
    const trips: PathPoint[][] = [];
    let currentTrip: PathPoint[] = [];
    const gapMs = gapMinutes * 60 * 1000;
    let previousTimestamp: number | null = null;
    let previousPoint: PathPoint | null = null;

    for (const point of pathData) {
        const nextTimestamp = point.timestamp ? Date.parse(point.timestamp) : Number.NaN;
        let hasGap = false;
    
        if (currentTrip.length > 0) {
            if (previousTimestamp !== null && Number.isFinite(nextTimestamp) && (nextTimestamp - previousTimestamp > gapMs)) {
                hasGap = true;
            } else if (previousPoint !== null) {
                // Break trips apart if the gap is larger than 50km
                const dist = haversineMeters(previousPoint.lat, previousPoint.lng, point.lat, point.lng);
                if (dist > 50000) {
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
    if (existingLayerGroup) {
        map.removeLayer(existingLayerGroup);
    }

    const trips = splitTripsByGap(pathData);
    if (trips.length === 0) {
        return null;
    }

    const segments: L.Polyline[] = [];

    trips.forEach((trip) => {
        if (trip.length < 2) {
            return;
        }

        for (let i = 0; i < trip.length - 1; i++) {
            const fraction = i / (trip.length - 1);
            const hue = 280 - fraction * 160;
            segments.push(
                L.polyline([[trip[i].lat, trip[i].lng], [trip[i + 1].lat, trip[i + 1].lng]], {
                    color: `hsl(${hue}, 100%, 50%)`,
                    weight: 5,
                }),
            );
        }
    });

    if (segments.length === 0) {
        return null;
    }

    return L.layerGroup(segments).addTo(map);
}

export function renderPath(map: L.Map) {
    pathLayerGroup = renderTripPath(map, get(gpsPath), pathLayerGroup) ?? null;
}