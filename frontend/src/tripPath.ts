import L from "leaflet";
import type { PathPoint } from "./mapData";

export type LatLngTuple = [number, number];

export function toLatLngPath(pathData: PathPoint[]): LatLngTuple[] {
  return pathData.map((point) => [point.lat, point.lng] as LatLngTuple);
}

function splitTripsByGap(
  pathData: PathPoint[],
  gapMinutes = 30,
): LatLngTuple[][] {
  const trips: LatLngTuple[][] = [];
  let currentTrip: LatLngTuple[] = [];
  const gapMs = gapMinutes * 60 * 1000;
  let previousTimestamp: number | null = null;

  for (const point of pathData) {
    const nextTimestamp = point.timestamp ? Date.parse(point.timestamp) : Number.NaN;
    const hasGap =
      currentTrip.length > 0 &&
      previousTimestamp !== null &&
      Number.isFinite(nextTimestamp) &&
      nextTimestamp - previousTimestamp > gapMs;

    if (hasGap) {
      trips.push(currentTrip);
      currentTrip = [];
    }

    currentTrip.push([point.lat, point.lng]);

    if (Number.isFinite(nextTimestamp)) {
      previousTimestamp = nextTimestamp;
    }
  }

  if (currentTrip.length > 0) {
    trips.push(currentTrip);
  }

  return trips;
}

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
        L.polyline([trip[i], trip[i + 1]], {
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
