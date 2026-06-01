import { API_BASE } from "./Constants";

export interface LocationData {
  id: number;
  name: string;
  lat: number;
  lng: number;
  imageUrl?: string;
}

export interface PathPoint {
  id?: number;
  lat: number;
  lng: number;
  timestamp?: string;
}

export interface MapBootstrapData {
  locations: LocationData[];
  visitedIds: Set<number>;
  pathData: PathPoint[];
}

export async function loadMapBootstrapData(): Promise<MapBootstrapData> {
  const [locationsRes, visitedRes, pathRes] = await Promise.all([
    fetch(API_BASE + "/api/locations"),
    fetch(API_BASE + "/api/visited"),
    fetch(API_BASE + "/api/path"),
  ]);

  if (!locationsRes.ok) {
    throw new Error("Failed to load locations");
  }

  if (!visitedRes.ok) {
    throw new Error("Failed to load visited locations");
  }

  if (!pathRes.ok) {
    throw new Error("Failed to load path data");
  }

  const [locations, visited, pathData] = await Promise.all([
    locationsRes.json(),
    visitedRes.json(),
    pathRes.json(),
  ]);

  return {
    locations,
    visitedIds: new Set(visited),
    pathData,
  };
}
