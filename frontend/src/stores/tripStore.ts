import { writable } from "svelte/store";
import { PathPoint } from "../helpers/mapData";

export interface Trip {
    id: number;
    started_at?: string | null;
    ended_at?: string | null;
    name?: string | null;
    deleted_at?: string | null;
    point_count?: number;
}

export const gpsPath = writable<PathPoint[]>([]);
export const isTracking = writable(false);
export const autoFollow = writable(true);
export const gpsStatus = writable("Not tracking");
export const currentSpeedKmH = writable<number | null>(null);
export const currentSpeedLimit = writable<number | null>(null);

export const trips = writable<Trip[]>([]);
export const trashedTrips = writable<Trip[]>([]);
export const selectedTripIds = writable<Set<number>>(new Set());