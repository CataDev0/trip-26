import { writable } from "svelte/store";
import { PathPoint } from "../helpers/mapData";

export const gpsPath = writable<PathPoint[]>([]);
export const isTracking = writable(false);
export const autoFollow = writable(true);
export const gpsStatus = writable("Not tracking");
export const currentSpeedKmH = writable<number | null>(null);
export const currentSpeedLimit = writable<number | null>(null);